# Mazaya Season Travel — Backend (Phase 1)

A Node.js + Express server backed by PostgreSQL. This first phase delivers the
foundation from `docs/BACKEND-PLAN.md`:

- A real web server that also serves the existing front-end (one origin).
- A PostgreSQL database with `users` and `otp_codes` tables.
- **Real passwordless login** using a one-time code (OTP) sent to an email or
  mobile number, with a secure signed session cookie.

> Bookings, payments and supplier APIs are **not** part of this phase — see the
> roadmap in `docs/BACKEND-PLAN.md`.

## Requirements

- Node.js 18+ (tested on 22)
- PostgreSQL 14+

## Setup

```bash
cd server
npm install
cp .env.example .env        # then edit .env with your database + secrets
createdb mazaya             # or point DATABASE_URL at an existing database
npm run migrate             # create the tables
npm start                   # http://localhost:4000
```

Open `http://localhost:4000/` — the existing website is served by this server,
and the login page now talks to the real API.

### Development login (no SMS needed)

With `EXPOSE_OTP=true` (the default in development), the one-time code is
returned in the API response and printed to the server console, so you can log
in without an SMS/email provider. The login page auto-fills it for convenience.
Set `EXPOSE_OTP=false` (or `NODE_ENV=production`) to turn this off.

## API

| Method | Path                     | Purpose                                      |
|--------|--------------------------|----------------------------------------------|
| GET    | `/api/health`            | Liveness check                               |
| POST   | `/api/auth/request-otp`  | Body `{ identifier }` — email or mobile      |
| POST   | `/api/auth/verify-otp`   | Body `{ identifier, code }` — starts session |
| GET    | `/api/auth/me`           | Current user (requires session cookie)       |
| POST   | `/api/auth/logout`       | Clears the session                           |

## Tests

```bash
npm run smoke   # end-to-end auth flow against your configured database
```

## Security notes

- OTP codes are stored only as HMAC-SHA256 hashes, are single-use, expire after
  `OTP_TTL_MINUTES`, and lock after `OTP_MAX_ATTEMPTS`.
- Sessions are signed JWTs in an `httpOnly` cookie (`secure` in production).
- Set strong `JWT_SECRET` and `OTP_SECRET` in production — the server refuses to
  start in production with the default dev secrets.
- Before launch: enable a Content-Security-Policy, put the server behind HTTPS,
  and connect a real SMS/email provider in `src/otp.js`.
