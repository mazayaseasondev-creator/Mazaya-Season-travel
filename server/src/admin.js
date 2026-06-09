import express from 'express';
import { query } from './db.js';
import { requireAuth, requireAdmin } from './auth.js';

export const adminRouter = express.Router();
adminRouter.use(requireAuth, requireAdmin);

// Statuses an admin is allowed to move a request into.
const ADMIN_SETTABLE = new Set(['in_review', 'approved', 'rejected']);

function adminRequest(r) {
  return {
    id: r.id,
    status: r.status,
    applicantName: r.applicant_name,
    nationality: r.nationality,
    passportNumber: r.passport_number,
    travelDate: r.travel_date,
    adminNote: r.admin_note,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    customer: { id: r.user_id, email: r.user_email, mobile: r.user_mobile },
    type: { code: r.type_code, name: r.type_name, country: r.type_country, price: r.price_cents / 100, currency: r.currency },
    payment: r.payment_status ? { ref: r.payment_ref, status: r.payment_status, amount: r.payment_amount_cents / 100, currency: r.payment_currency } : null,
  };
}

const ADMIN_SELECT = `
  select vr.*,
         u.email     as user_email,
         u.mobile    as user_mobile,
         vt.code     as type_code,
         vt.name     as type_name,
         vt.country  as type_country,
         vt.price_cents,
         vt.currency,
         p.provider_ref  as payment_ref,
         p.status        as payment_status,
         p.amount_cents  as payment_amount_cents,
         p.currency      as payment_currency
  from visa_requests vr
  join users u on u.id = vr.user_id
  join visa_types vt on vt.id = vr.visa_type_id
  left join lateral (
    select * from payments where visa_request_id = vr.id order by created_at desc limit 1
  ) p on true`;

// Counts per status, for the dashboard.
adminRouter.get('/stats', async (_req, res, next) => {
  try {
    const r = await query('select status, count(*)::int as count from visa_requests group by status');
    const byStatus = Object.fromEntries(r.rows.map((x) => [x.status, x.count]));
    res.json({ visaRequests: byStatus });
  } catch (e) { next(e); }
});

// The visa queue, optionally filtered by ?status=.
adminRouter.get('/visas', async (req, res, next) => {
  try {
    const status = req.query.status;
    const params = [];
    let where = '';
    if (status) { params.push(String(status)); where = 'where vr.status = $1'; }
    const r = await query(`${ADMIN_SELECT} ${where} order by vr.created_at desc`, params);
    res.json({ requests: r.rows.map(adminRequest) });
  } catch (e) { next(e); }
});

adminRouter.get('/visas/:id', async (req, res, next) => {
  try {
    if (!/^[0-9]+$/.test(req.params.id)) return res.status(404).json({ error: 'Request not found' });
    const r = await query(`${ADMIN_SELECT} where vr.id = $1`, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Request not found' });
    const docs = await query('select * from visa_documents where visa_request_id = $1 order by created_at', [req.params.id]);
    res.json({
      request: {
        ...adminRequest(r.rows[0]),
        documents: docs.rows.map((d) => ({ id: d.id, name: d.original_name, mime: d.mime, size: d.size_bytes, uploadedAt: d.created_at })),
      },
    });
  } catch (e) { next(e); }
});

// Update a request's status and/or attach an internal note.
adminRouter.patch('/visas/:id', async (req, res, next) => {
  try {
    if (!/^[0-9]+$/.test(req.params.id)) return res.status(404).json({ error: 'Request not found' });
    const { status, note } = req.body || {};
    if (status !== undefined && !ADMIN_SETTABLE.has(status)) {
      return res.status(400).json({ error: `status must be one of: ${[...ADMIN_SETTABLE].join(', ')}` });
    }
    if (status === undefined && note === undefined) {
      return res.status(400).json({ error: 'Provide a status and/or a note' });
    }
    const r = await query(
      `update visa_requests
         set status = coalesce($2, status),
             admin_note = coalesce($3, admin_note),
             updated_at = now()
       where id = $1
       returning id`,
      [req.params.id, status ?? null, note ?? null],
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Request not found' });
    const full = await query(`${ADMIN_SELECT} where vr.id = $1`, [req.params.id]);
    res.json({ request: adminRequest(full.rows[0]) });
  } catch (e) { next(e); }
});
