// Plaid integration — main-process module.
//
// Phase 1 scaffold (this file):
//   - Link token creation + public→access exchange
//   - Initial /accounts/get + /transactions/sync
//   - Encrypted at-rest storage of access tokens via Electron safeStorage
//   - List + disconnect (item/remove)
//
// Out of scope here (phase 2+):
//   - Auto-write to income_receipts / manual_deductions
//     (income-detector + expense-classifier produce drafts; the attorney
//      reviews and accepts in the renderer before persistence)
//   - OAuth-required institution redirect handling
//   - Webhooks
//
// All sensitive operations stay in the main process. The renderer never
// sees an access_token.

const { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } = require('plaid');
const { safeStorage } = require('electron');

// ─── Configuration ─────────────────────────────────────────────
function isConfigured() {
  return !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

function getClient() {
  if (!isConfigured()) {
    throw new Error('Plaid is not configured. Set PLAID_CLIENT_ID and PLAID_SECRET in .env.');
  }
  const env = process.env.PLAID_ENV || 'sandbox';
  if (!PlaidEnvironments[env]) {
    throw new Error(`Unknown PLAID_ENV: ${env} (expected sandbox|development|production)`);
  }
  return new PlaidApi(new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET':    process.env.PLAID_SECRET,
        'Plaid-Version':   '2020-09-14',
      },
    },
  }));
}

function configuredProducts() {
  const raw = process.env.PLAID_PRODUCTS || 'transactions,identity,liabilities';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function configuredCountries() {
  const raw = process.env.PLAID_COUNTRY_CODES || 'US';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

// ─── Encryption helpers ────────────────────────────────────────
// Access tokens are persistent credentials that read bank data. They are
// encrypted at rest via the OS keychain (macOS Keychain / Windows
// Credential Manager / GNOME Keyring) using Electron's safeStorage API.
function encryptAccessToken(plaintext) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'OS encryption is not available on this platform (no Keychain / Credential Manager / libsecret). ' +
      'Refusing to store Plaid access tokens in plaintext.'
    );
  }
  return safeStorage.encryptString(plaintext);
}

function decryptAccessToken(buffer) {
  return safeStorage.decryptString(buffer);
}

// ─── Public API ────────────────────────────────────────────────

/**
 * Create a Link token for the renderer. Returns the link_token string.
 * The renderer passes this to <PlaidLink token={...}>.
 */
async function createLinkToken({ caseId, redirectUri }) {
  const client = getClient();
  const res = await client.linkTokenCreate({
    user: { client_user_id: caseId },
    client_name: 'Tabula',
    products: configuredProducts(),
    country_codes: configuredCountries(),
    language: 'en',
    ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    ...(process.env.PLAID_WEBHOOK ? { webhook: process.env.PLAID_WEBHOOK } : {}),
  });
  return res.data.link_token;
}

/**
 * Exchange a Link public_token for an access_token + persist it.
 * Pulls the account list immediately so the renderer can render a
 * "Connected" state without a second round-trip.
 *
 * Returns: { itemId, institutionName, accountCount }
 */
async function exchangePublicToken({ db, caseId, publicToken, metadata }) {
  const { v4: uuid } = require('uuid');
  const client = getClient();

  const exch = await client.itemPublicTokenExchange({ public_token: publicToken });
  const accessToken = exch.data.access_token;
  const plaidItemId = exch.data.item_id;

  const encrypted = encryptAccessToken(accessToken);
  const itemRowId = uuid();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO plaid_items
      (id, case_id, plaid_item_id, access_token_encrypted,
       institution_id, institution_name, cursor, status, consent_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, 'active', ?)
  `).run(
    itemRowId, caseId, plaidItemId, encrypted,
    metadata?.institution?.institution_id || null,
    metadata?.institution?.name || 'Unknown institution',
    now
  );

  // Pull accounts immediately
  const accountsRes = await client.accountsGet({ access_token: accessToken });
  const insertAccount = db.prepare(`
    INSERT OR IGNORE INTO plaid_accounts
      (id, item_id, plaid_account_id, name, official_name, type, subtype,
       mask, current_balance, available_balance)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const a of accountsRes.data.accounts) {
    insertAccount.run(
      uuid(), itemRowId, a.account_id,
      a.name || null, a.official_name || null,
      a.type || null, a.subtype || null,
      a.mask || null,
      a.balances?.current ?? null, a.balances?.available ?? null
    );
  }

  return {
    itemId: itemRowId,
    institutionName: metadata?.institution?.name || 'Unknown institution',
    accountCount: accountsRes.data.accounts.length,
  };
}

/**
 * Sync transactions for an item using /transactions/sync.
 * Returns { added, modified, removed, hasMore }.
 *
 * Idempotent: each call resumes from the persisted cursor. The first
 * call after exchange returns the historical 6-24 months Plaid has on
 * file; subsequent calls return only deltas.
 */
async function syncItemTransactions({ db, itemRowId }) {
  const { v4: uuid } = require('uuid');
  const client = getClient();
  const item = db.prepare('SELECT * FROM plaid_items WHERE id = ?').get(itemRowId);
  if (!item) throw new Error(`Plaid item ${itemRowId} not found`);

  const accessToken = decryptAccessToken(item.access_token_encrypted);
  const accountIdMap = new Map(
    db.prepare('SELECT id, plaid_account_id FROM plaid_accounts WHERE item_id = ?')
      .all(itemRowId)
      .map(a => [a.plaid_account_id, a.id])
  );

  let cursor = item.cursor;
  let added = [], modified = [], removed = [];
  let hasMore = true;

  while (hasMore) {
    const res = await client.transactionsSync({
      access_token: accessToken,
      cursor: cursor || undefined,
    });
    added.push(...res.data.added);
    modified.push(...res.data.modified);
    removed.push(...res.data.removed);
    cursor = res.data.next_cursor;
    hasMore = res.data.has_more;
  }

  const insertTxn = db.prepare(`
    INSERT INTO plaid_transactions
      (id, account_id, plaid_transaction_id, date, authorized_date,
       amount, iso_currency_code, name, merchant_name, pending,
       category_primary, category_detailed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(plaid_transaction_id) DO UPDATE SET
      amount = excluded.amount,
      name = excluded.name,
      merchant_name = excluded.merchant_name,
      pending = excluded.pending,
      category_primary = excluded.category_primary,
      category_detailed = excluded.category_detailed
  `);
  const deleteTxn = db.prepare('DELETE FROM plaid_transactions WHERE plaid_transaction_id = ?');

  const txn = db.transaction(() => {
    for (const t of [...added, ...modified]) {
      const accountRowId = accountIdMap.get(t.account_id);
      if (!accountRowId) continue; // account we don't know about — shouldn't happen
      insertTxn.run(
        uuid(), accountRowId, t.transaction_id,
        t.date, t.authorized_date || null,
        t.amount, t.iso_currency_code || null,
        t.name || null, t.merchant_name || null,
        t.pending ? 1 : 0,
        t.personal_finance_category?.primary || null,
        t.personal_finance_category?.detailed || null
      );
    }
    for (const r of removed) {
      deleteTxn.run(r.transaction_id);
    }
    db.prepare('UPDATE plaid_items SET cursor = ?, last_synced_at = ? WHERE id = ?')
      .run(cursor, new Date().toISOString(), itemRowId);
  });
  txn();

  return {
    added: added.length,
    modified: modified.length,
    removed: removed.length,
    hasMore: false,
  };
}

/**
 * Disconnect (revoke) an item. Calls Plaid /item/remove and zeroes the
 * access token in our DB. Item rows + accounts + transactions remain
 * for audit purposes; the access_token_encrypted column is cleared.
 */
async function disconnectItem({ db, itemRowId }) {
  const client = getClient();
  const item = db.prepare('SELECT * FROM plaid_items WHERE id = ?').get(itemRowId);
  if (!item) return { alreadyGone: true };
  if (item.status === 'revoked') return { alreadyGone: true };

  const accessToken = decryptAccessToken(item.access_token_encrypted);
  try {
    await client.itemRemove({ access_token: accessToken });
  } catch (err) {
    console.warn('[plaid] /item/remove failed (continuing to clear local token):', err.message);
  }
  db.prepare(`
    UPDATE plaid_items
    SET status = 'revoked', access_token_encrypted = x'00'
    WHERE id = ?
  `).run(itemRowId);
  return { revoked: true };
}

/**
 * Read view: list every connected item for a case + their accounts +
 * a transaction count. Used to render the "Connected banks" card.
 */
function listForCase({ db, caseId }) {
  const items = db.prepare(`
    SELECT id, plaid_item_id, institution_id, institution_name,
           status, consent_at, last_synced_at, error_code
    FROM plaid_items
    WHERE case_id = ?
    ORDER BY consent_at DESC
  `).all(caseId);
  if (items.length === 0) return [];

  const itemIds = items.map(i => i.id);
  const placeholders = itemIds.map(() => '?').join(',');
  const accounts = db.prepare(`
    SELECT * FROM plaid_accounts WHERE item_id IN (${placeholders})
  `).all(...itemIds);
  const txnCounts = db.prepare(`
    SELECT a.item_id, COUNT(t.id) AS count
    FROM plaid_transactions t
    JOIN plaid_accounts a ON a.id = t.account_id
    WHERE a.item_id IN (${placeholders})
    GROUP BY a.item_id
  `).all(...itemIds);
  const countMap = new Map(txnCounts.map(r => [r.item_id, r.count]));

  return items.map(it => ({
    ...it,
    accounts: accounts.filter(a => a.item_id === it.id),
    transactionCount: countMap.get(it.id) || 0,
  }));
}

module.exports = {
  isConfigured,
  createLinkToken,
  exchangePublicToken,
  syncItemTransactions,
  disconnectItem,
  listForCase,
};
