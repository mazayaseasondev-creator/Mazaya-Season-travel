import express from 'express';
import { query } from './db.js';
import { requireAuth } from './auth.js';
import { flightSupplier } from './suppliers/flights/index.js';
import { getMarkup } from './pricing.js';

export const flightsRouter = express.Router();

const CANCELLABLE = new Set(['pending_payment', 'ticketed']);

function publicBooking(b) {
  return {
    id: b.id,
    status: b.status,
    airline: b.airline,
    flightNumber: b.flight_number,
    origin: b.origin,
    destination: b.destination,
    departAt: b.depart_at,
    arriveAt: b.arrive_at,
    cabin: b.cabin,
    passengers: b.passengers,
    leadPassenger: b.lead_passenger,
    amount: b.amount_cents / 100,
    amountCents: b.amount_cents,
    currency: b.currency,
    pnr: b.pnr,
    ticketingDeadline: b.ticketing_deadline,
    ticketNumbers: b.ticket_numbers ? b.ticket_numbers.split(',') : [],
    createdAt: b.created_at,
    updatedAt: b.updated_at,
  };
}

// Load a booking the caller may see (own booking, or any for admins).
export async function loadFlightBooking(id, user) {
  if (!/^[0-9]+$/.test(String(id))) return null;
  const r = await query('select * from flight_bookings where id = $1', [id]);
  const row = r.rows[0];
  if (!row) return null;
  if (user.role !== 'admin' && String(row.user_id) !== String(user.id)) return null;
  return row;
}

// Called by the payments module once a flight payment is captured: issue the
// ticket(s) with the supplier and store the ticket numbers.
export async function confirmFlightBooking(bookingId) {
  const r = await query('select * from flight_bookings where id = $1', [bookingId]);
  const b = r.rows[0];
  if (!b || b.status !== 'pending_payment') return b;
  const { ticketNumbers } = await flightSupplier.issueTicket({ pnr: b.pnr, passengers: b.passengers });
  const up = await query(
    `update flight_bookings set status = 'ticketed', ticket_numbers = $2, updated_at = now()
     where id = $1 returning *`,
    [bookingId, (ticketNumbers || []).join(',')],
  );
  return up.rows[0];
}

// Reverse a booking when its payment is refunded (admin-initiated): notify the
// supplier and mark it cancelled.
export async function voidFlightBooking(id) {
  const r = await query('select * from flight_bookings where id = $1', [id]);
  const b = r.rows[0];
  if (!b || b.status === 'cancelled') return;
  if (b.pnr) await flightSupplier.cancel(b.pnr);
  await query("update flight_bookings set status = 'cancelled', updated_at = now() where id = $1", [id]);
}

// --- public search ------------------------------------------------------------

flightsRouter.get('/search', async (req, res, next) => {
  try {
    const { origin, destination, departDate } = req.query;
    const adults = parseInt(req.query.adults || '1', 10);
    const markupPercent = await getMarkup('flight');
    const results = await flightSupplier.search({ origin, destination, departDate, adults, markupPercent });
    res.json(results);
  } catch (e) { next(e); }
});

// --- bookings (auth) ----------------------------------------------------------

// Hold a fare: re-price the offer, place a hold (PNR + ticketing deadline) and
// create a pending_payment booking.
flightsRouter.post('/bookings', requireAuth, async (req, res, next) => {
  try {
    const { offerKey, leadPassenger } = req.body || {};
    if (!offerKey || !leadPassenger) {
      return res.status(400).json({ error: 'offerKey and leadPassenger are required' });
    }
    const offer = await flightSupplier.priceOffer(offerKey);
    if (!offer) return res.status(400).json({ error: 'This fare is no longer valid — please search again' });

    const { pnr, ticketingDeadline } = await flightSupplier.hold(offer);
    const created = await query(
      `insert into flight_bookings
         (user_id, supplier, pnr, airline, flight_number, origin, destination, depart_at, arrive_at,
          cabin, passengers, lead_passenger, amount_cents, currency, ticketing_deadline)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning *`,
      [req.user.id, flightSupplier.name, pnr, offer.airline, offer.flightNumber, offer.origin, offer.destination,
       offer.departAt, offer.arriveAt, offer.cabin, offer.passengers, String(leadPassenger).trim(),
       offer.amountCents, offer.currency, ticketingDeadline],
    );
    res.status(201).json({ booking: publicBooking(created.rows[0]) });
  } catch (e) { next(e); }
});

flightsRouter.get('/bookings', requireAuth, async (req, res, next) => {
  try {
    const r = await query('select * from flight_bookings where user_id = $1 order by created_at desc', [req.user.id]);
    res.json({ bookings: r.rows.map(publicBooking) });
  } catch (e) { next(e); }
});

flightsRouter.get('/bookings/:id', requireAuth, async (req, res, next) => {
  try {
    const row = await loadFlightBooking(req.params.id, req.user);
    if (!row) return res.status(404).json({ error: 'Booking not found' });
    res.json({ booking: publicBooking(row) });
  } catch (e) { next(e); }
});

// Cancel a booking (and tell the supplier, if a PNR was held).
flightsRouter.post('/bookings/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    const row = await loadFlightBooking(req.params.id, req.user);
    if (!row) return res.status(404).json({ error: 'Booking not found' });
    if (!CANCELLABLE.has(row.status)) {
      return res.status(409).json({ error: `A ${row.status} booking cannot be cancelled` });
    }
    if (row.pnr) await flightSupplier.cancel(row.pnr);
    const up = await query(
      "update flight_bookings set status = 'cancelled', updated_at = now() where id = $1 returning *",
      [row.id],
    );
    res.json({ booking: publicBooking(up.rows[0]) });
  } catch (e) { next(e); }
});
