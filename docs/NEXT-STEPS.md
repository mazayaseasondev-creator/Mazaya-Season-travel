# Mazaya OTA Website – Next Development Steps

## Progress

- ✅ **Phase 1 — Foundation:** server + PostgreSQL + real OTP login (`/server`).
- ✅ **Phase 2 — Visas first (+ payments):** visa catalogue, customer requests,
  document upload, simulated N-Genius payment, and an admin review queue.
- ✅ **Phase 3 — Hotels:** search → book → pay → voucher → cancel via a
  simulated bedbank (Hotelbeds stub ready), with an admin booking list.
- ✅ **Phase 3 — Flights:** search → hold (PNR + ticketing deadline) → pay →
  ticket → cancel via a simulated GDS (Amadeus stub ready), with an admin list.
- ✅ **Phase 3 — Tours:** search → choose transfer/guide → book → pay → voucher
  → cancel via a simulated supplier (Viator stub ready), with an admin list.
- ✅ **Phase 4 — Admin dashboard + go-live:** live revenue/bookings/customers/
  leads dashboard, payments ledger + refunds, contact-form leads, readiness
  check, Docker/Compose, SEO files and a go-live security checklist
  (`docs/DEPLOYMENT.md`).

All four phases of the backend plan are now implemented against test providers.
Remaining work to actually launch is operational, not code: sign supplier &
payment contracts, wire real OTP/SMS, enable a strict CSP + HTTPS, move uploads
to S3, and provision hosting + a domain. See `docs/DEPLOYMENT.md`.

See `docs/BACKEND-PLAN.md` for the full roadmap and `server/README.md` for the
current API.

---

This package includes the first complete build-out from the design system:

- Marketing home page
- Flights results page
- Hotels page
- Tours page
- Visa request page
- Deals page
- Login / sign up / OTP placeholder
- Checkout page
- Booking confirmation page
- Customer account + Mazaya Miles page
- Legal / support pages
- Admin dashboard prototype
- Arabic / English toggle with RTL support
- Supplier/API/payment integration placeholders

## What developers should connect next

1. Authentication: mobile/email OTP, user profile, saved travellers.
2. Flights API: search, pricing, hold, ticketing, cancellation and status sync.
3. Hotels API: search, room details, images, cancellation policy, voucher.
4. Tours API: tour inventory, transfers, guide options and booking status.
5. Visa workflow: document upload, agent assignment, payment, status tracking.
6. Payment gateway: N-Genius hosted session, card, Apple Pay, invoice, refund.
7. Admin backend: bookings, customers, leads, visa requests, deals, reports.
8. Production: SEO, analytics, security, domain, staging/production environment.

## Important

All prices and bookings in this package are demo data. Replace them with real API/backend data before launch.
