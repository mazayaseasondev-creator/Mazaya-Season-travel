// End-to-end smoke test for Pricing: markup rules that change quoted prices,
// and discount vouchers (CRUD + validation). Run: npm run smoke:pricing

const adminEmail = `priceadmin+${Date.now()}@example.com`;
process.env.ADMIN_IDENTIFIERS = adminEmail;
process.env.PAYMENT_PROVIDER = 'simulated';
process.env.HOTEL_SUPPLIER = 'simulated';
process.env.FLIGHT_SUPPLIER = 'simulated';
process.env.TOUR_SUPPLIER = 'simulated';
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
const send = (method, path, body, cookie) =>
  json(path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body || {}) });
const post = (p, b, c) => send('POST', p, b, c);
const put = (p, b, c) => send('PUT', p, b, c);
const patch = (p, b, c) => send('PATCH', p, b, c);

async function login(identifier) {
  const r1 = await post('/api/auth/request-otp', { identifier });
  const r2 = await fetch(base + '/api/auth/verify-otp', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier, code: r1.data.devCode }),
  });
  return (r2.headers.get('set-cookie') || '').split(';')[0];
}
const hotelPrice = async () => {
  const r = await json('/api/hotels/search?city=Dubai&checkIn=2026-09-01&checkOut=2026-09-03&guests=2');
  return r.data.hotels[0].rooms[0].totalPrice;
};

try {
  const admin = await login(adminEmail);
  const customer = await login(`pcust+${Date.now()}@example.com`);

  // --- markup affects quoted price ---
  await put('/api/admin/pricing', { product: 'hotel', markupPercent: 0 }, admin);
  const basePrice = await hotelPrice();
  check('hotel search returns a base price', basePrice > 0);

  let r = await put('/api/admin/pricing', { product: 'hotel', markupPercent: 10 }, admin);
  check('PUT /api/admin/pricing (10%) -> ok', r.status === 200 && r.data.markupPercent === 10);

  const marked = await hotelPrice();
  check('search price reflects +10% markup', Math.abs(marked - basePrice * 1.10) < basePrice * 0.011);

  r = await json('/api/admin/pricing', { headers: { cookie: admin } });
  check('GET /api/admin/pricing shows the rule', r.status === 200 && r.data.markups.hotel === 10);

  // non-admin cannot change pricing
  r = await put('/api/admin/pricing', { product: 'hotel', markupPercent: 50 }, customer);
  check('customer cannot change pricing -> 403', r.status === 403);

  await put('/api/admin/pricing', { product: 'hotel', markupPercent: 0 }, admin); // reset

  // --- vouchers ---
  const code = `SAVE${Date.now() % 100000}`;
  r = await post('/api/admin/vouchers', { code, kind: 'percent', value: 15 }, admin);
  check('POST /api/admin/vouchers (percent) -> 201', r.status === 201 && r.data.voucher.code === code);

  r = await post('/api/admin/vouchers', { code, kind: 'percent', value: 15 }, admin);
  check('duplicate voucher code -> 409', r.status === 409);

  r = await post('/api/admin/vouchers', { code: 'BAD', kind: 'percent', value: 150 }, admin);
  check('percent over 100 -> 400', r.status === 400);

  r = await post('/api/vouchers/validate', { code, amount: 200 }, customer);
  check('validate percent voucher -> 15% of 200 = 30', r.status === 200 && r.data.valid === true && r.data.discount === 30 && r.data.finalAmount === 170);

  r = await json('/api/admin/vouchers', { headers: { cookie: admin } });
  const created = (r.data.vouchers || []).find((v) => v.code === code);
  check('GET /api/admin/vouchers lists it', !!created);

  r = await patch(`/api/admin/vouchers/${created.id}`, { active: false }, admin);
  check('PATCH voucher -> deactivated', r.status === 200 && r.data.voucher.active === false);

  r = await post('/api/vouchers/validate', { code, amount: 200 }, customer);
  check('inactive voucher no longer valid', r.status === 200 && r.data.valid === false);

  r = await post('/api/vouchers/validate', { code: 'NOPE', amount: 100 }, customer);
  check('unknown code -> invalid', r.status === 200 && r.data.valid === false);

  // fixed voucher capped at total
  const fcode = `FLAT${Date.now() % 100000}`;
  await post('/api/admin/vouchers', { code: fcode, kind: 'fixed', value: 50 }, admin);
  r = await post('/api/vouchers/validate', { code: fcode, amount: 30 }, customer);
  check('fixed voucher capped at amount', r.status === 200 && r.data.discount === 30 && r.data.finalAmount === 0);
} catch (e) {
  console.error(e); fail++;
} finally {
  await pool.end();
  server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
