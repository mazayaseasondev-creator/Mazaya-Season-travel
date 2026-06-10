import express from 'express';
import { query } from './db.js';

// Keys exposed to the public storefront (everything else is admin-only).
const PUBLIC_KEYS = new Set([
  'company.tradingName', 'company.phone', 'company.email', 'company.website',
  'company.address', 'company.city', 'company.country', 'company.currency',
  'brand.primaryColor', 'brand.accentColor', 'brand.logoUrl', 'brand.tagline',
]);

export async function getSettings() {
  const out = {};
  try {
    const r = await query('select key, value from settings');
    r.rows.forEach((x) => { out[x.key] = x.value; });
  } catch { /* not migrated yet */ }
  return out;
}

export async function getPublicSettings() {
  const all = await getSettings();
  const out = {};
  Object.keys(all).forEach((k) => { if (PUBLIC_KEYS.has(k)) out[k] = all[k]; });
  return out;
}

export async function setSettings(obj) {
  if (!obj || typeof obj !== 'object') throw Object.assign(new Error('settings object required'), { status: 400 });
  const entries = Object.entries(obj).filter(([k]) => typeof k === 'string' && k.length <= 64);
  for (const [key, value] of entries) {
    await query(
      `insert into settings (key, value, updated_at) values ($1, $2, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [key, value == null ? '' : String(value).slice(0, 2000)],
    );
  }
  return getSettings();
}

// Public, unauthenticated read of the whitelisted settings.
export const settingsRouter = express.Router();
settingsRouter.get('/', async (_req, res, next) => {
  try { res.json({ settings: await getPublicSettings() }); } catch (e) { next(e); }
});
