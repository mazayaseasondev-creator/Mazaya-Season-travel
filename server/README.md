# Mazaya Season Travel — Backend (Phases 1–3)

A Node.js + Express server backed by PostgreSQL, delivering the roadmap in
`docs/BACKEND-PLAN.md`.

**Phase 1 — Foundation**
- A real web server that also serves the existing front-end (one origin).
- A PostgreSQL database with `users` and `otp_codes` tables.
- **Real passwordless login** using a one-time code (OTP) sent to an email or
  mobile number, with a secure signed session cookie.

**Phase 2 — Visas first (+ payments)**
- A visa **product catalogue** and customer **visa requests**.
- **Document upload** (passport scans, photos) stored on disk in dev.
- **Payments** via a provider-agnostic gateway: a built-in **simulated**
  gateway for dev/test, plus a real **N-Genius** (Network International) stub
  ready for credentials.
- An **admin queue** to review requests and set their status.

**Phase 3 — Hotels**
- **Search → book → pay → voucher → cancel** through a provider-agnostic hotel
  supplier: a built-in **simulated** bedbank for dev/test, plus a real
  **Hotelbeds** stub ready for credentials.
- Quoted rates are signed (tamper-evident) so prices can be trusted at booking
  time; payment reuses the Phase 2 gateway and issues a voucher on capture.

> Flights and tours supplier APIs are **not** part of these phases — see the
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

### Auth (Phase 1)
| Method | Path                     | Purpose                                      |
|--------|--------------------------|----------------------------------------------|
| GET    | `/api/health`            | Liveness check                               |
| POST   | `/api/auth/request-otp`  | Body `{ identifier }` — email or mobile      |
| POST   | `/api/auth/verify-otp`   | Body `{ identifier, code }` — starts session |
| GET    | `/api/auth/me`           | Current user (requires session cookie)       |
| POST   | `/api/auth/logout`       | Clears the session                           |

### Visas & payments (Phase 2)
| Method | Path                                | Purpose                                          |
|--------|-------------------------------------|--------------------------------------------------|
| GET    | `/api/visa-types`                   | Public visa catalogue                            |
| POST   | `/api/visas`                        | Create a request (auth)                          |
| GET    | `/api/visas`                        | List my requests (auth)                          |
| GET    | `/api/visas/:id`                    | One request + documents (owner/admin)            |
| POST   | `/api/visas/:id/documents`          | Upload documents — multipart `files` (owner)     |
| GET    | `/api/visas/:id/documents/:docId`   | Download a document (owner/admin)                |
| POST   | `/api/payments/visa/:id/checkout`   | Start payment, returns a gateway `redirectUrl`   |
| GET    | `/api/payments/:ref`                | Payment status (owner/admin)                     |
| POST   | `/api/payments/:ref/confirm`        | Complete a **simulated** payment (owner)         |

### Hotels (Phase 3)
| Method | Path                                | Purpose                                          |
|--------|-------------------------------------|--------------------------------------------------|
| GET    | `/api/hotels/search`                | `?city=&checkIn=&checkOut=&guests=` (public)     |
| POST   | `/api/hotels/bookings`              | Hold a room from a `rateKey` (auth)              |
| GET    | `/api/hotels/bookings`              | My bookings (auth)                               |
| GET    | `/api/hotels/bookings/:id`          | One booking (owner/admin)                        |
| POST   | `/api/hotels/bookings/:id/cancel`   | Cancel a booking (owner)                         |
| POST   | `/api/payments/hotel/:id/checkout`  | Pay for a booking — returns gateway `redirectUrl`|

Paying a hotel booking confirms it with the supplier and issues a voucher; the
status flow is `pending_payment → confirmed → cancelled`.

### Admin (role `admin`)
| Method | Path                          | Purpose                                |
|--------|-------------------------------|----------------------------------------|
| GET    | `/api/admin/stats`            | Visa + hotel counts by status          |
| GET    | `/api/admin/visas`            | Visa queue, optional `?status=`        |
| GET    | `/api/admin/visas/:id`        | One request with documents             |
| PATCH  | `/api/admin/visas/:id`        | Body `{ status?, note? }` — update     |
| GET    | `/api/admin/hotel-bookings`   | Hotel bookings, optional `?status=`    |

Grant admin access by listing an email/mobile in `ADMIN_IDENTIFIERS`; that user
becomes an admin the next time they log in.

The visa status flow is `awaiting_payment → in_review → approved | rejected`.
Paying a request (simulated or real) advances it to `in_review`.

## Tests

```bash
npm test             # runs all smoke suites
npm run smoke        # Phase 1: auth flow
npm run smoke:visas  # Phase 2: visa requests, uploads, payment, admin queue
npm run smoke:hotels # Phase 3: hotel search, booking, payment, voucher, cancel
```

## Security notes

- OTP codes are stored only as HMAC-SHA256 hashes, are single-use, expire after
  `OTP_TTL_MINUTES`, and lock after `OTP_MAX_ATTEMPTS`.
- Sessions are signed JWTs in an `httpOnly` cookie (`secure` in production).
- Visa documents are downloadable only by the owner or an admin; uploads are
  restricted to PDFs/images and size-limited (`MAX_UPLOAD_BYTES`).
- The **simulated** payment gateway never charges a card — the server refuses to
  start in production with it (set `PAYMENT_PROVIDER=ngenius`).
- Hotel rate keys are HMAC-signed so a customer cannot alter the quoted price
  between search and booking.
- Set strong `JWT_SECRET` and `OTP_SECRET` in production — the server refuses to
  start in production with the default dev secrets.
- Before launch: enable a Content-Security-Policy, put the server behind HTTPS,
  move document storage to S3, and connect a real SMS/email provider in
  `src/otp.js` plus N-Genius credentials in `src/gateways/ngenius.js`.
