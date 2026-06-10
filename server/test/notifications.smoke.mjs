// End-to-end smoke test for Notifications: compose/send, the log, admin guard,
// and the auto-notification created when a payment is captured.
// Run: npm run smoke:notifications

const adminEmail = `ntadmin+${Date.now()}@example.com`;
process.env.ADMIN_IDENTIFIERS = adminEmail;
process.env.PAYMENT_PROVIDER = 'simulated';
process.env.HOTEL_SUPPLIER = 'simulated';
delete process.env.NODE_ENV;

const { migrate, pool } = await import('../src/db.js');
const { createApp } = await import('../src/index.js');

let pass = 0, fail = 0;
function check(name, cond) { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; }

await migrate();
const app = createApp();
const server = app.listen(0);
const base = `http://localhost:${server.address().port}`;

const json = (path, opts = {}) => fetch(base + path, opts).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));
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
  const admin = await login(adminEmail);
  const custEmail = `ntcust+${Date.now()}@example.com`;
  const customer = await login(custEmail);

  // compose + send
  let r = await post('/api/admin/notifications', { channel: 'email', recipient: 'guest@example.com', subject: 'Welcome', body: 'Thanks for joining.' }, admin);
  check('POST /api/admin/notifications -> 201 sent', r.status === 201 && r.data.notification.status === 'sent' && r.data.notification.channel === 'email');

  r = await post('/api/admin/notifications', { subject: 'No recipient' }, admin);
  check('notification requires recipient + subject -> 400', r.status === 400);

  r = await post('/api/admin/notifications', { recipient: 'x@y.com', subject: 'Nope' }, customer);
  check('customer cannot send notifications -> 403', r.status === 403);

  // a paid booking should auto-create a "Payment received" notification
  const s = await json('/api/hotels/search?city=Dubai&checkIn=2026-10-01&checkOut=2026-10-03&guests=2');
  const rateKey = s.data.hotels[0].rooms[0].rateKey;
  const bk = await post('/api/hotels/bookings', { rateKey, leadGuest: 'NT Guest', guests: 2 }, customer);
  const ref = (await post(`/api/payments/hotel/${bk.data.booking.id}/checkout`, {}, customer)).data.payment.ref;
  await post(`/api/payments/${ref}/confirm`, {}, customer);

  r = await json('/api/admin/notifications', { headers: { cookie: admin } });
  const auto = (r.data.notifications || []).find((n) => n.subject === 'Payment received' && n.recipient === custEmail);
  check('paying a booking auto-logs a "Payment received" notification', !!auto);
  check('notification log lists the composed message too', (r.data.notifications || []).some((n) => n.subject === 'Welcome'));

  r = await json('/api/admin/notifications', { headers: { cookie: customer } });
  check('customer cannot read the notification log -> 403', r.status === 403);
} catch (e) {
  console.error(e); fail++;
} finally {
  await pool.end();
  server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
