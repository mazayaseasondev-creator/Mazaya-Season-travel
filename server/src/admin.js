import express from 'express';
import { query } from './db.js';
import { requireAuth, requireAdmin } from './auth.js';
import { getMarkups, setMarkup, listVouchers, createVoucher, setVoucherActive } from './pricing.js';
import { getSettings, setSettings } from './settings.js';
import { listNotifications, createNotification } from './notifications.js';

export const adminRouter = express.Router();
adminRouter.use(requireAuth, requireAdmin);

// ---- Notifications (outbound message log + compose) ----
adminRouter.get('/notifications', async (req, res, next) => {
  try { res.json({ notifications: await listNotifications(req.query.status) }); } catch (e) { next(e); }
});
adminRouter.post('/notifications', async (req, res, next) => {
  try {
    const { channel, recipient, subject, body } = req.body || {};
    if (!recipient || !subject) return res.status(400).json({ error: 'recipient and subject are required' });
    const n = await createNotification({ channel, recipient: String(recipient).trim(), subject: String(subject).trim(), body: body || '' });
    if (!n) return res.status(500).json({ error: 'Could not send notification' });
    res.status(201).json({ notification: { id: n.id, channel: n.channel, recipient: n.recipient, subject: n.subject, body: n.body, status: n.status, createdAt: n.created_at } });
  } catch (e) { next(e); }
});

// ---- Company settings (Company info + Look & Feel) ----
adminRouter.get('/settings', async (_req, res, next) => {
  try { res.json({ settings: await getSettings() }); } catch (e) { next(e); }
});
adminRouter.put('/settings', async (req, res, next) => {
  try { res.json({ settings: await setSettings(req.body && req.body.settings) }); } catch (e) { next(e); }
});

// ---- Pricing: markup rules ----
adminRouter.get('/pricing', async (_req, res, next) => {
  try { res.json({ markups: await getMarkups() }); } catch (e) { next(e); }
});
adminRouter.put('/pricing', async (req, res, next) => {
  try {
    const { product, markupPercent } = req.body || {};
    res.json(await setMarkup(product, markupPercent));
  } catch (e) { next(e); }
});

// ---- Pricing: vouchers ----
adminRouter.get('/vouchers', async (_req, res, next) => {
  try { res.json({ vouchers: await listVouchers() }); } catch (e) { next(e); }
});
adminRouter.post('/vouchers', async (req, res, next) => {
  try { res.status(201).json({ voucher: await createVoucher(req.body || {}) }); } catch (e) { next(e); }
});
adminRouter.patch('/vouchers/:id', async (req, res, next) => {
  try {
    if (!/^[0-9]+$/.test(req.params.id)) return res.status(404).json({ error: 'Voucher not found' });
    res.json({ voucher: await setVoucherActive(req.params.id, req.body && req.body.active) });
  } catch (e) { next(e); }
});

// ---- Manually-raised invoices ----
function publicInvoice(i) {
  return {
    id: i.id, number: 'INV-' + (2000 + i.id), contact: i.contact, description: i.description,
    amount: i.amount_cents / 100, currency: i.currency, status: i.status, createdAt: i.created_at,
  };
}
adminRouter.get('/invoices', async (_req, res, next) => {
  try {
    const r = await query('select * from invoices order by created_at desc limit 200');
    res.json({ invoices: r.rows.map(publicInvoice) });
  } catch (e) { next(e); }
});
adminRouter.post('/invoices', async (req, res, next) => {
  try {
    const { contact, description, amount, currency } = req.body || {};
    if (!contact || !description || !(Number(amount) > 0)) {
      return res.status(400).json({ error: 'contact, description and a positive amount are required' });
    }
    const cents = Math.round(Number(amount) * 100);
    const u = await query('select id from users where email = $1 or mobile = $1', [String(contact).trim()]);
    const r = await query(
      `insert into invoices (user_id, contact, description, amount_cents, currency)
       values ($1,$2,$3,$4,$5) returning *`,
      [u.rows[0] ? u.rows[0].id : null, String(contact).trim(), String(description).trim(), cents, currency || 'AED'],
    );
    res.status(201).json({ invoice: publicInvoice(r.rows[0]) });
  } catch (e) { next(e); }
});

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

function byStatus(rows) { return Object.fromEntries(rows.map((x) => [x.status, x.count])); }
function totalOf(map) { return Object.values(map).reduce((a, b) => a + b, 0); }

// Dashboard summary: live counts, revenue and headline numbers.
adminRouter.get('/stats', async (_req, res, next) => {
  try {
    const visas = byStatus((await query('select status, count(*)::int as count from visa_requests group by status')).rows);
    const hotels = byStatus((await query('select status, count(*)::int as count from hotel_bookings group by status')).rows);
    const flights = byStatus((await query('select status, count(*)::int as count from flight_bookings group by status')).rows);
    const tours = byStatus((await query('select status, count(*)::int as count from tour_bookings group by status')).rows);

    // Revenue = captured (paid) payments; refunds are tracked separately.
    const rev = await query("select coalesce(sum(amount_cents),0)::bigint as cents from payments where status = 'paid'");
    const refunded = await query("select coalesce(sum(amount_cents),0)::bigint as cents from payments where status = 'refunded'");
    const customers = await query("select count(*)::int as count from users where role = 'customer'");
    const openLeads = await query("select count(*)::int as count from leads where status = 'new'");
    const visaQueue = visas.in_review || 0;

    res.json({
      revenue: Number(rev.rows[0].cents) / 100,
      refunded: Number(refunded.rows[0].cents) / 100,
      currency: 'AED',
      customers: customers.rows[0].count,
      openLeads: openLeads.rows[0].count,
      visaReviewQueue: visaQueue,
      bookingsTotal: totalOf(hotels) + totalOf(flights) + totalOf(tours),
      visaRequests: visas,
      hotelBookings: hotels,
      flightBookings: flights,
      tourBookings: tours,
    });
  } catch (e) { next(e); }
});

// Customers list with lifetime spend and booking counts.
adminRouter.get('/customers', async (_req, res, next) => {
  try {
    const r = await query(`
      select u.id, u.email, u.mobile, u.name, u.miles, u.created_at,
             coalesce(p.spend, 0) as spend_cents,
             coalesce(p.paid_count, 0)::int as paid_count
        from users u
        left join lateral (
          select sum(amount_cents) as spend, count(*) as paid_count
            from payments where user_id = u.id and status = 'paid'
        ) p on true
       where u.role = 'customer'
       order by u.created_at desc`);
    res.json({
      customers: r.rows.map((c) => ({
        id: c.id, email: c.email, mobile: c.mobile, name: c.name, miles: c.miles,
        spend: Number(c.spend_cents) / 100, paidCount: c.paid_count, createdAt: c.created_at,
      })),
    });
  } catch (e) { next(e); }
});

// Payments ledger (for reconciliation and refunds).
adminRouter.get('/payments', async (req, res, next) => {
  try {
    const status = req.query.status;
    const params = [];
    let where = '';
    if (status) { params.push(String(status)); where = 'where p.status = $1'; }
    const r = await query(
      `select p.*, u.email as user_email, u.mobile as user_mobile
         from payments p join users u on u.id = p.user_id
         ${where} order by p.created_at desc limit 200`,
      params,
    );
    res.json({
      payments: r.rows.map((p) => ({
        ref: p.provider_ref, provider: p.provider, status: p.status,
        amount: p.amount_cents / 100, currency: p.currency,
        kind: p.visa_request_id ? 'visa' : p.hotel_booking_id ? 'hotel' : p.flight_booking_id ? 'flight' : p.tour_booking_id ? 'tour' : null,
        customer: { id: p.user_id, email: p.user_email, mobile: p.user_mobile },
        createdAt: p.created_at, updatedAt: p.updated_at,
      })),
    });
  } catch (e) { next(e); }
});

// Leads from the public contact form.
adminRouter.get('/leads', async (req, res, next) => {
  try {
    const status = req.query.status;
    const params = [];
    let where = '';
    if (status) { params.push(String(status)); where = 'where status = $1'; }
    const r = await query(`select * from leads ${where} order by created_at desc limit 200`, params);
    res.json({
      leads: r.rows.map((l) => ({
        id: l.id, name: l.name, email: l.email, mobile: l.mobile,
        message: l.message, source: l.source, status: l.status, createdAt: l.created_at,
      })),
    });
  } catch (e) { next(e); }
});

// Read-only hotel booking list for the operations team.
adminRouter.get('/hotel-bookings', async (req, res, next) => {
  try {
    const status = req.query.status;
    const params = [];
    let where = '';
    if (status) { params.push(String(status)); where = 'where hb.status = $1'; }
    const r = await query(
      `select hb.*, u.email as user_email, u.mobile as user_mobile
         from hotel_bookings hb join users u on u.id = hb.user_id
         ${where} order by hb.created_at desc`,
      params,
    );
    res.json({
      bookings: r.rows.map((b) => ({
        id: b.id, status: b.status, hotelName: b.hotel_name, city: b.city,
        roomName: b.room_name, leadGuest: b.lead_guest, checkIn: b.check_in, checkOut: b.check_out,
        nights: b.nights, amount: b.amount_cents / 100, currency: b.currency,
        supplierRef: b.supplier_ref, voucherCode: b.voucher_code,
        customer: { id: b.user_id, email: b.user_email, mobile: b.user_mobile },
      })),
    });
  } catch (e) { next(e); }
});

// Read-only tour booking list for the operations team.
adminRouter.get('/tour-bookings', async (req, res, next) => {
  try {
    const status = req.query.status;
    const params = [];
    let where = '';
    if (status) { params.push(String(status)); where = 'where tb.status = $1'; }
    const r = await query(
      `select tb.*, u.email as user_email, u.mobile as user_mobile
         from tour_bookings tb join users u on u.id = tb.user_id
         ${where} order by tb.created_at desc`,
      params,
    );
    res.json({
      bookings: r.rows.map((b) => ({
        id: b.id, status: b.status, tourName: b.tour_name, city: b.city, date: b.tour_date,
        transferOption: b.transfer_option, guideOption: b.guide_option,
        travellers: b.travellers, leadTraveller: b.lead_traveller,
        amount: b.amount_cents / 100, currency: b.currency,
        supplierRef: b.supplier_ref, voucherCode: b.voucher_code,
        customer: { id: b.user_id, email: b.user_email, mobile: b.user_mobile },
      })),
    });
  } catch (e) { next(e); }
});

// Read-only flight booking list for the operations team.
adminRouter.get('/flight-bookings', async (req, res, next) => {
  try {
    const status = req.query.status;
    const params = [];
    let where = '';
    if (status) { params.push(String(status)); where = 'where fb.status = $1'; }
    const r = await query(
      `select fb.*, u.email as user_email, u.mobile as user_mobile
         from flight_bookings fb join users u on u.id = fb.user_id
         ${where} order by fb.created_at desc`,
      params,
    );
    res.json({
      bookings: r.rows.map((b) => ({
        id: b.id, status: b.status, airline: b.airline, flightNumber: b.flight_number,
        origin: b.origin, destination: b.destination, departAt: b.depart_at,
        passengers: b.passengers, leadPassenger: b.lead_passenger,
        amount: b.amount_cents / 100, currency: b.currency, pnr: b.pnr,
        ticketNumbers: b.ticket_numbers ? b.ticket_numbers.split(',') : [],
        customer: { id: b.user_id, email: b.user_email, mobile: b.user_mobile },
      })),
    });
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
