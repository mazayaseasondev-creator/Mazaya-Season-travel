// End-to-end smoke test for the generic content collections (CMS modules).
// Run: npm run smoke:content

const adminEmail = `cnadmin+${Date.now()}@example.com`;
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
  json(path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });

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
  const customer = await login(`cncust+${Date.now()}@example.com`);

  // create
  let r = await send('POST', '/api/admin/content/faqs', { data: { question: 'Do you offer visas?', answer: 'Yes, for many countries.' } }, admin);
  check('POST content (faq) -> 201', r.status === 201 && r.data.item.question === 'Do you offer visas?' && r.data.item.active === true);
  const id = r.data.item.id;

  // list
  r = await json('/api/admin/content/faqs', { headers: { cookie: admin } });
  check('GET content lists the item', r.status === 200 && r.data.items.some((i) => i.id === id));

  // update (toggle active)
  r = await send('PATCH', `/api/admin/content/faqs/${id}`, { active: false }, admin);
  check('PATCH content toggles active', r.status === 200 && r.data.item.active === false);

  // public read hides inactive
  r = await json('/api/content/faqs');
  check('public read excludes inactive', r.status === 200 && !r.data.items.some((i) => i.id === id));
  await send('PATCH', `/api/admin/content/faqs/${id}`, { active: true }, admin);
  r = await json('/api/content/faqs');
  check('public read includes active', r.data.items.some((i) => i.id === id));

  // unknown collection rejected
  r = await send('POST', '/api/admin/content/not-a-collection', { data: { x: 1 } }, admin);
  check('unknown collection -> 404', r.status === 404);

  // read-only collection cannot be written
  r = await send('POST', '/api/admin/content/activity', { data: { x: 1 } }, admin);
  check('read-only collection rejects writes -> 400', r.status === 400);

  // private collection not exposed publicly
  r = await json('/api/content/b2b-agencies');
  check('non-public collection hidden from /api/content -> 404', r.status === 404);

  // auth guards
  r = await send('POST', '/api/admin/content/faqs', { data: { question: 'x' } }, customer);
  check('customer cannot write content -> 403', r.status === 403);

  // delete
  r = await send('DELETE', `/api/admin/content/faqs/${id}`, undefined, admin);
  check('DELETE content -> ok', r.status === 200 && r.data.ok === true);

  // activity log captured the actions
  r = await json('/api/admin/content/activity', { headers: { cookie: admin } });
  check('activity log recorded create/delete', r.status === 200 && r.data.items.length >= 2);
} catch (e) {
  console.error(e); fail++;
} finally {
  await pool.end();
  server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
