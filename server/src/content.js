import express from 'express';
import { query } from './db.js';
import { requireAuth, requireAdmin } from './auth.js';

// Collections the admin may manage. Anything not listed is rejected, so the
// generic endpoint can't be used to write arbitrary buckets.
export const COLLECTIONS = new Set([
  // CRM / CMS
  'faqs', 'static-pages',
  'block-sliders', 'block-pillars', 'block-offers', 'block-testimonials',
  'block-partners', 'block-register', 'block-banners',
  // Packages
  'pkg-countries', 'pkg-zones', 'pkg-programs', 'pkg-activities',
  // Hotels content
  'hotel-list', 'hotel-facts-group', 'hotel-facts', 'hotel-suppliers', 'hotel-room-translations',
  // Ancillaries
  'ancillary-products', 'ancillary-displays',
  // B2B
  'b2b-agencies',
  // GEO reference
  'geo-states', 'geo-cities', 'geo-cities-mapping', 'geo-autocomplete', 'geo-zones', 'geo-airports',
  // i18n
  'translations',
  // read-only logs (written by the system)
  'activity', 'supplier-logs', 'product-events', 'fire-events',
]);

// Collections readable without auth by the storefront.
const PUBLIC = new Set([
  'faqs', 'static-pages', 'translations',
  'block-sliders', 'block-pillars', 'block-offers', 'block-testimonials',
  'block-partners', 'block-register', 'block-banners',
]);

// Logs are append-only from the admin's point of view (no create/edit UI).
const READONLY = new Set(['activity', 'supplier-logs', 'product-events', 'fire-events']);

function publicItem(r) {
  return { id: r.id, ...r.data, position: r.position, active: r.active, createdAt: r.created_at, updatedAt: r.updated_at };
}

async function listItems(collection) {
  const r = await query(
    'select * from content_items where collection = $1 order by position asc, created_at desc limit 500',
    [collection],
  );
  return r.rows.map(publicItem);
}

// Record an admin action into the activity log (best-effort).
export async function logActivity(action, detail) {
  try {
    await query('insert into content_items (collection, data) values ($1, $2)', ['activity', JSON.stringify({ action, detail })]);
  } catch { /* ignore */ }
}

function assertCollection(c) {
  if (!COLLECTIONS.has(c)) throw Object.assign(new Error('Unknown collection'), { status: 404 });
}

// ---- Admin CRUD ----
export const adminContentRouter = express.Router();
adminContentRouter.use(requireAuth, requireAdmin);

adminContentRouter.get('/:collection', async (req, res, next) => {
  try { assertCollection(req.params.collection); res.json({ items: await listItems(req.params.collection) }); }
  catch (e) { next(e); }
});

adminContentRouter.post('/:collection', async (req, res, next) => {
  try {
    const c = req.params.collection;
    assertCollection(c);
    if (READONLY.has(c)) return res.status(400).json({ error: 'This collection is read-only' });
    const { data = {}, position = 0, active = true } = req.body || {};
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'data object required' });
    const r = await query(
      'insert into content_items (collection, data, position, active) values ($1,$2,$3,$4) returning *',
      [c, JSON.stringify(data), parseInt(position, 10) || 0, active !== false],
    );
    logActivity('create', { collection: c, id: r.rows[0].id });
    res.status(201).json({ item: publicItem(r.rows[0]) });
  } catch (e) { next(e); }
});

adminContentRouter.patch('/:collection/:id', async (req, res, next) => {
  try {
    const c = req.params.collection;
    assertCollection(c);
    if (!/^[0-9]+$/.test(req.params.id)) return res.status(404).json({ error: 'Item not found' });
    const cur = await query('select * from content_items where id = $1 and collection = $2', [req.params.id, c]);
    if (!cur.rows[0]) return res.status(404).json({ error: 'Item not found' });
    const body = req.body || {};
    const data = body.data && typeof body.data === 'object' ? { ...cur.rows[0].data, ...body.data } : cur.rows[0].data;
    const position = body.position != null ? parseInt(body.position, 10) || 0 : cur.rows[0].position;
    const active = body.active != null ? body.active !== false : cur.rows[0].active;
    const r = await query(
      'update content_items set data = $3, position = $4, active = $5, updated_at = now() where id = $1 and collection = $2 returning *',
      [req.params.id, c, JSON.stringify(data), position, active],
    );
    logActivity('update', { collection: c, id: Number(req.params.id) });
    res.json({ item: publicItem(r.rows[0]) });
  } catch (e) { next(e); }
});

adminContentRouter.delete('/:collection/:id', async (req, res, next) => {
  try {
    const c = req.params.collection;
    assertCollection(c);
    if (!/^[0-9]+$/.test(req.params.id)) return res.status(404).json({ error: 'Item not found' });
    const r = await query('delete from content_items where id = $1 and collection = $2 returning id', [req.params.id, c]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Item not found' });
    logActivity('delete', { collection: c, id: Number(req.params.id) });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---- Public read ----
export const publicContentRouter = express.Router();
publicContentRouter.get('/:collection', async (req, res, next) => {
  try {
    const c = req.params.collection;
    if (!PUBLIC.has(c)) return res.status(404).json({ error: 'Not found' });
    const items = (await listItems(c)).filter((i) => i.active);
    res.json({ items });
  } catch (e) { next(e); }
});
