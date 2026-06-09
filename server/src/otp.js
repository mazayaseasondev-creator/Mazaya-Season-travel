import crypto from 'node:crypto';
import { config } from './config.js';

// Decide whether a login identifier is an email or a mobile number.
// Returns { type, value } with a normalised value, or null if invalid.
export function classifyIdentifier(raw) {
  const v = String(raw || '').trim();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
    return { type: 'email', value: v.toLowerCase() };
  }
  const digits = v.replace(/[\s-]/g, '');
  if (/^\+?[0-9]{7,15}$/.test(digits)) {
    return { type: 'mobile', value: digits };
  }
  return null;
}

export function generateOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

// Store only a hash of the code, never the code itself.
export function hashOtp(code) {
  return crypto.createHmac('sha256', config.otpSecret).update(code).digest('hex');
}

// Constant-time comparison to avoid timing attacks.
export function verifyOtp(code, hash) {
  const a = Buffer.from(hashOtp(code));
  const b = Buffer.from(String(hash));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Deliver the code to the user. In development this just logs it; replace with
// an SMS provider (Unifonic / Twilio) or email provider (SES / SendGrid) for
// production.
export async function sendOtp(identifier, code) {
  console.log(`[OTP] code for ${identifier}: ${code}`);
}
