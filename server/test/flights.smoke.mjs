// End-to-end smoke test for the Phase 3 flight flow (search -> hold/PNR -> pay
// -> ticket -> cancel) plus the admin view. Requires a reachable PostgreSQL.
// Run: npm run smoke:flights

const adminEmail = `flightadmin+${Date.now()}@example.com`;
process.env.ADMIN_IDENTIFIERS = adminEmail;
process.env.PAYMENT_PROVIDER = 'simulated';
process.env.FLIGHT_SUPPLIER = 'simulated';
delete process.env.NODE_ENV;

const { migrate, pool } = await import('../src/db.js');
const { createApp } = await import('../src/index.js');

let pass = 0, fail = 0;
function check(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  cond ? pass++ : fail++;
}

await migrate();
const app = createApp();
const server = app.listen(0);
const base = `http://localhost:${server.address().port}`;

const json = (path, opts = {}) => fetch(base + path, opts).then(async (r) => ({ status: r.status, headers: r.headers, data: await r.json().catch(() => ({})) }));
const post = (path, body, cookie) =>
  json(path, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body || {}) });

async function login(identifier) {
  const r1 = await post('/api/auth/request-otp', { identifier });
  const r2 = await fetch(base + '/api/auth/verify-otp', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier, code: r1.data.devCode }),
  });
  return (r2.headers.get('set-cookie') || '').split(';')[0];
}

try {
  // --- search ---
  let r = await json('/api/flights/search?origin=AUH&destination=IST&departDate=2026-09-10&adults=2');
  check('search -> 200 with offers', r.status === 200 && Array.isArray(r.data.offers) && r.data.offers.length > 0);
  check('offers are sorted cheapest-first', r.data.offers[0].totalCents <= r.data.offers[1].totalCents);
  const offer = r.data.offers[0];
  check('an offer has an offerKey and a 2-pax total', !!offer.offerKey && offer.totalCents === offer.pricePerPax * 100 * 2);

  r = await json('/api/flights/search?origin=AUH&destination=AUH&departDate=2026-09-10');
  check('search with same origin/destination -> 400', r.status === 400);

  // --- auth required ---
  r = await post('/api/flights/bookings', { offerKey: offer.offerKey, leadPassenger: 'X' });
  check('booking without session -> 401', r.status === 401);

  const customer = await login(`fcust+${Date.now()}@example.com`);
  const other = await login(`fother+${Date.now()}@example.com`);

  // --- hold (create booking with PNR + deadline) ---
  r = await post('/api/flights/bookings', { offerKey: offer.offerKey, leadPassenger: 'Sara Ali' }, customer);
  check('create booking -> 201 pending_payment', r.status === 201 && r.data.booking.status === 'pending_payment');
  check('booking has a PNR and a ticketing deadline', !!r.data.booking.pnr && !!r.data.booking.ticketingDeadline);
  check('booking amount matches the quoted total', r.data.booking.amountCents === offer.totalCents);
  const bookingId = r.data.booking.id;

  const tampered = offer.offerKey.slice(0, -3) + (offer.offerKey.slice(-3) === 'aaa' ? 'bbb' : 'aaa');
  r = await post('/api/flights/bookings', { offerKey: tampered, leadPassenger: 'Sara Ali' }, customer);
  check('tampered offer key -> 400', r.status === 400);

  // --- list / ownership ---
  r = await json('/api/flights/bookings', { headers: { cookie: customer } });
  check('list my bookings includes the new one', r.status === 200 && r.data.bookings.some((b) => b.id === bookingId));

  r = await json(`/api/flights/bookings/${bookingId}`, { headers: { cookie: other } });
  check('another user cannot read the booking -> 404', r.status === 404);

  // --- pay -> ticketed ---
  r = await post(`/api/payments/flight/${bookingId}/checkout`, {}, customer);
  check('checkout -> 201 with redirect + simulated flag', r.status === 201 && !!r.data.redirectUrl && r.data.simulated === true);
  check('payment is tagged as a flight payment', r.data.payment.kind === 'flight' && r.data.payment.flightBookingId === bookingId);
  const payRef = r.data.payment.ref;

  r = await post(`/api/payments/${payRef}/confirm`, {}, customer);
  check('confirm payment -> paid', r.status === 200 && r.data.payment.status === 'paid');

  r = await json(`/api/flights/bookings/${bookingId}`, { headers: { cookie: customer } });
  check('paid booking is ticketed with one ticket per passenger',
    r.data.booking.status === 'ticketed' && r.data.booking.ticketNumbers.length === 2);

  // --- cancel ---
  r = await post(`/api/flights/bookings/${bookingId}/cancel`, {}, customer);
  check('cancel a ticketed booking -> cancelled', r.status === 200 && r.data.booking.status === 'cancelled');

  r = await post(`/api/payments/flight/${bookingId}/checkout`, {}, customer);
  check('cannot pay a cancelled booking -> 409', r.status === 409);

  // --- admin ---
  r = await json('/api/admin/flight-bookings', { headers: { cookie: customer } });
  check('customer hitting admin flight API -> 403', r.status === 403);

  const admin = await login(adminEmail);
  r = await json('/api/admin/flight-bookings', { headers: { cookie: admin } });
  check('admin lists flight bookings', r.status === 200 && r.data.bookings.some((b) => b.id === bookingId));
} catch (e) {
  console.error(e);
  fail++;
} finally {
  await pool.end();
  server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
