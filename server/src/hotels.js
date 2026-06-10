import express from 'express';
import { query } from './db.js';
import { requireAuth } from './auth.js';
import { hotelSupplier } from './suppliers/hotels/index.js';
import { getMarkup } from './pricing.js';

export const hotelsRouter = express.Router();

const CANCELLABLE = new Set(['pending_payment', 'confirmed']);

function publicBooking(b) {
  return {
    id: b.id,
    status: b.status,
    hotelName: b.hotel_name,
    city: b.city,
    roomName: b.room_name,
    board: b.board,
    leadGuest: b.lead_guest,
    guests: b.guests,
    checkIn: b.check_in,
    checkOut: b.check_out,
    nights: b.nights,
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
export async function loadHotelBooking(id, user) {
  if (!/^[0-9]+$/.test(String(id))) return null;
  const r = await query('select * from hotel_bookings where id = $1', [id]);
  const row = r.rows[0];
  if (!row) return null;
  if (user.role !== 'admin' && String(row.user_id) !== String(user.id)) return null;
  return row;
}

// Called by the payments module once a hotel payment is captured: confirm with
// the supplier and store the supplier reference + voucher.
export async function confirmHotelBooking(bookingId) {
  const r = await query('select * from hotel_bookings where id = $1', [bookingId]);
  const b = r.rows[0];
  if (!b || b.status !== 'pending_payment') return b;
  const { supplierRef, voucherCode } = await hotelSupplier.book({
    hotelName: b.hotel_name, roomName: b.room_name, checkIn: b.check_in, checkOut: b.check_out,
    leadGuest: b.lead_guest, guests: b.guests,
  });
  const up = await query(
    `update hotel_bookings set status = 'confirmed', supplier_ref = $2, voucher_code = $3, updated_at = now()
     where id = $1 returning *`,
    [bookingId, supplierRef, voucherCode],
  );
  return up.rows[0];
}

// Reverse a booking when its payment is refunded (admin-initiated): notify the
// supplier and mark it cancelled.
export async function voidHotelBooking(id) {
  const r = await query('select * from hotel_bookings where id = $1', [id]);
  const b = r.rows[0];
  if (!b || b.status === 'cancelled') return;
  if (b.supplier_ref) await hotelSupplier.cancel(b.supplier_ref);
  await query("update hotel_bookings set status = 'cancelled', updated_at = now() where id = $1", [id]);
}

// --- public search ------------------------------------------------------------

hotelsRouter.get('/search', async (req, res, next) => {
  try {
    const { city, checkIn, checkOut } = req.query;
    const guests = parseInt(req.query.guests || '2', 10);
    const markupPercent = await getMarkup('hotel');
    const results = await hotelSupplier.search({ city, checkIn, checkOut, guests, markupPercent });
    res.json(results);
  } catch (e) { next(e); }
});

// --- bookings (auth) ----------------------------------------------------------

// Hold a room: re-price the chosen rate and create a pending_payment booking.
hotelsRouter.post('/bookings', requireAuth, async (req, res, next) => {
  try {
    const { rateKey, leadGuest, guests } = req.body || {};
    if (!rateKey || !leadGuest) {
      return res.status(400).json({ error: 'rateKey and leadGuest are required' });
    }
    const rate = await hotelSupplier.priceRate(rateKey);
    if (!rate) return res.status(400).json({ error: 'This rate is no longer valid — please search again' });

    const created = await query(
      `insert into hotel_bookings
         (user_id, supplier, hotel_name, city, room_name, board, lead_guest, guests,
          check_in, check_out, nights, amount_cents, currency)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`,
      [req.user.id, hotelSupplier.name, rate.hotelName, rate.city, rate.roomName, rate.board,
       String(leadGuest).trim(), parseInt(guests || '2', 10), rate.checkIn, rate.checkOut,
       rate.nights, rate.amountCents, rate.currency],
    );
    res.status(201).json({ booking: publicBooking(created.rows[0]) });
  } catch (e) { next(e); }
});

hotelsRouter.get('/bookings', requireAuth, async (req, res, next) => {
  try {
    const r = await query('select * from hotel_bookings where user_id = $1 order by created_at desc', [req.user.id]);
    res.json({ bookings: r.rows.map(publicBooking) });
  } catch (e) { next(e); }
});

hotelsRouter.get('/bookings/:id', requireAuth, async (req, res, next) => {
  try {
    const row = await loadHotelBooking(req.params.id, req.user);
    if (!row) return res.status(404).json({ error: 'Booking not found' });
    res.json({ booking: publicBooking(row) });
  } catch (e) { next(e); }
});

// Cancel a booking (and tell the supplier, if it was already confirmed).
hotelsRouter.post('/bookings/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    const row = await loadHotelBooking(req.params.id, req.user);
    if (!row) return res.status(404).json({ error: 'Booking not found' });
    if (!CANCELLABLE.has(row.status)) {
      return res.status(409).json({ error: `A ${row.status} booking cannot be cancelled` });
    }
    if (row.supplier_ref) await hotelSupplier.cancel(row.supplier_ref);
    const up = await query(
      "update hotel_bookings set status = 'cancelled', updated_at = now() where id = $1 returning *",
      [row.id],
    );
    res.json({ booking: publicBooking(up.rows[0]) });
  } catch (e) { next(e); }
});
