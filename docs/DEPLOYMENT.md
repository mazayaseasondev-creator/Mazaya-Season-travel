# Mazaya Season Travel — Deployment & Go-Live

This covers running the platform in **staging** and **production**, plus the
security checklist for go-live. It accompanies Phase 4 of `docs/BACKEND-PLAN.md`.

## What runs

One Node/Express server (`/server`) that serves the static front-end **and** the
API from a single origin, backed by PostgreSQL. Uploaded visa documents are
stored on disk (mount a volume) until object storage is wired.

## Environments

| | Staging | Production |
|---|---|---|
| Purpose | Test the full flow safely | Live customers & money |
| `NODE_ENV` | `development` (or `production`) | `production` |
| Suppliers | `simulated` (no contracts needed) | `ngenius` / `hotelbeds` / `amadeus` / `viator` |
| Payments | Simulated (no card charged) | N-Genius hosted page |
| Secrets | Test secrets | Strong, unique secrets |

Keep staging and production in **separate databases** and with **separate
secrets**. Never point staging at the production database.

## Run with Docker (recommended)

```bash
cp server/.env.example .env        # then edit secrets/providers
# Staging demo on simulated suppliers:
NODE_ENV=development JWT_SECRET=$(openssl rand -hex 32) OTP_SECRET=$(openssl rand -hex 32) \
  docker compose up --build
# open http://localhost:4000
```

The server runs its idempotent SQL migrations on start, so no manual migrate
step is needed. For production, set `NODE_ENV=production` and real provider
credentials (the server refuses to boot in production with the simulated payment
gateway or default secrets).

## Run without Docker

```bash
cd server
npm ci
cp .env.example .env               # set DATABASE_URL + secrets
npm run migrate
npm start
```

## Go-live security checklist

- [ ] **HTTPS only** — terminate TLS at your load balancer / reverse proxy and
      redirect HTTP→HTTPS. Cookies are already `secure` in production.
- [ ] **Strong secrets** — set unique `JWT_SECRET` and `OTP_SECRET`
      (`openssl rand -hex 32`). The server refuses default secrets in production.
- [ ] **Real providers** — set `PAYMENT_PROVIDER=ngenius` and the supplier vars,
      with their credentials. The simulated payment gateway is blocked in prod.
- [ ] **Real OTP delivery** — implement SMS/email sending in `server/src/otp.js`
      (Unifonic/Twilio/SES/SendGrid) and set `EXPOSE_OTP=false`.
- [ ] **Content-Security-Policy** — the front-end currently uses inline
      handlers, so CSP is disabled (`server/src/index.js`). Before launch, move
      inline `onclick`s to listeners and enable a strict CSP via Helmet.
- [ ] **Document storage** — move uploads from local disk to S3 (or mount a
      durable, backed-up volume) and restrict access.
- [ ] **Database backups** — enable automated backups + point-in-time recovery.
- [ ] **Admin access** — set `ADMIN_IDENTIFIERS` to your operations team only.
- [ ] **Rate limiting / WAF** — auth and leads are rate-limited in-app; add an
      edge WAF/rate limit for defence in depth.
- [ ] **Monitoring** — point health checks at `/api/ready` (DB-aware) and
      `/api/health` (liveness); add error/uptime alerting.
- [ ] **SEO/analytics** — update the host in `robots.txt` and `sitemap.xml`, and
      add your analytics snippet.

## Health checks

- `GET /api/health` — liveness (process up).
- `GET /api/ready` — readiness (can reach the database); returns `503` if not.

## Tests

```bash
cd server && npm test   # 6 end-to-end suites against a real PostgreSQL
```
