import express from 'express';
import { query } from './db.js';
import { requireAuth } from './auth.js';
import { tourSupplier } from './suppliers/tours/index.js';

export const toursRouter = express.Router();

const CANCELLABLE = new Set(['pending_payment', 'confirmed']);

function publicBooking(b) {
  return {
    id: b.id,
    status: b.status,
    tourName: b.tour_name,
    city: b.city,
    date: b.tour_date,
    transferOption: b.transfer_option,
    guideOption: b.guide_option,
    travellers: b.travellers,
    leadTraveller: b.lead_traveller,
    amount: b.amount_cents / 100,
    amountCents: b.amount_cents,
    currency: b.currency,
    supplierRef: b.supplier_ref,
    voucherCode: b.voucher_code,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
  };
}

// Load a booking the caller may see (own booking, or any for admins).
export async function loadTourBooking(id, user) {
  if (!/^[0-9]+$/.test(String(id))) return null;
  const r = await query('select * from tour_bookings where id = $1', [id]);
  const row = r.rows[0];
  if (!row) return null;
  if (user.role !== 'admin' && String(row.user_id) !== String(user.id)) return null;
  return row;
}

// Called by the payments module once a tour payment is captured: confirm with
// the supplier and store the supplier reference + voucher.
export async function confirmTourBooking(bookingId) {
  const r = await query('select * from tour_bookings where id = $1', [bookingId]);
  const b = r.rows[0];
  if (!b || b.status !== 'pending_payment') return b;
  const { supplierRef, voucherCode } = await tourSupplier.book({
    tourName: b.tour_name, city: b.city, date: b.tour_date,
    transfer: b.transfer_option, guide: b.guide_option, travellers: b.travellers,
  });
  const up = await query(
    `update tour_bookings set status = 'confirmed', supplier_ref = $2, voucher_code = $3, updated_at = now()
     where id = $1 returning *`,
    [bookingId, supplierRef, voucherCode],
  );
  return up.rows[0];
}

// Reverse a booking when its payment is refunded (admin-initiated): notify the
// supplier and mark it cancelled.
export async function voidTourBooking(id) {
  const r = await query('select * from tour_bookings where id = $1', [id]);
  const b = r.rows[0];
  if (!b || b.status === 'cancelled') return;
  if (b.supplier_ref) await tourSupplier.cancel(b.supplier_ref);
  await query("update tour_bookings set status = 'cancelled', updated_at = now() where id = $1", [id]);
}

// --- public search ------------------------------------------------------------

toursRouter.get('/search', async (req, res, next) => {
  try {
    const { city, date } = req.query;
    const travellers = parseInt(req.query.travellers || '1', 10);
    const results = await tourSupplier.search({ city, date, travellers });
    res.json(results);
  } catch (e) { next(e); }
});

// --- bookings (auth) ----------------------------------------------------------

// Book a tour with chosen transfer/guide options (re-priced from the signed key).
toursRouter.post('/bookings', requireAuth, async (req, res, next) => {
  try {
    const { tourKey, transferCode, guideCode, leadTraveller, travellers } = req.body || {};
    if (!tourKey || !leadTraveller) {
      return res.status(400).json({ error: 'tourKey and leadTraveller are required' });
    }
    const priced = await tourSupplier.priceTour(tourKey, { transferCode, guideCode, travellers });
    if (!priced) return res.status(400).json({ error: 'This tour is no longer valid — please search again' });
    if (priced.invalidOption) return res.status(400).json({ error: 'Unknown transfer or guide option' });

    const created = await query(
      `insert into tour_bookings
         (user_id, supplier, tour_name, city, tour_date, transfer_option, guide_option,
          travellers, lead_traveller, amount_cents, currency)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
      [req.user.id, tourSupplier.name, priced.tourName, priced.city, priced.date,
       priced.transferCode, priced.guideCode, priced.travellers, String(leadTraveller).trim(),
       priced.amountCents, priced.currency],
    );
    res.status(201).json({ booking: publicBooking(created.rows[0]) });
  } catch (e) { next(e); }
});

toursRouter.get('/bookings', requireAuth, async (req, res, next) => {
  try {
    const r = await query('select * from tour_bookings where user_id = $1 order by created_at desc', [req.user.id]);
    res.json({ bookings: r.rows.map(publicBooking) });
  } catch (e) { next(e); }
});

toursRouter.get('/bookings/:id', requireAuth, async (req, res, next) => {
  try {
    const row = await loadTourBooking(req.params.id, req.user);
    if (!row) return res.status(404).json({ error: 'Booking not found' });
    res.json({ booking: publicBooking(row) });
  } catch (e) { next(e); }
});

// Cancel a booking (and tell the supplier, if it was already confirmed).
toursRouter.post('/bookings/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    const row = await loadTourBooking(req.params.id, req.user);
    if (!row) return res.status(404).json({ error: 'Booking not found' });
    if (!CANCELLABLE.has(row.status)) {
      return res.status(409).json({ error: `A ${row.status} booking cannot be cancelled` });
    }
    if (row.supplier_ref) await tourSupplier.cancel(row.supplier_ref);
    const up = await query(
      "update tour_bookings set status = 'cancelled', updated_at = now() where id = $1 returning *",
      [row.id],
    );
    res.json({ booking: publicBooking(up.rows[0]) });
  } catch (e) { next(e); }
});
