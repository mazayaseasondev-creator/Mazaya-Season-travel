import express from 'express';
import jwt from 'jsonwebtoken';
import { query } from './db.js';
import { config } from './config.js';
import {
  classifyIdentifier,
  generateOtp,
  hashOtp,
  verifyOtp,
  sendOtp,
} from './otp.js';

export const authRouter = express.Router();

const COOKIE = 'mz_session';

function publicUser(u) {
  return { id: u.id, email: u.email, mobile: u.mobile, name: u.name, role: u.role, miles: u.miles };
}

async function findOrCreateUser({ type, value }) {
  const col = type === 'email' ? 'email' : 'mobile';
  const found = await query(`select * from users where ${col} = $1`, [value]);
  if (found.rows[0]) return found.rows[0];
  const created = await query(`insert into users (${col}) values ($1) returning *`, [value]);
  return created.rows[0];
}

function issueSession(res, user) {
  const token = jwt.sign({ sub: String(user.id) }, config.jwtSecret, {
    expiresIn: `${config.sessionTtlDays}d`,
  });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: config.sessionTtlDays * 24 * 60 * 60 * 1000,
  });
}

// Middleware: require a valid session cookie and attach req.user.
export async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const r = await query('select * from users where id = $1', [payload.sub]);
    if (!r.rows[0]) return res.status(401).json({ error: 'Not authenticated' });
    req.user = r.rows[0];
    next();
  } catch {
    return res.status(401).json({ error: 'Not authenticated' });
  }
}

// Step 1: request a one-time code for an email or mobile number.
authRouter.post('/request-otp', async (req, res, next) => {
  try {
    const id = classifyIdentifier(req.body?.identifier);
    if (!id) return res.status(400).json({ error: 'Enter a valid email or mobile number' });

    const user = await findOrCreateUser(id);
    const code = generateOtp();
    const expiresAt = new Date(Date.now() + config.otpTtlMinutes * 60 * 1000);

    // Invalidate any previous unused codes for this user, then store the new one.
    await query('update otp_codes set consumed = true where user_id = $1 and consumed = false', [user.id]);
    await query(
      'insert into otp_codes (user_id, code_hash, expires_at) values ($1, $2, $3)',
      [user.id, hashOtp(code), expiresAt],
    );
    await sendOtp(id.value, code);

    const body = { ok: true, message: 'Verification code sent' };
    if (config.exposeOtp) body.devCode = code; // development convenience only
    res.json(body);
  } catch (e) {
    next(e);
  }
});

// Step 2: verify the code and start a session.
authRouter.post('/verify-otp', async (req, res, next) => {
  try {
    const id = classifyIdentifier(req.body?.identifier);
    const code = String(req.body?.code || '').trim();
    if (!id || !/^[0-9]{6}$/.test(code)) {
      return res.status(400).json({ error: 'Enter the identifier and the 6-digit code' });
    }

    const col = id.type === 'email' ? 'email' : 'mobile';
    const u = await query(`select * from users where ${col} = $1`, [id.value]);
    const user = u.rows[0];
    // Generic error so we don't reveal whether the identifier exists.
    if (!user) return res.status(400).json({ error: 'Invalid or expired code' });

    const r = await query(
      'select * from otp_codes where user_id = $1 and consumed = false order by created_at desc limit 1',
      [user.id],
    );
    const otp = r.rows[0];
    if (!otp) return res.status(400).json({ error: 'Invalid or expired code' });
    if (new Date(otp.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Code expired, request a new one' });
    }
    if (otp.attempts >= config.otpMaxAttempts) {
      return res.status(429).json({ error: 'Too many attempts, request a new code' });
    }
    if (!verifyOtp(code, otp.code_hash)) {
      await query('update otp_codes set attempts = attempts + 1 where id = $1', [otp.id]);
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    await query('update otp_codes set consumed = true where id = $1', [otp.id]);
    issueSession(res, user);
    res.json({ ok: true, user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

// Who am I? (used by protected pages such as the account page)
authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

authRouter.post('/logout', (req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});
