// End-to-end smoke test for the auth flow. Requires a reachable PostgreSQL
// (via DATABASE_URL or PG* env vars). Run with: npm run smoke
import { migrate, pool } from '../src/db.js';
import { createApp } from '../src/index.js';

let pass = 0, fail = 0;
function check(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  cond ? pass++ : fail++;
}

await migrate();
const app = createApp();
const server = app.listen(0);
const port = server.address().port;
const base = `http://localhost:${port}`;

const post = (path, body, headers = {}) =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

try {
  let r = await fetch(base + '/api/health');
  check('GET /api/health -> 200', r.status === 200);

  // Serves the static front-end from the repo root.
  r = await fetch(base + '/index.html');
  check('GET /index.html (static site) -> 200', r.status === 200);

  const identifier = `smoke+${Date.now()}@example.com`;

  r = await post('/api/auth/request-otp', { identifier });
  let d = await r.json();
  check('request-otp returns dev code', r.status === 200 && /^[0-9]{6}$/.test(d.devCode || ''));
  const code = d.devCode;

  r = await post('/api/auth/request-otp', { identifier: 'not-an-id' });
  check('request-otp rejects bad identifier', r.status === 400);

  r = await post('/api/auth/verify-otp', { identifier, code: '000000' });
  check('verify-otp rejects wrong code', r.status === 400);

  r = await post('/api/auth/verify-otp', { identifier, code });
  d = await r.json();
  const setCookie = r.headers.get('set-cookie') || '';
  check('verify-otp succeeds + sets session cookie', r.status === 200 && /mz_session=/.test(setCookie));
  const cookie = setCookie.split(';')[0];

  r = await post('/api/auth/verify-otp', { identifier, code });
  check('verify-otp rejects reused (consumed) code', r.status === 400);

  r = await fetch(base + '/api/auth/me');
  check('GET /me without cookie -> 401', r.status === 401);

  r = await fetch(base + '/api/auth/me', { headers: { cookie } });
  d = await r.json();
  check('GET /me with cookie returns the user', r.status === 200 && d.user?.email === identifier);

  r = await post('/api/auth/logout', {}, { cookie });
  check('logout -> 200', r.status === 200);
} catch (e) {
  console.error(e);
  fail++;
} finally {
  await pool.end();
  server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
