// End-to-end smoke test for the Phase 2 visa + payment flow. Requires a
// reachable PostgreSQL (via DATABASE_URL or PG* env vars). Run: npm run smoke:visas
//
// ADMIN_IDENTIFIERS must be set before the app config loads, so the modules are
// imported dynamically after we configure the environment below.

const adminEmail = `admin+${Date.now()}@example.com`;
process.env.ADMIN_IDENTIFIERS = adminEmail;
process.env.PAYMENT_PROVIDER = 'simulated';
delete process.env.NODE_ENV; // ensure dev mode (exposeOtp + simulated payments)

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

// Log in (or sign up) and return the session cookie.
async function login(identifier) {
  const r1 = await post('/api/auth/request-otp', { identifier });
  const r2 = await fetch(base + '/api/auth/verify-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier, code: r1.data.devCode }),
  });
  return (r2.headers.get('set-cookie') || '').split(';')[0];
}

try {
  // --- public catalogue ---
  let r = await json('/api/visa-types');
  check('GET /api/visa-types -> 200 with items', r.status === 200 && Array.isArray(r.data.visaTypes) && r.data.visaTypes.length > 0);
  const schengen = r.data.visaTypes.find((t) => t.code === 'schengen');
  check('catalogue includes a priced Schengen visa', !!schengen && schengen.priceCents > 0);

  // --- auth required ---
  r = await post('/api/visas', { visaTypeCode: 'schengen' });
  check('create request without session -> 401', r.status === 401);

  const customer = await login(`cust+${Date.now()}@example.com`);
  const other = await login(`other+${Date.now()}@example.com`);

  // --- create ---
  r = await post('/api/visas', {
    visaTypeCode: 'schengen', applicantName: 'Sara Ali', nationality: 'AE',
    passportNumber: 'A1234567', travelDate: '2026-09-01',
  }, customer);
  check('create request -> 201 awaiting_payment', r.status === 201 && r.data.request.status === 'awaiting_payment');
  const reqId = r.data.request?.id;
  check('created request echoes the visa type + price', r.data.request?.type?.code === 'schengen' && r.data.request?.type?.price > 0);

  r = await post('/api/visas', { visaTypeCode: 'nope', applicantName: 'X', nationality: 'AE', passportNumber: 'Z1' }, customer);
  check('create with unknown visa type -> 400', r.status === 400);

  // --- list / ownership ---
  r = await json('/api/visas', { headers: { cookie: customer } });
  check('list my requests includes the new one', r.status === 200 && r.data.requests.some((x) => x.id === reqId));

  r = await json(`/api/visas/${reqId}`, { headers: { cookie: other } });
  check('another user cannot read the request -> 404', r.status === 404);

  // --- document upload ---
  const fd = new FormData();
  fd.append('files', new Blob([Buffer.from('%PDF-1.4 fake passport scan')], { type: 'application/pdf' }), 'passport.pdf');
  let up = await fetch(`${base}/api/visas/${reqId}/documents`, { method: 'POST', headers: { cookie: customer }, body: fd });
  let upData = await up.json();
  check('upload a PDF document -> 201', up.status === 201 && upData.documents?.length === 1);
  const docId = upData.documents?.[0]?.id;

  // reject an unsupported type
  const badFd = new FormData();
  badFd.append('files', new Blob([Buffer.from('x')], { type: 'application/x-msdownload' }), 'evil.exe');
  up = await fetch(`${base}/api/visas/${reqId}/documents`, { method: 'POST', headers: { cookie: customer }, body: badFd });
  check('upload of unsupported type -> 400', up.status === 400);

  r = await json(`/api/visas/${reqId}`, { headers: { cookie: customer } });
  check('request detail lists the uploaded document', r.data.request?.documents?.length === 1);

  // document download: owner can, other cannot
  let dl = await fetch(`${base}/api/visas/${reqId}/documents/${docId}`, { headers: { cookie: customer } });
  check('owner downloads the document -> 200 pdf', dl.status === 200 && (dl.headers.get('content-type') || '').includes('pdf'));
  dl = await fetch(`${base}/api/visas/${reqId}/documents/${docId}`, { headers: { cookie: other } });
  check('non-owner download -> 404', dl.status === 404);

  // --- payment (simulated) ---
  r = await post(`/api/payments/visa/${reqId}/checkout`, {}, customer);
  check('checkout -> 201 with redirect + simulated flag', r.status === 201 && !!r.data.redirectUrl && r.data.simulated === true);
  const payRef = r.data.payment?.ref;

  r = await json(`/api/payments/${payRef}`, { headers: { cookie: customer } });
  check('payment starts pending', r.status === 200 && r.data.payment.status === 'pending');

  r = await post(`/api/payments/${payRef}/confirm`, {}, customer);
  check('confirm payment -> paid', r.status === 200 && r.data.payment.status === 'paid');

  r = await json(`/api/visas/${reqId}`, { headers: { cookie: customer } });
  check('paying moves the request to in_review', r.data.request?.status === 'in_review');

  r = await post(`/api/payments/visa/${reqId}/checkout`, {}, customer);
  check('cannot checkout an already-paid request -> 409', r.status === 409);

  // --- admin queue ---
  r = await json('/api/admin/visas', { headers: { cookie: customer } });
  check('customer hitting admin API -> 403', r.status === 403);

  const admin = await login(adminEmail);
  r = await json('/api/admin/visas?status=in_review', { headers: { cookie: admin } });
  check('admin lists in_review requests', r.status === 200 && r.data.requests.some((x) => x.id === reqId));

  r = await fetch(`${base}/api/admin/visas/${reqId}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', cookie: admin },
    body: JSON.stringify({ status: 'approved', note: 'Docs verified.' }),
  }).then(async (x) => ({ status: x.status, data: await x.json() }));
  check('admin approves the request', r.status === 200 && r.data.request.status === 'approved' && r.data.request.adminNote === 'Docs verified.');

  r = await fetch(`${base}/api/admin/visas/${reqId}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', cookie: admin },
    body: JSON.stringify({ status: 'banana' }),
  }).then((x) => x.status);
  check('admin invalid status -> 400', r === 400);

  // an approved request rejects further document uploads
  const lateFd = new FormData();
  lateFd.append('files', new Blob([Buffer.from('late')], { type: 'application/pdf' }), 'late.pdf');
  up = await fetch(`${base}/api/visas/${reqId}/documents`, { method: 'POST', headers: { cookie: customer }, body: lateFd });
  check('no uploads after a decision -> 409', up.status === 409);
} catch (e) {
  console.error(e);
  fail++;
} finally {
  await pool.end();
  server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
