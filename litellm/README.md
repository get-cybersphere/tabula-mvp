# Tabula LiteLLM Proxy

Self-hosted LLM proxy that sits between Tabula (the Electron app) and Anthropic.

## Why

- **Audit trail** — every API call is logged to Postgres for compliance
- **Defense-in-depth PII masking** — Presidio runs on message text as a second layer after local visual redaction
- **Key abstraction** — the Electron app never holds the real Anthropic key, only a local LiteLLM master key
- **Pluggable provider** — can swap Anthropic for Azure OpenAI, Bedrock, on-prem, etc. without changing app code

## Run it

```bash
cd litellm
cp .env.example .env         # fill in ANTHROPIC_API_KEY
docker compose up -d
```

Proxy is now at `http://localhost:4000`.

## Verify

```bash
curl http://localhost:4000/health \
  -H "Authorization: Bearer sk-tabula-dev-local"
```

## Point the Electron app at it

In the project root `.env`:

```
ANTHROPIC_API_KEY=sk-tabula-dev-local        # now a LiteLLM key, not real Anthropic
ANTHROPIC_BASE_URL=http://localhost:4000     # routes SDK calls through proxy
```

The `@anthropic-ai/sdk` respects `baseURL`, so no code change is needed beyond the env var.

## Stop

```bash
docker compose down          # preserves audit logs
docker compose down -v       # wipes Postgres volume (destroys audit history)
```

## Logs

Request/response logs live in the `postgres` volume. Query with:

```bash
docker exec -it tabula-litellm-db psql -U litellm -d litellm \
  -c "SELECT id, model, status, created_at FROM \"LiteLLM_SpendLogs\" ORDER BY created_at DESC LIMIT 20;"
```
