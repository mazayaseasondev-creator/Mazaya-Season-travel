// End-to-end smoke test for manually-raised invoices. Run: npm run smoke:invoices

const adminEmail = `invadmin+${Date.now()}@example.com`;
process.env.ADMIN_IDENTIFIERS = adminEmail;
process.env.PAYMENT_PROVIDER = 'simulated';
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
  const customer = await login(`invcust+${Date.now()}@example.com`);

  let r = await post('/api/admin/invoices', { contact: 'walkin@example.com', description: 'Tailor-made package', amount: 1500 }, admin);
  check('POST /api/admin/invoices -> 201 with number', r.status === 201 && /^INV-\d+$/.test(r.data.invoice.number) && r.data.invoice.amount === 1500);
  const num = r.data.invoice.number;

  r = await post('/api/admin/invoices', { contact: '', description: '', amount: 0 }, admin);
  check('invoice requires contact/description/amount -> 400', r.status === 400);

  r = await post('/api/admin/invoices', { contact: 'x@y.com', description: 'Test', amount: -5 }, admin);
  check('negative amount -> 400', r.status === 400);

  r = await json('/api/admin/invoices', { headers: { cookie: admin } });
  check('GET /api/admin/invoices lists the new invoice', r.status === 200 && r.data.invoices.some((i) => i.number === num));

  r = await post('/api/admin/invoices', { contact: 'x@y.com', description: 'Nope', amount: 100 }, customer);
  check('customer cannot create invoices -> 403', r.status === 403);

  r = await json('/api/admin/invoices', { headers: { cookie: customer } });
  check('customer cannot list invoices -> 403', r.status === 403);
} catch (e) {
  console.error(e); fail++;
} finally {
  await pool.end();
  server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
