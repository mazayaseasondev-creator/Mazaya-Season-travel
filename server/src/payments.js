import express from 'express';
import { query } from './db.js';
import { config } from './config.js';
import { requireAuth } from './auth.js';
import { gateway } from './gateways/index.js';
import { loadVisaRequest } from './visas.js';

export const paymentsRouter = express.Router();
paymentsRouter.use(requireAuth);

function publicPayment(p) {
  return {
    ref: p.provider_ref,
    provider: p.provider,
    status: p.status,
    amount: p.amount_cents / 100,
    amountCents: p.amount_cents,
    currency: p.currency,
    visaRequestId: p.visa_request_id,
  };
}

// Start paying for a visa request: creates a payment and a gateway session, and
// returns the URL the browser should be sent to in order to pay.
paymentsRouter.post('/visa/:id/checkout', async (req, res, next) => {
  try {
    const reqRow = await loadVisaRequest(req.params.id, req.user);
    if (!reqRow) return res.status(404).json({ error: 'Request not found' });
    if (reqRow.status !== 'awaiting_payment') {
      return res.status(409).json({ error: `This request is "${reqRow.status}" and cannot be paid` });
    }

    // Reuse an existing pending payment instead of stacking up duplicates.
    const existing = await query(
      "select * from payments where visa_request_id = $1 and status = 'pending' order by created_at desc limit 1",
      [reqRow.id],
    );
    let payment = existing.rows[0];
    let providerRef = payment?.provider_ref;
    if (!payment) {
      providerRef = gateway.newRef();
      const ins = await query(
        `insert into payments (user_id, visa_request_id, provider, provider_ref, amount_cents, currency)
         values ($1, $2, $3, $4, $5, $6) returning *`,
        [req.user.id, reqRow.id, gateway.name, providerRef, reqRow.price_cents, reqRow.currency],
      );
      payment = ins.rows[0];
    }

    const returnUrl = `${config.publicBaseUrl}/pages/visa-status.html`;
    const session = await gateway.createSession({
      amountCents: payment.amount_cents,
      currency: payment.currency,
      providerRef,
      returnUrl,
      description: `Visa: ${reqRow.type_name}`,
    });

    res.status(201).json({
      payment: publicPayment(payment),
      redirectUrl: session.redirectUrl,
      simulated: config.paymentsSimulated,
    });
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
    // Move the visa into the review queue, but only from awaiting_payment.
    if (p.visa_request_id) {
      await query(
        "update visa_requests set status = 'in_review', updated_at = now() where id = $1 and status = 'awaiting_payment'",
        [p.visa_request_id],
      );
    }
    res.json({ payment: publicPayment(updated.rows[0]) });
  } catch (e) { next(e); }
});
