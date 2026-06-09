import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { mkdirSync, createReadStream, existsSync } from 'node:fs';
import { extname, join, basename } from 'node:path';
import { query } from './db.js';
import { config } from './config.js';
import { requireAuth } from './auth.js';

// Documents can be uploaded while a request is still open. Once a decision has
// been made (approved/rejected) or it was cancelled, uploads are closed.
const UPLOADABLE_STATUSES = new Set(['awaiting_payment', 'in_review']);

// Accept the document formats a visa application normally needs.
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
]);

mkdirSync(config.uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname).slice(0, 10).replace(/[^.a-z0-9]/gi, '');
    cb(null, `${crypto.randomBytes(16).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes, files: config.maxDocumentsPerRequest },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(Object.assign(new Error('Unsupported file type. Upload a PDF or image.'), { status: 400 }));
  },
});

// ---- shaping helpers ---------------------------------------------------------

function publicType(t) {
  return {
    id: t.id, code: t.code, name: t.name, country: t.country,
    price: t.price_cents / 100, priceCents: t.price_cents,
    currency: t.currency, processingDays: t.processing_days,
  };
}

function publicDocument(d) {
  return { id: d.id, kind: d.kind, name: d.original_name, mime: d.mime, size: d.size_bytes, uploadedAt: d.created_at };
}

function publicRequest(r) {
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
    type: r.type_name ? { code: r.type_code, name: r.type_name, country: r.type_country, price: r.price_cents / 100, priceCents: r.price_cents, currency: r.currency } : undefined,
    payment: r.payment_status ? { ref: r.payment_ref, status: r.payment_status, amount: r.payment_amount_cents / 100, currency: r.payment_currency } : null,
  };
}

// Join a request with its visa type and latest payment. Used by both the
// customer and admin views.
const REQUEST_SELECT = `
  select vr.*,
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
  join visa_types vt on vt.id = vr.visa_type_id
  left join lateral (
    select * from payments where visa_request_id = vr.id order by created_at desc limit 1
  ) p on true`;

// Load a request the caller is allowed to see (own request, or any for admins).
export async function loadVisaRequest(id, user) {
  if (!/^[0-9]+$/.test(String(id))) return null;
  const r = await query(`${REQUEST_SELECT} where vr.id = $1`, [id]);
  const row = r.rows[0];
  if (!row) return null;
  if (user.role !== 'admin' && String(row.user_id) !== String(user.id)) return null;
  return row;
}

// Reverse a visa request when its payment is refunded (admin-initiated).
export async function voidVisaRequest(id) {
  await query("update visa_requests set status = 'cancelled', updated_at = now() where id = $1", [id]);
}

// ---- public catalogue --------------------------------------------------------

export const visaTypesRouter = express.Router();

visaTypesRouter.get('/', async (_req, res, next) => {
  try {
    const r = await query('select * from visa_types where active = true order by price_cents asc');
    res.json({ visaTypes: r.rows.map(publicType) });
  } catch (e) { next(e); }
});

// ---- customer visa requests --------------------------------------------------

export const visasRouter = express.Router();
visasRouter.use(requireAuth);

// Create a request. Starts in 'awaiting_payment'.
visasRouter.post('/', async (req, res, next) => {
  try {
    const { visaTypeCode, applicantName, nationality, passportNumber, travelDate } = req.body || {};
    if (!visaTypeCode || !applicantName || !nationality || !passportNumber) {
      return res.status(400).json({ error: 'visaTypeCode, applicantName, nationality and passportNumber are required' });
    }
    const t = await query('select * from visa_types where code = $1 and active = true', [String(visaTypeCode)]);
    const type = t.rows[0];
    if (!type) return res.status(400).json({ error: 'Unknown visa type' });

    const date = travelDate && /^\d{4}-\d{2}-\d{2}$/.test(travelDate) ? travelDate : null;
    const created = await query(
      `insert into visa_requests (user_id, visa_type_id, applicant_name, nationality, passport_number, travel_date)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [req.user.id, type.id, String(applicantName).trim(), String(nationality).trim(), String(passportNumber).trim(), date],
    );
    const full = await loadVisaRequest(created.rows[0].id, req.user);
    res.status(201).json({ request: publicRequest(full) });
  } catch (e) { next(e); }
});

// List the caller's requests (newest first).
visasRouter.get('/', async (req, res, next) => {
  try {
    const r = await query(`${REQUEST_SELECT} where vr.user_id = $1 order by vr.created_at desc`, [req.user.id]);
    res.json({ requests: r.rows.map(publicRequest) });
  } catch (e) { next(e); }
});

// One request with its documents.
visasRouter.get('/:id', async (req, res, next) => {
  try {
    const row = await loadVisaRequest(req.params.id, req.user);
    if (!row) return res.status(404).json({ error: 'Request not found' });
    const docs = await query('select * from visa_documents where visa_request_id = $1 order by created_at', [row.id]);
    res.json({ request: { ...publicRequest(row), documents: docs.rows.map(publicDocument) } });
  } catch (e) { next(e); }
});

// Upload one or more supporting documents.
visasRouter.post('/:id/documents', upload.array('files', config.maxDocumentsPerRequest), async (req, res, next) => {
  try {
    const row = await loadVisaRequest(req.params.id, req.user);
    if (!row) return res.status(404).json({ error: 'Request not found' });
    if (!UPLOADABLE_STATUSES.has(row.status)) {
      return res.status(409).json({ error: `Cannot add documents to a ${row.status} request` });
    }
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'Attach at least one file in the "files" field' });

    const saved = [];
    for (const f of files) {
      const ins = await query(
        `insert into visa_documents (visa_request_id, kind, original_name, stored_name, mime, size_bytes)
         values ($1, $2, $3, $4, $5, $6) returning *`,
        [row.id, String(req.body?.kind || 'document'), f.originalname, f.filename, f.mimetype, f.size],
      );
      saved.push(publicDocument(ins.rows[0]));
    }
    res.status(201).json({ documents: saved });
  } catch (e) { next(e); }
});

// Download a document (owner or admin).
visasRouter.get('/:id/documents/:docId', async (req, res, next) => {
  try {
    const row = await loadVisaRequest(req.params.id, req.user);
    if (!row) return res.status(404).json({ error: 'Request not found' });
    const d = await query('select * from visa_documents where id = $1 and visa_request_id = $2', [req.params.docId, row.id]);
    const doc = d.rows[0];
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    // basename() guards against any path trickery in stored_name.
    const path = join(config.uploadDir, basename(doc.stored_name));
    if (!existsSync(path)) return res.status(410).json({ error: 'File no longer available' });
    if (doc.mime) res.type(doc.mime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.original_name)}"`);
    createReadStream(path).pipe(res);
  } catch (e) { next(e); }
});
