import crypto from 'node:crypto';

// Real N-Genius (Network International) hosted-session integration.
//
// This is intentionally a documented stub: turning it on requires a live
// merchant account, an API key and an outlet reference from Network
// International, so it is wired but not exercised by the dev/test flow. The
// surrounding code (src/payments.js) is provider-agnostic, so when these
// credentials exist this file is the only place that needs real API calls.
//
// Reference flow (N-Genius "hosted session"):
//   1. POST {gateway}/identity/auth/access-token  (Basic <api key>) -> bearer
//   2. POST {gateway}/transactions/outlets/{outlet}/orders  with the amount and
//      a `merchantOrderReference`; the response contains `_links.payment.href`.
//   3. Redirect the customer to that href to enter their card.
//   4. N-Genius redirects back to our return URL and the order state can be
//      confirmed by GETting the order (state === 'PURCHASED' / 'CAPTURED').
//
// Docs: https://docs.network.ae/

const API_KEY = process.env.NGENIUS_API_KEY;
const OUTLET = process.env.NGENIUS_OUTLET_REF;
const GATEWAY = process.env.NGENIUS_GATEWAY_URL || 'https://api-gateway.ngenius-payments.com';

export const name = 'ngenius';

function ensureConfigured() {
  if (!API_KEY || !OUTLET) {
    throw Object.assign(
      new Error('N-Genius is not configured. Set NGENIUS_API_KEY and NGENIUS_OUTLET_REF.'),
      { status: 503 },
    );
  }
}

async function accessToken() {
  const res = await fetch(`${GATEWAY}/identity/auth/access-token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${API_KEY}`,
      'Content-Type': 'application/vnd.ni-identity.v1+json',
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`N-Genius auth failed (${res.status})`);
  return (await res.json()).access_token;
}

export async function createSession({ amountCents, currency, providerRef, returnUrl }) {
  ensureConfigured();
  const token = await accessToken();
  const res = await fetch(`${GATEWAY}/transactions/outlets/${OUTLET}/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/vnd.ni-payment.v2+json',
      Accept: 'application/vnd.ni-payment.v2+json',
    },
    body: JSON.stringify({
      action: 'PURCHASE',
      amount: { currencyCode: currency, value: amountCents },
      merchantOrderReference: providerRef,
      merchantAttributes: returnUrl ? { redirectUrl: returnUrl } : undefined,
    }),
  });
  if (!res.ok) throw new Error(`N-Genius order failed (${res.status})`);
  const order = await res.json();
  const redirectUrl = order?._links?.payment?.href;
  if (!redirectUrl) throw new Error('N-Genius did not return a payment link');
  return { redirectUrl };
}

export function newRef() {
  return 'ng_' + crypto.randomBytes(12).toString('hex');
}
