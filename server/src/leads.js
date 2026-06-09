import express from 'express';
import rateLimit from 'express-rate-limit';
import { query } from './db.js';
import { classifyIdentifier } from './otp.js';

export const leadsRouter = express.Router();

// Public endpoint — rate-limit it so the contact form can't be used to spam.
const leadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

// Capture a lead from the public contact form.
leadsRouter.post('/', leadLimiter, async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    const message = String(req.body?.message || '').trim();
    const contact = String(req.body?.contact || '').trim();
    if (!name || !message) {
      return res.status(400).json({ error: 'Name and message are required' });
    }
    // Accept an optional email or mobile; classify it so we store it tidily.
    let email = null, mobile = null;
    const id = classifyIdentifier(contact);
    if (id?.type === 'email') email = id.value;
    else if (id?.type === 'mobile') mobile = id.value;

    await query(
      'insert into leads (name, email, mobile, message) values ($1, $2, $3, $4)',
      [name.slice(0, 200), email, mobile, message.slice(0, 4000)],
    );
    res.status(201).json({ ok: true, message: 'Thanks — our team will be in touch.' });
  } catch (e) { next(e); }
});
