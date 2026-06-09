import express from 'express';
import { query } from './db.js';
import { config } from './config.js';
import { requireAuth, requireAdmin } from './auth.js';
import { gateway } from './gateways/index.js';
import { loadVisaRequest, voidVisaRequest } from './visas.js';
import { loadHotelBooking, confirmHotelBooking, voidHotelBooking } from './hotels.js';
import { loadFlightBooking, confirmFlightBooking, voidFlightBooking } from './flights.js';
import { loadTourBooking, confirmTourBooking, voidTourBooking } from './tours.js';

export const paymentsRouter = express.Router();
paymentsRouter.use(requireAuth);

function publicPayment(p) {
  const kind = p.visa_request_id ? 'visa'
    : p.hotel_booking_id ? 'hotel'
    : p.flight_booking_id ? 'flight'
    : p.tour_booking_id ? 'tour' : null;
  return {
    ref: p.provider_ref,
    provider: p.provider,
    status: p.status,
    amount: p.amount_cents / 100,
    amountCents: p.amount_cents,
    currency: p.currency,
    kind,
    visaRequestId: p.visa_request_id,
    hotelBookingId: p.hotel_booking_id,
    flightBookingId: p.flight_booking_id,
    tourBookingId: p.tour_booking_id,
  };
}

// Create (or reuse a pending) payment for an item and open a gateway session.
// `column` is a trusted literal chosen by the route, never user input.
async function startCheckout({ user, column, itemId, amountCents, currency, description, returnUrl }, res) {
  const existing = await query(
    `select * from payments where ${column} = $1 and status = 'pending' order by created_at desc limit 1`,
    [itemId],
  );
  let payment = existing.rows[0];
  let providerRef = payment?.provider_ref;
  if (!payment) {
    providerRef = gateway.newRef();
    const ins = await query(
      `insert into payments (user_id, ${column}, provider, provider_ref, amount_cents, currency)
       values ($1, $2, $3, $4, $5, $6) returning *`,
      [user.id, itemId, gateway.name, providerRef, amountCents, currency],
    );
    payment = ins.rows[0];
  }
  const session = await gateway.createSession({
    amountCents: payment.amount_cents, currency: payment.currency, providerRef, returnUrl, description,
  });
  res.status(201).json({ payment: publicPayment(payment), redirectUrl: session.redirectUrl, simulated: config.paymentsSimulated });
}

// Pay for a visa request.
paymentsRouter.post('/visa/:id/checkout', async (req, res, next) => {
  try {
    const reqRow = await loadVisaRequest(req.params.id, req.user);
    if (!reqRow) return res.status(404).json({ error: 'Request not found' });
    if (reqRow.status !== 'awaiting_payment') {
      return res.status(409).json({ error: `This request is "${reqRow.status}" and cannot be paid` });
    }
    await startCheckout({
      user: req.user, column: 'visa_request_id', itemId: reqRow.id,
      amountCents: reqRow.price_cents, currency: reqRow.currency,
      description: `Visa: ${reqRow.type_name}`,
      returnUrl: `${config.publicBaseUrl}/pages/visa-status.html`,
    }, res);
  } catch (e) { next(e); }
});

// Pay for a hotel booking.
paymentsRouter.post('/hotel/:id/checkout', async (req, res, next) => {
  try {
    const booking = await loadHotelBooking(req.params.id, req.user);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.status !== 'pending_payment') {
      return res.status(409).json({ error: `This booking is "${booking.status}" and cannot be paid` });
    }
    await startCheckout({
      user: req.user, column: 'hotel_booking_id', itemId: booking.id,
      amountCents: booking.amount_cents, currency: booking.currency,
      description: `Hotel: ${booking.hotel_name}`,
      returnUrl: `${config.publicBaseUrl}/pages/hotel-bookings.html`,
    }, res);
  } catch (e) { next(e); }
});

// Pay for a flight booking.
paymentsRouter.post('/flight/:id/checkout', async (req, res, next) => {
  try {
    const booking = await loadFlightBooking(req.params.id, req.user);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.status !== 'pending_payment') {
      return res.status(409).json({ error: `This booking is "${booking.status}" and cannot be paid` });
    }
    await startCheckout({
      user: req.user, column: 'flight_booking_id', itemId: booking.id,
      amountCents: booking.amount_cents, currency: booking.currency,
      description: `Flight: ${booking.airline} ${booking.flight_number}`,
      returnUrl: `${config.publicBaseUrl}/pages/flight-bookings.html`,
    }, res);
  } catch (e) { next(e); }
});

// Pay for a tour booking.
paymentsRouter.post('/tour/:id/checkout', async (req, res, next) => {
  try {
    const booking = await loadTourBooking(req.params.id, req.user);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.status !== 'pending_payment') {
      return res.status(409).json({ error: `This booking is "${booking.status}" and cannot be paid` });
    }
    await startCheckout({
      user: req.user, column: 'tour_booking_id', itemId: booking.id,
      amountCents: booking.amount_cents, currency: booking.currency,
      description: `Tour: ${booking.tour_name}`,
      returnUrl: `${config.publicBaseUrl}/pages/tour-bookings.html`,
    }, res);
  } catch (e) { next(e); }
});

// Look up a payment's status (owner or admin).
paymentsRouter.get('/:ref', async (req, res, next) => {
  try {
    const r = await query('select * from payments where provider_ref = $1', [req.params.ref]);
    const p = r.rows[0];
    if (!p || (req.user.role !== 'admin' && String(p.user_id) !== String(req.user.id))) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    res.json({ payment: publicPayment(p) });
  } catch (e) { next(e); }
});

// Complete a payment in the SIMULATED gateway. The real N-Genius flow confirms
// payment via a signed server-to-server callback instead; this endpoint is only
// available when the simulated provider is active.
paymentsRouter.post('/:ref/confirm', async (req, res, next) => {
  try {
    if (!config.paymentsSimulated) {
      return res.status(404).json({ error: 'Not available for this payment provider' });
    }
    const r = await query('select * from payments where provider_ref = $1', [req.params.ref]);
    const p = r.rows[0];
    if (!p || String(p.user_id) !== String(req.user.id)) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    if (p.status === 'paid') {
      return res.json({ payment: publicPayment(p), alreadyPaid: true });
    }
    if (p.status !== 'pending') {
      return res.status(409).json({ error: `Payment is ${p.status}` });
    }

    const updated = await query(
      "update payments set status = 'paid', updated_at = now() where id = $1 returning *",
      [p.id],
    );
    await fulfillPayment(updated.rows[0]);
    res.json({ payment: publicPayment(updated.rows[0]) });
  } catch (e) { next(e); }
});

// Refund a captured payment and reverse the linked booking (admin only).
paymentsRouter.post('/:ref/refund', requireAdmin, async (req, res, next) => {
  try {
    const r = await query('select * from payments where provider_ref = $1', [req.params.ref]);
    const p = r.rows[0];
    if (!p) return res.status(404).json({ error: 'Payment not found' });
    if (p.status === 'refunded') return res.json({ payment: publicPayment(p), alreadyRefunded: true });
    if (p.status !== 'paid') return res.status(409).json({ error: `Only paid payments can be refunded (this is ${p.status})` });

    // A real gateway would call its refund API here; the simulated one is instant.
    const updated = await query(
      "update payments set status = 'refunded', updated_at = now() where id = $1 returning *",
      [p.id],
    );
    await reversePayment(updated.rows[0]);
    res.json({ payment: publicPayment(updated.rows[0]) });
  } catch (e) { next(e); }
});

// Move the purchased item forward once its payment is captured.
async function fulfillPayment(payment) {
  if (payment.visa_request_id) {
    await query(
      "update visa_requests set status = 'in_review', updated_at = now() where id = $1 and status = 'awaiting_payment'",
      [payment.visa_request_id],
    );
  }
  if (payment.hotel_booking_id) {
    await confirmHotelBooking(payment.hotel_booking_id);
  }
  if (payment.flight_booking_id) {
    await confirmFlightBooking(payment.flight_booking_id);
  }
  if (payment.tour_booking_id) {
    await confirmTourBooking(payment.tour_booking_id);
  }
}

// Reverse the purchased item when its payment is refunded.
async function reversePayment(payment) {
  if (payment.visa_request_id) await voidVisaRequest(payment.visa_request_id);
  if (payment.hotel_booking_id) await voidHotelBooking(payment.hotel_booking_id);
  if (payment.flight_booking_id) await voidFlightBooking(payment.flight_booking_id);
  if (payment.tour_booking_id) await voidTourBooking(payment.tour_booking_id);
}
