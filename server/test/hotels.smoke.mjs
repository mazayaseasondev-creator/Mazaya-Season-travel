// End-to-end smoke test for the Phase 3 hotel flow (search -> book -> pay ->
// voucher -> cancel) plus the admin view. Requires a reachable PostgreSQL.
// Run: npm run smoke:hotels

const adminEmail = `hoteladmin+${Date.now()}@example.com`;
process.env.ADMIN_IDENTIFIERS = adminEmail;
process.env.PAYMENT_PROVIDER = 'simulated';
process.env.HOTEL_SUPPLIER = 'simulated';
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
  let r = await json('/api/hotels/search?city=Dubai&checkIn=2026-09-10&checkOut=2026-09-13&guests=2');
  check('search -> 200 with hotels', r.status === 200 && Array.isArray(r.data.hotels) && r.data.hotels.length > 0);
  check('search computes nights', r.data.nights === 3);
  const room = r.data.hotels[0].rooms[0];
  check('a room has a rateKey and total', !!room.rateKey && room.totalCents > 0);

  r = await json('/api/hotels/search?city=Dubai&checkIn=2026-09-13&checkOut=2026-09-10');
  check('search with bad date range -> 400', r.status === 400);

  // --- auth required ---
  r = await post('/api/hotels/bookings', { rateKey: room.rateKey, leadGuest: 'X' });
  check('booking without session -> 401', r.status === 401);

  const customer = await login(`hcust+${Date.now()}@example.com`);
  const other = await login(`hother+${Date.now()}@example.com`);

  // --- create booking (hold) ---
  r = await post('/api/hotels/bookings', { rateKey: room.rateKey, leadGuest: 'Sara Ali', guests: 2 }, customer);
  check('create booking -> 201 pending_payment', r.status === 201 && r.data.booking.status === 'pending_payment');
  check('booking amount matches the quoted room total', r.data.booking.amountCents === room.totalCents);
  const bookingId = r.data.booking.id;

  // tampered rate key must be rejected
  const tampered = room.rateKey.slice(0, -3) + (room.rateKey.slice(-3) === 'aaa' ? 'bbb' : 'aaa');
  r = await post('/api/hotels/bookings', { rateKey: tampered, leadGuest: 'Sara Ali' }, customer);
  check('tampered rate key -> 400', r.status === 400);

  // --- list / ownership ---
  r = await json('/api/hotels/bookings', { headers: { cookie: customer } });
  check('list my bookings includes the new one', r.status === 200 && r.data.bookings.some((b) => b.id === bookingId));

  r = await json(`/api/hotels/bookings/${bookingId}`, { headers: { cookie: other } });
  check('another user cannot read the booking -> 404', r.status === 404);

  // --- pay (simulated) -> confirmed + voucher ---
  r = await post(`/api/payments/hotel/${bookingId}/checkout`, {}, customer);
  check('checkout -> 201 with redirect + simulated flag', r.status === 201 && !!r.data.redirectUrl && r.data.simulated === true);
  check('payment is tagged as a hotel payment', r.data.payment.kind === 'hotel' && r.data.payment.hotelBookingId === bookingId);
  const payRef = r.data.payment.ref;

  r = await post(`/api/payments/${payRef}/confirm`, {}, customer);
  check('confirm payment -> paid', r.status === 200 && r.data.payment.status === 'paid');

  r = await json(`/api/hotels/bookings/${bookingId}`, { headers: { cookie: customer } });
  check('paid booking is confirmed with a voucher + supplier ref',
    r.data.booking.status === 'confirmed' && !!r.data.booking.voucherCode && !!r.data.booking.supplierRef);

  // --- cancel ---
  r = await post(`/api/hotels/bookings/${bookingId}/cancel`, {}, customer);
  check('cancel a confirmed booking -> cancelled', r.status === 200 && r.data.booking.status === 'cancelled');

  r = await post(`/api/payments/hotel/${bookingId}/checkout`, {}, customer);
  check('cannot pay a cancelled booking -> 409', r.status === 409);

  // --- admin ---
  r = await json('/api/admin/hotel-bookings', { headers: { cookie: customer } });
  check('customer hitting admin hotel API -> 403', r.status === 403);

  const admin = await login(adminEmail);
  r = await json('/api/admin/hotel-bookings', { headers: { cookie: admin } });
  check('admin lists hotel bookings', r.status === 200 && r.data.bookings.some((b) => b.id === bookingId));
} catch (e) {
  console.error(e);
  fail++;
} finally {
  await pool.end();
  server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
