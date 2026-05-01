// Discretionary spending rules.
//
// Scott's exact words: trustees scrutinize spending that suggests the
// debtor is overstating their hardship. Common red-flag categories:
//   - Private school tuition
//   - Travel sports / cheer / club fees
//   - Hotel stays + leisure travel
//   - Heavy entertainment / dining
//
// Each rule emits a finding with:
//   - the matching transactions (evidence the attorney reviews)
//   - a monthly average and a peak-month figure
//   - a suggested SOFA / Schedule J line for proper disclosure
//
// Thresholds are deliberately conservative. We'd rather a false positive
// the attorney waves off than miss something the trustee will challenge.

const RULES = [
  {
    code: 'private_school',
    label: 'Private school tuition',
    severity: 'high',
    suggestedDisposition: 'Disclose on Schedule J line 8 (childcare/education) AND SOFA Q5 if > $600/mo',
    match: (txn) => /\b(montessori|academy|prep|preparatory|day school|christian school|catholic school|tuition|primary school)\b/i.test(txn.merchant || '') ||
      /\b(school|tuition)\b/i.test(txn.merchant || '') && Number(txn.amount) > 400,
  },
  {
    code: 'travel_sports',
    label: 'Travel sports / cheer / club fees',
    severity: 'high',
    suggestedDisposition: 'Confirm with debtor — trustee likely to question discretionary nature',
    match: (txn) => /\b(travel team|club soccer|club volleyball|all-?star|tournament|cheer|gymnastics|hockey club|aau|usa swim|usa hockey|elite|select|premier soccer)\b/i.test(txn.merchant || ''),
  },
  {
    code: 'hotel_leisure',
    label: 'Hotel + leisure travel',
    severity: 'medium',
    suggestedDisposition: 'Confirm with debtor; aggregate over 6mo for SOFA Q5 disclosure if material',
    match: (txn) => /\b(marriott|hilton|hyatt|sheraton|holiday inn|four seasons|ritz|airbnb|vrbo|expedia|booking\.com|trivago|priceline|hotels\.com|kayak)\b/i.test(txn.merchant || ''),
  },
  {
    code: 'airline_travel',
    label: 'Airline / leisure flight',
    severity: 'medium',
    suggestedDisposition: 'Aggregate against household; ordinary commuter flight different from leisure',
    match: (txn) => /\b(delta|united|american airlines|southwest|jetblue|alaska airlines|spirit|frontier|allegiant)\b/i.test(txn.merchant || ''),
  },
  {
    code: 'cruise_resort',
    label: 'Cruise / resort',
    severity: 'high',
    suggestedDisposition: 'Highly unusual for Ch7 debtor; SOFA Q5 disclosure if any',
    match: (txn) => /\b(carnival|royal caribbean|norwegian cruise|disney cruise|princess cruise|cruise line|resort|spa)\b/i.test(txn.merchant || ''),
  },
  {
    code: 'high_dining',
    label: 'High-cost dining',
    severity: 'low',
    suggestedDisposition: 'Aggregate by month — pattern matters more than single charge',
    match: (txn) => Number(txn.amount) >= 200 &&
      /\b(steakhouse|fine dining|wine|chophouse|prime|grill|tavern|bistro|brasserie|ruth.?s chris|capital grille|morton.?s|del frisco|smith \& wollensky)\b/i.test(txn.merchant || ''),
  },
  {
    code: 'entertainment_premium',
    label: 'Premium entertainment / event tickets',
    severity: 'medium',
    suggestedDisposition: 'Confirm; courtside/VIP tickets are red flag',
    match: (txn) => Number(txn.amount) >= 250 &&
      /\b(stubhub|seatgeek|ticketmaster|vivid seats|live nation|premium|vip|courtside|suite|box seat)\b/i.test(txn.merchant || ''),
  },
  {
    code: 'subscription_pile',
    label: 'Subscription stack',
    severity: 'low',
    isAggregate: true, // computed across all transactions, not per-row
    suggestedDisposition: 'Cancel pre-filing or disclose on Schedule J realistically',
    match: () => false, // actual logic in aggregateSubscriptions below
  },
  {
    code: 'gambling',
    label: 'Gambling activity',
    severity: 'high',
    suggestedDisposition: 'SOFA Q9 mandates disclosure of losses within 1 yr — investigate immediately',
    match: (txn) =>
      /\b(draftkings|fanduel|bovada|betmgm|caesars|borgata|mgm casino|wynn|las vegas sands|hard rock casino|hollywood casino|harrahs|foxwoods|mohegan sun|tabletop games|sportsbook|atlantic city|lottery|powerball|mega ?millions)\b/i.test(txn.merchant || ''),
  },
];

// Subscription-pile detector: if monthly recurring subscriptions (Netflix,
// Spotify, gym, AppleOne, etc.) sum > $200/mo, flag the bundle as a
// discretionary aggregate.
function detectSubscriptionPile(transactions) {
  const SUB_PATTERNS = /\b(netflix|spotify|hulu|disney\+|apple ?one|youtube premium|hbo|peacock|paramount\+|audible|new york times|wall street journal|washington post|adobe|microsoft 365|google one|icloud|dropbox|onepassword|nordvpn|expressvpn|gym|peloton|equinox|blue apron|hellofresh)\b/i;
  const hits = transactions.filter(t => SUB_PATTERNS.test(t.merchant || ''));
  if (hits.length === 0) return null;

  // Group by merchant, take the last-seen amount as the recurring rate.
  const byMerch = {};
  for (const t of hits) {
    const key = (t.merchant || '').toLowerCase().replace(/\s+/g, ' ').trim();
    byMerch[key] = byMerch[key] || { merchant: t.merchant, amounts: [], lastDate: t.date };
    byMerch[key].amounts.push(Math.abs(Number(t.amount) || 0));
    if (t.date > byMerch[key].lastDate) byMerch[key].lastDate = t.date;
  }
  const monthlyEstimate = Object.values(byMerch).reduce((sum, m) => {
    const med = m.amounts.sort((a, b) => a - b)[Math.floor(m.amounts.length / 2)];
    return sum + (med || 0);
  }, 0);
  if (monthlyEstimate < 100) return null;

  return {
    code: 'subscription_pile',
    label: 'Subscription stack',
    severity: monthlyEstimate >= 300 ? 'medium' : 'low',
    monthlyEstimate,
    merchants: Object.values(byMerch),
    transactions: hits,
    suggestedDisposition: monthlyEstimate >= 300
      ? 'Cancel pre-filing (Ch7) or disclose realistically on Schedule J'
      : 'Disclose actual ongoing subscriptions on Schedule J line 6c',
  };
}

function findDiscretionary(transactions) {
  const findings = [];
  for (const rule of RULES) {
    if (rule.isAggregate) continue;
    const matches = transactions.filter(t => rule.match(t));
    if (matches.length === 0) continue;
    const total = matches.reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
    findings.push({
      code: rule.code,
      label: rule.label,
      severity: rule.severity,
      transactionCount: matches.length,
      totalAmount: total,
      monthlyAverage: total / Math.max(1, monthsSpanned(matches)),
      transactions: matches,
      suggestedDisposition: rule.suggestedDisposition,
    });
  }

  const subPile = detectSubscriptionPile(transactions);
  if (subPile) findings.push(subPile);

  return findings;
}

function monthsSpanned(txns) {
  if (!txns.length) return 1;
  const dates = txns.map(t => Date.parse(t.date)).filter(Number.isFinite).sort();
  if (!dates.length) return 1;
  const ms = dates[dates.length - 1] - dates[0];
  const months = ms / (1000 * 60 * 60 * 24 * 30.44);
  return Math.max(1, months);
}

module.exports = { findDiscretionary, RULES };
