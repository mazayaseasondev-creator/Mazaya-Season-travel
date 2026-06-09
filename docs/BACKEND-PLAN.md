# Mazaya Season Travel – Backend Plan

This document explains how to turn the current website (a front-end with demo
data) into a real, working travel booking platform. It is written to be
understandable by non-developers, while still being concrete enough to hand to
an engineer.

## Where we are today

- A polished front-end (HTML / CSS / JavaScript) with all the main pages.
- **All data is fake.** Prices, bookings, the admin dashboard numbers, and the
  login are demo placeholders.
- There is **no backend** yet — nothing is stored, no payments are taken, and
  "login" lets anyone through.

The backend is the engine that makes everything real: it stores users and
bookings, fetches live prices from suppliers, takes payments securely, and gives
your team a real admin panel.

---

## The core pieces

1. **Server + database** – where users, bookings, visa requests, and Mazaya
   Miles are actually stored.
2. **Authentication** – real signup / login with a one-time code (OTP) sent by
   SMS or email, plus secure sessions so users stay logged in safely.
3. **Supplier integrations** – connections to the companies that actually
   provide flights, hotels, and tours. Mazaya resells these via their APIs
   ("consolidators" / "bedbanks" / GDS).
4. **Payments** – a gateway that charges cards securely. In the UAE this is
   commonly **N-Genius** (Network International), plus Apple Pay / cards.
5. **Admin backend** – so the Mazaya team can see real bookings, customers,
   visa requests, refunds, and reports. (The current admin page is a mockup.)

---

## Build order (phased)

Building everything at once is risky. This order delivers real value early and
saves the hardest work for after the foundations are proven.

### Phase 1 — Foundation (accounts work for real)
- Set up the server and database.
- Real signup / login with **OTP** (code sent by SMS or email).
- Secure sessions, customer profiles, saved travellers, and Mazaya Miles stored
  in the database.

**Outcome:** real users can create accounts and log in securely.

### Phase 2 — Visas first (easiest real product)
- The visa flow is the simplest: a form + document upload + your team reviews it
  + the customer pays. **No external travel API is required.**
- This is also the perfect place to wire up **payments (N-Genius)** end-to-end
  on something simple before tackling flights/hotels.

**Outcome:** Mazaya can take real, paid visa requests online.

### Phase 3 — Hotels → Flights → Tours
Connect one supplier API at a time. Each follows the same pattern:
search → show real prices → hold → book → issue voucher/ticket → handle
cancellation.

- **Hotels first** — a good middle difficulty to learn the pattern.
- **Flights next** — the most complex (price holds, ticketing deadlines,
  cancellations, status sync).
- **Tours last** — inventory, transfers, guide options.

**Outcome:** real, bookable inventory with live pricing.

### Phase 4 — Admin + go-live
- Real admin dashboard: live bookings, customers, leads, visa queue, refunds,
  reports.
- Production readiness: security review, custom domain, hosting, analytics,
  SEO, and separate **staging** (testing) vs **production** (live) environments.

**Outcome:** a launchable platform your team can operate.

---

## What the database needs to store (high level)

- **Users** – name, email, mobile, password/OTP status, role (customer/admin).
- **Travellers** – saved passenger details (passport, nationality, DOB).
- **Bookings** – type (flight/hotel/tour/visa), supplier reference, status,
  price breakdown, traveller(s), payment status.
- **Visa requests** – applicant details, uploaded documents, internal review
  status, payment.
- **Payments** – amount, method, gateway reference, status, refunds.
- **Mazaya Miles** – points balance, tier, transaction history.
- **Admin / operational data** – leads, support tickets, deals/promotions.

---

## External services you will need accounts for

| Need | Examples | Notes |
|------|----------|-------|
| Payments | **N-Genius** (Network International), Apple Pay | Confirm merchant account |
| SMS OTP | Unifonic, Twilio | For the login codes |
| Email | Amazon SES, SendGrid, Postmark | OTP + booking confirmations |
| Flights | GDS / consolidator API (e.g. Amadeus, Travelport, or a local consolidator) | Needs a commercial contract |
| Hotels | Bedbank API (e.g. Hotelbeds, TBO) | Needs a commercial contract |
| Tours | Tour/activity supplier API | Needs a commercial contract |
| File storage | Amazon S3 (or similar) | For visa document uploads |
| Hosting | A cloud host for the server + database | Decide in Phase 4 |

> During development, OTP codes and payments can be **simulated** (test mode) so
> we can build and test without waiting on contracts or spending money. Real
> providers get switched on before launch.

---

## Decisions needed from Mazaya

These determine exactly what gets built:

1. **Tech stack** – the programming framework + database for the server.
2. **Payment provider** – is **N-Genius** confirmed?
3. **Supplier contracts** – which flight/hotel/tour APIs do you already have (or
   plan to get) access to?
4. **OTP channel** – SMS, email, or both? Which provider?

---

## Security & compliance (must-haves before launch)

- All traffic over **HTTPS**.
- Passwords hashed; OTPs short-lived and rate-limited.
- Personal and passport data encrypted and access-controlled.
- Payment handling that keeps card data off our servers (use the gateway's
  hosted/tokenised flow — helps with **PCI** compliance).
- A clear privacy policy and data-retention rules (you already have placeholder
  legal pages to build on).

---

## Suggested immediate next step

Begin **Phase 1**: stand up the server + database and replace the fake login
with real OTP-based authentication. During development the OTP can be shown on
screen / in logs (test mode) and swapped for a real SMS/email provider later.
