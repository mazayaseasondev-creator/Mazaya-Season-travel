// End-to-end smoke test for Phase 4: dashboard stats, customers, payments,
// leads, refunds and health checks. Requires a reachable PostgreSQL.
// Run: npm run smoke:admin

const adminEmail = `dashadmin+${Date.now()}@example.com`;
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
  // --- health / readiness ---
  let r = await json('/api/health');
  check('GET /api/health -> ok', r.status === 200 && r.data.ok === true);
  r = await json('/api/ready');
  check('GET /api/ready -> db up', r.status === 200 && r.data.db === 'up');

  // --- public leads (contact form) ---
  r = await post('/api/leads', { name: 'Walk-in Customer', contact: 'lead@example.com', message: 'Please call me about Hajj packages.' });
  check('POST /api/leads (valid) -> 201', r.status === 201 && r.data.ok === true);
  r = await post('/api/leads', { name: '', message: '' });
  check('POST /api/leads (missing fields) -> 400', r.status === 400);

  // --- a customer makes a paid hotel booking (gives revenue + a payment) ---
  const customer = await login(`dashcust+${Date.now()}@example.com`);
  const search = await json('/api/hotels/search?city=Dubai&checkIn=2026-10-01&checkOut=2026-10-04');
  const rate = search.data.hotels[0].rooms[0];
  const bk = await post('/api/hotels/bookings', { rateKey: rate.rateKey, leadGuest: 'Dash Guest' }, customer);
  const bookingId = bk.data.booking.id;
  const co = await post(`/api/payments/hotel/${bookingId}/checkout`, {}, customer);
  const payRef = co.data.payment.ref;
  await post(`/api/payments/${payRef}/confirm`, {}, customer);

  // --- admin access control ---
  r = await json('/api/admin/stats', { headers: { cookie: customer } });
  check('customer hitting admin stats -> 403', r.status === 403);

  const admin = await login(adminEmail);

  // --- dashboard stats ---
  r = await json('/api/admin/stats', { headers: { cookie: admin } });
  const statsBefore = r.data;
  check('stats: revenue reflects the paid booking', r.status === 200 && statsBefore.revenue >= rate.totalPrice);
  check('stats: at least one customer + open lead', statsBefore.customers >= 1 && statsBefore.openLeads >= 1);
  check('stats: bookings total counted', statsBefore.bookingsTotal >= 1);

  // --- customers / payments / leads lists ---
  r = await json('/api/admin/customers', { headers: { cookie: admin } });
  check('customers list includes a paying customer', r.status === 200 && r.data.customers.some((c) => c.spend >= rate.totalPrice));

  r = await json('/api/admin/payments?status=paid', { headers: { cookie: admin } });
  check('payments ledger lists the paid hotel payment', r.data.payments.some((p) => p.ref === payRef && p.kind === 'hotel'));

  r = await json('/api/admin/leads', { headers: { cookie: admin } });
  check('leads list includes the contact-form lead', r.data.leads.some((l) => l.email === 'lead@example.com'));

  // --- refunds ---
  r = await post(`/api/payments/${payRef}/refund`, {}, customer);
  check('customer cannot refund -> 403', r.status === 403);

  r = await post(`/api/payments/${payRef}/refund`, {}, admin);
  check('admin refund -> refunded', r.status === 200 && r.data.payment.status === 'refunded');

  r = await json(`/api/hotels/bookings/${bookingId}`, { headers: { cookie: customer } });
  check('refund cancels the linked booking', r.data.booking.status === 'cancelled');

  r = await post(`/api/payments/${payRef}/refund`, {}, admin);
  check('second refund is idempotent', r.status === 200 && r.data.alreadyRefunded === true);

  r = await json('/api/admin/stats', { headers: { cookie: admin } });
  check('stats: revenue drops and refunded rises after refund',
    r.data.revenue === statsBefore.revenue - rate.totalPrice && r.data.refunded >= rate.totalPrice);
} catch (e) {
  console.error(e);
  fail++;
} finally {
  await pool.end();
  server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
