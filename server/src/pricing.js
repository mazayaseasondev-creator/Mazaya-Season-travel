import express from 'express';
import { query } from './db.js';
import { requireAuth } from './auth.js';

// ---- Markup rules ----------------------------------------------------------
// A per-product markup percentage applied to supplier prices at search time,
// before the rate/offer/tour key is signed — so the customer is quoted (and
// charged) the marked-up price, and the rest of the flow stays consistent.
const PRODUCTS = ['hotel', 'flight', 'tour'];

export async function getMarkups() {
  const out = { hotel: 0, flight: 0, tour: 0 };
  try {
    const r = await query('select product, markup_percent from pricing_rules');
    r.rows.forEach((x) => { out[x.product] = Number(x.markup_percent); });
  } catch { /* table not migrated yet -> no markup */ }
  return out;
}

export async function getMarkup(product) {
  try {
    const r = await query('select markup_percent from pricing_rules where product = $1', [product]);
    return r.rows[0] ? Number(r.rows[0].markup_percent) : 0;
  } catch { return 0; }
}

export async function setMarkup(product, percent) {
  if (!PRODUCTS.includes(product)) throw Object.assign(new Error('Unknown product'), { status: 400 });
  const p = Math.max(0, Math.min(500, Number(percent)));
  if (!Number.isFinite(p)) throw Object.assign(new Error('markupPercent must be a number'), { status: 400 });
  await query(
    `insert into pricing_rules (product, markup_percent, updated_at) values ($1, $2, now())
     on conflict (product) do update set markup_percent = excluded.markup_percent, updated_at = now()`,
    [product, p],
  );
  return { product, markupPercent: p };
}

// ---- Vouchers --------------------------------------------------------------
function publicVoucher(v) {
  return {
    id: v.id, code: v.code, kind: v.kind, value: Number(v.value),
    active: v.active, expiresOn: v.expires_on, maxUses: v.max_uses,
    usedCount: v.used_count, createdAt: v.created_at,
  };
}

export async function listVouchers() {
  const r = await query('select * from vouchers order by created_at desc limit 200');
  return r.rows.map(publicVoucher);
}

export async function createVoucher({ code, kind, value, expiresOn, maxUses }) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) throw Object.assign(new Error('A voucher code is required'), { status: 400 });
  if (!['percent', 'fixed'].includes(kind)) throw Object.assign(new Error("kind must be 'percent' or 'fixed'"), { status: 400 });
  const val = Number(value);
  if (!Number.isFinite(val) || val <= 0) throw Object.assign(new Error('value must be a positive number'), { status: 400 });
  if (kind === 'percent' && val > 100) throw Object.assign(new Error('percent value cannot exceed 100'), { status: 400 });
  try {
    const r = await query(
      `insert into vouchers (code, kind, value, expires_on, max_uses)
       values ($1,$2,$3,$4,$5) returning *`,
      [c, kind, val, expiresOn || null, maxUses ? parseInt(maxUses, 10) : null],
    );
    return publicVoucher(r.rows[0]);
  } catch (e) {
    if (e.code === '23505') throw Object.assign(new Error('A voucher with that code already exists'), { status: 409 });
    throw e;
  }
}

export async function setVoucherActive(id, active) {
  const r = await query('update vouchers set active = $2 where id = $1 returning *', [id, !!active]);
  if (!r.rows[0]) throw Object.assign(new Error('Voucher not found'), { status: 404 });
  return publicVoucher(r.rows[0]);
}

// Validate a code against an amount (in AED) and return the discount it yields.
export async function validateVoucher(code, amount) {
  const c = String(code || '').trim().toUpperCase();
  const r = await query('select * from vouchers where code = $1', [c]);
  const v = r.rows[0];
  if (!v) return { valid: false, reason: 'Unknown voucher code' };
  if (!v.active) return { valid: false, reason: 'This voucher is inactive' };
  if (v.expires_on && new Date(v.expires_on) < new Date(new Date().toDateString())) return { valid: false, reason: 'This voucher has expired' };
  if (v.max_uses != null && v.used_count >= v.max_uses) return { valid: false, reason: 'This voucher has reached its usage limit' };
  const amt = Number(amount) || 0;
  const disc = v.kind === 'percent'
    ? Math.round(amt * Number(v.value)) / 100   // value% of the amount
    : Math.min(amt, Number(v.value));           // fixed amount, capped at total
  return {
    valid: true, code: v.code, kind: v.kind, value: Number(v.value),
    discount: disc, finalAmount: Math.max(0, Math.round((amt - disc) * 100) / 100),
  };
}

// Public (authenticated) router so customers can check a code before paying.
export const vouchersRouter = express.Router();
vouchersRouter.post('/validate', requireAuth, async (req, res, next) => {
  try {
    const { code, amount } = req.body || {};
    res.json(await validateVoucher(code, amount));
  } catch (e) { next(e); }
});
