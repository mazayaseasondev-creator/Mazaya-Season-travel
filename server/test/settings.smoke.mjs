// End-to-end smoke test for Company Settings. Run: npm run smoke:settings

const adminEmail = `setadmin+${Date.now()}@example.com`;
process.env.ADMIN_IDENTIFIERS = adminEmail;
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

async function login(identifier) {
  const r1 = await send('POST', '/api/auth/request-otp', { identifier });
  const r2 = await fetch(base + '/api/auth/verify-otp', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier, code: r1.data.devCode }),
  });
  return (r2.headers.get('set-cookie') || '').split(';')[0];
}

try {
  const admin = await login(adminEmail);
  const customer = await login(`setcust+${Date.now()}@example.com`);

  let r = await json('/api/admin/settings', { headers: { cookie: admin } });
  check('GET /api/admin/settings returns seeded defaults', r.status === 200 && r.data.settings['company.tradingName'] === 'Mazaya Season Travel');

  r = await send('PUT', '/api/admin/settings', { settings: { 'company.phone': '600123456', 'brand.primaryColor': '#222222' } }, admin);
  check('PUT /api/admin/settings updates values', r.status === 200 && r.data.settings['company.phone'] === '600123456' && r.data.settings['brand.primaryColor'] === '#222222');

  // public endpoint exposes whitelisted keys only
  r = await json('/api/settings');
  check('GET /api/settings (public) exposes brand + public company fields', r.status === 200 && r.data.settings['brand.primaryColor'] === '#222222' && r.data.settings['company.phone'] === '600123456');
  check('GET /api/settings hides private keys (licenseNo)', r.data.settings['company.licenseNo'] === undefined);

  r = await send('PUT', '/api/admin/settings', { settings: { 'company.phone': '999' } }, customer);
  check('customer cannot change settings -> 403', r.status === 403);

  r = await json('/api/admin/settings', { headers: { cookie: customer } });
  check('customer cannot read admin settings -> 403', r.status === 403);
} catch (e) {
  console.error(e); fail++;
} finally {
  await pool.end();
  server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
