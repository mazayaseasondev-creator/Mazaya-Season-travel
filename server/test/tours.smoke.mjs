// End-to-end smoke test for the Phase 3 tour flow (search -> choose options ->
// book -> pay -> voucher -> cancel) plus the admin view. Requires PostgreSQL.
// Run: npm run smoke:tours

const adminEmail = `touradmin+${Date.now()}@example.com`;
process.env.ADMIN_IDENTIFIERS = adminEmail;
process.env.PAYMENT_PROVIDER = 'simulated';
process.env.TOUR_SUPPLIER = 'simulated';
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
  let r = await json('/api/tours/search?city=Dubai&date=2026-09-10&travellers=2');
  check('search -> 200 with tours', r.status === 200 && Array.isArray(r.data.tours) && r.data.tours.length > 0);
  const tour = r.data.tours[0];
  check('a tour exposes transfer + guide options', tour.transferOptions.length >= 2 && tour.guideOptions.length >= 2);

  r = await json('/api/tours/search?city=Dubai&date=not-a-date');
  check('search with bad date -> 400', r.status === 400);

  // --- auth required ---
  r = await post('/api/tours/bookings', { tourKey: tour.tourKey, leadTraveller: 'X' });
  check('booking without session -> 401', r.status === 401);

  const customer = await login(`tcust+${Date.now()}@example.com`);
  const other = await login(`tother+${Date.now()}@example.com`);

  // Expected price: (base + private transfer + private guide) * 2 travellers.
  const tDelta = tour.transferOptions.find((x) => x.code === 'private').priceDelta;
  const gDelta = tour.guideOptions.find((x) => x.code === 'private').priceDelta;
  const expectedCents = Math.round((tour.basePrice + tDelta + gDelta) * 100) * 2;

  // --- book with options ---
  r = await post('/api/tours/bookings', {
    tourKey: tour.tourKey, transferCode: 'private', guideCode: 'private',
    leadTraveller: 'Sara Ali', travellers: 2,
  }, customer);
  check('create booking -> 201 pending_payment', r.status === 201 && r.data.booking.status === 'pending_payment');
  check('price includes the chosen transfer + guide for 2 pax', r.data.booking.amountCents === expectedCents);
  check('booking records the chosen options', r.data.booking.transferOption === 'private' && r.data.booking.guideOption === 'private');
  const bookingId = r.data.booking.id;

  // invalid option code must be rejected
  r = await post('/api/tours/bookings', { tourKey: tour.tourKey, transferCode: 'helicopter', leadTraveller: 'Sara' }, customer);
  check('invalid transfer option -> 400', r.status === 400);

  // tampered key
  const tampered = tour.tourKey.slice(0, -3) + (tour.tourKey.slice(-3) === 'aaa' ? 'bbb' : 'aaa');
  r = await post('/api/tours/bookings', { tourKey: tampered, leadTraveller: 'Sara' }, customer);
  check('tampered tour key -> 400', r.status === 400);

  // --- list / ownership ---
  r = await json('/api/tours/bookings', { headers: { cookie: customer } });
  check('list my bookings includes the new one', r.status === 200 && r.data.bookings.some((b) => b.id === bookingId));

  r = await json(`/api/tours/bookings/${bookingId}`, { headers: { cookie: other } });
  check('another user cannot read the booking -> 404', r.status === 404);

  // --- pay -> confirmed + voucher ---
  r = await post(`/api/payments/tour/${bookingId}/checkout`, {}, customer);
  check('checkout -> 201 with redirect + simulated flag', r.status === 201 && !!r.data.redirectUrl && r.data.simulated === true);
  check('payment is tagged as a tour payment', r.data.payment.kind === 'tour' && r.data.payment.tourBookingId === bookingId);
  const payRef = r.data.payment.ref;

  r = await post(`/api/payments/${payRef}/confirm`, {}, customer);
  check('confirm payment -> paid', r.status === 200 && r.data.payment.status === 'paid');

  r = await json(`/api/tours/bookings/${bookingId}`, { headers: { cookie: customer } });
  check('paid booking is confirmed with a voucher + supplier ref',
    r.data.booking.status === 'confirmed' && !!r.data.booking.voucherCode && !!r.data.booking.supplierRef);

  // --- cancel ---
  r = await post(`/api/tours/bookings/${bookingId}/cancel`, {}, customer);
  check('cancel a confirmed booking -> cancelled', r.status === 200 && r.data.booking.status === 'cancelled');

  r = await post(`/api/payments/tour/${bookingId}/checkout`, {}, customer);
  check('cannot pay a cancelled booking -> 409', r.status === 409);

  // --- admin ---
  r = await json('/api/admin/tour-bookings', { headers: { cookie: customer } });
  check('customer hitting admin tour API -> 403', r.status === 403);

  const admin = await login(adminEmail);
  r = await json('/api/admin/tour-bookings', { headers: { cookie: admin } });
  check('admin lists tour bookings', r.status === 200 && r.data.bookings.some((b) => b.id === bookingId));
} catch (e) {
  console.error(e);
  fail++;
} finally {
  await pool.end();
  server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
