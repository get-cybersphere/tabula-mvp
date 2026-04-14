# Deploying the Tabula LiteLLM Proxy (Render, Free Tier)

> **Purpose of this doc**
> This is a fully self-contained, step-by-step guide for deploying the shared LiteLLM proxy so every teammate's Electron app can point at one hosted endpoint instead of `localhost:4000`. It is written to be handed to an AI coding agent (Claude, Cursor, Devin, etc.) who will execute the steps, *or* followed manually by a human.
>
> **What is being deployed?** The LiteLLM proxy only — **not** the Electron app. The Electron app continues to run locally on each teammate's laptop. The proxy is the one shared piece of infrastructure.
>
> **Why Render?** Render has a genuine free tier for both web services and Postgres, requires no credit card to start, and supports deploying from a Dockerfile and blueprint file already committed in this repo. Railway's free plan is credit-based and less predictable for a broke team. GitHub Pages cannot host backend services and is not an option.

---

## Table of contents

1. [Architecture overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [One-time setup: Render account](#3-one-time-setup-render-account)
4. [Deploy with the Render Blueprint](#4-deploy-with-the-render-blueprint)
5. [Paste the required secrets](#5-paste-the-required-secrets)
6. [Verify the deployment](#6-verify-the-deployment)
7. [Point the Electron app at the shared proxy](#7-point-the-electron-app-at-the-shared-proxy)
8. [Share access with the team](#8-share-access-with-the-team)
9. [Known free-tier limitations](#9-known-free-tier-limitations)
10. [Troubleshooting](#10-troubleshooting)
11. [Appendix: files an agent should never modify](#11-appendix-files-an-agent-should-never-modify)

---

## 1. Architecture overview

```
┌────────────────────────┐         ┌─────────────────────────┐        ┌──────────────┐
│  Electron app          │         │  LiteLLM proxy          │        │  Anthropic   │
│  (local on each laptop)│ ──────► │  (hosted on Render,     │ ─────► │  API         │
│                        │  HTTPS  │   free tier, shared)    │ HTTPS  │              │
│  uses LITELLM_BASE_URL │         │                         │        │              │
│  + LITELLM_MASTER_KEY  │         │  holds ANTHROPIC_API_KEY│        │              │
└────────────────────────┘         └─────────────────────────┘        └──────────────┘
                                              │
                                              ▼
                                   ┌─────────────────────────┐
                                   │  Postgres (Render free) │
                                   │  audit log of requests  │
                                   └─────────────────────────┘
```

Key properties:

- The **Anthropic API key only lives in Render's environment variables.** No teammate needs a copy.
- The Electron app authenticates to the proxy with `LITELLM_MASTER_KEY`, which is safe to share inside the team.
- Every request is logged to Postgres for audit (compliance-friendly).

---

## 2. Prerequisites

Before anything else, confirm the following. If any are missing, **stop** and go get them.

| Requirement | Who provides it | How to check |
|---|---|---|
| GitHub account with push access to this repo | Team member doing the deploy | Can you `git push` to `origin/main`? |
| Render account (free) | Team member doing the deploy | Sign up at <https://render.com> with GitHub login |
| **Real Anthropic API key** (`sk-ant-...`) | Founder / whoever owns the Anthropic account | Must start with `sk-ant-` and come from <https://console.anthropic.com/settings/keys> |
| Strong random `LITELLM_MASTER_KEY` | Generate on the spot | See [Step 5](#5-paste-the-required-secrets) below |
| Strong random `LITELLM_SALT_KEY` | Generate on the spot | See [Step 5](#5-paste-the-required-secrets) below |

> **Non-negotiable:** There is no free workaround for the Anthropic API key. LiteLLM is a proxy, not a model. Without a real key the deployment will return 401s for every extraction request. If no key is available, deploy anyway and tell the team "flow works, extraction returns 401 until a key is added" — then the key can be pasted in later with no redeploy required.

---

## 3. One-time setup: Render account

If the operator doing the deploy does not yet have a Render account:

1. Go to <https://render.com/register>.
2. Click **Sign up with GitHub**.
3. Authorize Render to read the repositories you want to deploy from. At minimum, authorize the repo containing this file (`get-cybersphere/tabula-mvp` or the relevant fork).
4. When prompted about billing, skip it — Render's free tier does not require a credit card.

---

## 4. Deploy with the Render Blueprint

This repo ships with two files that make deployment a one-click operation:

- `litellm/render.yaml` — declares the web service, the free Postgres database, and which env vars are required
- `litellm/Dockerfile` — wraps the official LiteLLM image with our `config.yaml` baked in

### 4a. Confirm the files are on the branch Render will deploy from

From the repo root:

```bash
git status
ls litellm/render.yaml litellm/Dockerfile litellm/config.yaml
```

All three files must be present and committed. If not, commit and push them before continuing:

```bash
git add litellm/render.yaml litellm/Dockerfile
git commit -m "Add Render deployment config for LiteLLM proxy"
git push origin main
```

### 4b. Create the Blueprint in Render

1. Go to <https://dashboard.render.com/blueprints>.
2. Click **New Blueprint Instance**.
3. Choose the repo (`tabula-mvp`) and the branch (usually `main`).
4. Render will auto-detect `litellm/render.yaml`. Confirm it shows:
   - A web service named `tabula-litellm`
   - A Postgres database named `tabula-litellm-db`
5. Click **Apply**.

Render will start building the Docker image and provisioning the database. The first build takes 3–6 minutes. **Do not** set secrets yet — the service will boot-loop until Step 5, which is expected.

---

## 5. Paste the required secrets

Three environment variables must be added by hand in the Render dashboard. They are intentionally not in the repo.

### 5a. Generate the two keys locally

On any Mac/Linux terminal:

```bash
# LITELLM_MASTER_KEY — shared with the team; format is 'sk-' + random
echo "sk-$(openssl rand -hex 24)"

# LITELLM_SALT_KEY — internal only, never shared
openssl rand -hex 32
```

Copy each output. **Save them somewhere now** — you will paste them into Render and the team Slack/1Password in a moment.

### 5b. Obtain the Anthropic API key

This must come from whoever controls the team's Anthropic account:

1. They go to <https://console.anthropic.com/settings/keys>.
2. Click **Create Key**.
3. Name it e.g. `tabula-render-proxy`.
4. Copy the `sk-ant-...` value. Anthropic does not show it a second time.

### 5c. Paste all three into Render

1. In Render, open the `tabula-litellm` web service.
2. Go to the **Environment** tab.
3. For each of these three keys, click **Add Environment Variable** (or edit the pre-existing stub), paste the value, and save:
   - `ANTHROPIC_API_KEY` → the `sk-ant-...` value
   - `LITELLM_MASTER_KEY` → the `sk-...` you generated
   - `LITELLM_SALT_KEY` → the hex string you generated
4. Render will automatically redeploy the service when you save env changes. Wait until the status goes from "Deploying" to "Live" (~2 minutes).

> **Do not** commit any of these values to git. The `render.yaml` file uses `sync: false` which tells Render the operator will fill these in the dashboard only.

---

## 6. Verify the deployment

Render assigns the service a URL like `https://tabula-litellm.onrender.com`. Use that URL wherever you see `<RENDER_URL>` below.

### 6a. Health check (no auth)

```bash
curl https://<RENDER_URL>/health/readiness
```

Expected response (approximately):

```json
{"status": "connected", "db": "connected"}
```

### 6b. Authenticated check

```bash
curl https://<RENDER_URL>/health \
  -H "Authorization: Bearer <LITELLM_MASTER_KEY>"
```

Expected: a JSON body listing healthy endpoints.

### 6c. Smoke-test a real extraction call

```bash
curl -X POST https://<RENDER_URL>/v1/messages \
  -H "x-api-key: <LITELLM_MASTER_KEY>" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "tabula-extract-text",
    "max_tokens": 64,
    "messages": [{"role": "user", "content": "Say OK and nothing else."}]
  }'
```

Expected: a 200 response containing `"OK"`. If you get `401`, the `ANTHROPIC_API_KEY` is wrong. If you get `400 invalid model`, the `config.yaml` didn't load — check the Render build logs.

---

## 7. Point the Electron app at the shared proxy

The Electron app already supports a `LITELLM_BASE_URL` env var. See `src/index.js` around line 296:

```js
const baseURL = process.env.LITELLM_BASE_URL || process.env.ANTHROPIC_BASE_URL;
```

No code change is required. Each teammate updates their local environment:

### 7a. Update the root `.env` (each teammate, on their laptop)

```
# The proxy's public URL (NOT the Anthropic URL)
LITELLM_BASE_URL=https://tabula-litellm.onrender.com

# The shared master key, NOT a real Anthropic key
ANTHROPIC_API_KEY=sk-...          # the LITELLM_MASTER_KEY value
```

### 7b. Restart the Electron app

```bash
npm start
```

Upload a test document in the app. The request will be logged in Render's Postgres. You can confirm from the Render dashboard → the `tabula-litellm-db` database → **Connect** → paste the psql command.

---

## 8. Share access with the team

Once verified, post this to the team channel:

```
LiteLLM proxy is live at: https://<RENDER_URL>
To use it, put these in your root .env (replace any previous values):

    LITELLM_BASE_URL=https://<RENDER_URL>
    ANTHROPIC_API_KEY=<LITELLM_MASTER_KEY>

Restart `npm start`. All extraction calls now go through the shared proxy.
Do NOT commit your .env file. Real Anthropic key is only in Render, not on anyone's laptop.
```

Store the `LITELLM_SALT_KEY` and real `ANTHROPIC_API_KEY` in a password manager that only the founder / admin can read.

---

## 9. Known free-tier limitations

Be honest with the team about these:

- **Cold starts.** Render free web services spin down after ~15 minutes of inactivity. The first request after idle can take 30–60 seconds. Fine for dev/testing, bad for demos. For a demo day, upgrade the service to the $7/mo Starter plan temporarily (or ping it from a cron every 10 min).
- **Free Postgres expires after 90 days.** Render's free database is deleted after 90 days. Plan to either upgrade ($7/mo) or redeploy fresh. Audit logs prior to the reset are lost.
- **Shared outbound bandwidth.** Enough for dev, not for production traffic.
- **No custom domain on free tier.** You get an `onrender.com` subdomain only.

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Build fails with `COPY config.yaml` error | `litellm/config.yaml` is not committed | `git add litellm/config.yaml && git commit && git push` |
| Service boots then crashes with "DATABASE_URL not set" | Postgres not provisioned yet or blueprint not applied | Re-run the blueprint; confirm `tabula-litellm-db` exists |
| `401 Unauthorized` on every request | `ANTHROPIC_API_KEY` wrong, missing, or not saved | Re-check value in Render **Environment** tab; redeploy |
| `404 model not found: tabula-extract` | `config.yaml` didn't bake into the image | Rebuild; verify `litellm/Dockerfile` contains `COPY config.yaml /app/config.yaml` |
| Electron app still hits localhost | `LITELLM_BASE_URL` not set or app not restarted | `cat .env` to confirm; restart `npm start` |
| First request takes 40 seconds then works | Render free-tier cold start | Expected; not a bug |
| `429 rate_limited` from Anthropic | Team is sharing one key + hitting rate limits | Request a higher rate limit from Anthropic, or add a second provider in `config.yaml` |

---

## 11. Appendix: files an agent should never modify

If this doc is handed to an AI coding agent, the agent should **read but not modify** these files unless explicitly asked:

- `src/index.js` — the extraction code already supports `LITELLM_BASE_URL`. Don't refactor.
- `litellm/config.yaml` — the model list and guardrails are deliberate. Don't "simplify" them.
- `docs/market-opportunity.md`, `docs/redaction-pipeline.md` — product docs, unrelated to deployment.

Files the agent **should** create or modify during deployment:

- `litellm/render.yaml` (already in repo) — edit only if changing region, plan, or service name.
- `litellm/Dockerfile` (already in repo) — edit only if LiteLLM version needs pinning.
- `.env` (local only, never commit) — the teammate updates their own.

Files the agent **must not** commit under any circumstance:

- Anything containing `sk-ant-`, `sk-tabula-`, or real secrets.
- `.env`, `.env.local`, `.env.production`.

---

## Summary for the person handing this off

> "Here's a self-contained deploy guide for the LiteLLM proxy. The repo already has `render.yaml` and a `Dockerfile` committed. You need a Render account (free) and the team's Anthropic API key. Follow sections 3–6 to deploy and verify. Takes about 15 minutes end-to-end. When it's live, share the URL + LITELLM_MASTER_KEY with the team per section 8. Do not deploy the Electron app — only the proxy."
