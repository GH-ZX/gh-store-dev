---
name: turnstile-spin
description: Cloudflare Turnstile integration skill. Covers widget embedding, canonical server-side siteverify verification, action/hostname validation, and security headers.
---

# Cloudflare Turnstile Integration

Canonical pattern for Turnstile integration into gh-store:

## 1. Widget Embedding (Frontend)
- Embed via `<Turnstile siteKey={siteKey} action={action} locale={locale} resetKey={error} />`
- Script: `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`
- Form field: `cf-turnstile-response`

## 2. Server-Side Siteverify (Backend)
- Endpoint: `https://challenges.cloudflare.com/turnstile/v0/siteverify`
- Method: `POST` with `Content-Type: application/x-www-form-urlencoded`
- Payload: `secret`, `response`, `remoteip`
- Checks:
  - `success === true`
  - Token length between 1 and 2048 chars
  - `action` matching expected surface action (`login`, `signup`, `reset_password`)
  - `hostname` matching deployment hostname (`gh-store.me`, or localhost in dev)
- Fail-open resilience on upstream 5xx or network timeout.

## 3. Environment Variables
- `TURNSTILE_SITE_KEY`: Public site key (configured in `wrangler.jsonc` vars)
- `TURNSTILE_SECRET_KEY` / `TURNSTILE_SECRET`: Secret key (stored as Cloudflare Worker secret and in gitignored `.dev.vars` for local dev)
- `TURNSTILE_HOSTNAMES`: Optional comma-separated list of approved hostnames
