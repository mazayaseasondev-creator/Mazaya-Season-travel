import crypto from 'node:crypto';
import { config } from '../config.js';

// A built-in test gateway. It mimics a hosted-payment-page provider (like
// N-Genius) without taking any real money: instead of a bank page, the customer
// is sent to our own /pages/visa-pay.html which can "complete" the payment by
// calling POST /api/payments/:ref/confirm. This lets the whole visa + payment
// flow be built and demoed before a real merchant account exists.
export const name = 'simulated';

export async function createSession({ providerRef }) {
  // Nothing to call out to — the "hosted page" is our own simulated page.
  const redirectUrl = `${config.publicBaseUrl}/pages/visa-pay.html?ref=${encodeURIComponent(providerRef)}`;
  return { redirectUrl };
}

export function newRef() {
  return 'sim_' + crypto.randomBytes(12).toString('hex');
}
