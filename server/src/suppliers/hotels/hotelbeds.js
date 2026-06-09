import crypto from 'node:crypto';

// Real Hotelbeds (APItude) "bedbank" integration.
//
// This is a documented stub: it is wired through the same interface as the
// simulated supplier but requires a commercial Hotelbeds account (API key +
// shared secret), so it is not exercised by the dev/test flow. When credentials
// exist, this is the only file that needs real API calls.
//
// Hotelbeds flow:
//   1. Availability  POST /hotel-api/1.0/hotels    -> rates with `rateKey`s
//   2. CheckRate     POST /hotel-api/1.0/checkrates -> firm price for a rateKey
//   3. Booking       POST /hotel-api/1.0/bookings   -> confirmation + voucher
//   4. Cancellation  DELETE /hotel-api/1.0/bookings/{reference}
//
// Auth: header `X-Signature` = sha256(apiKey + secret + unixSeconds).
// Docs: https://developer.hotelbeds.com/

const API_KEY = process.env.HOTELBEDS_API_KEY;
const SECRET = process.env.HOTELBEDS_SECRET;
const BASE = process.env.HOTELBEDS_BASE_URL || 'https://api.test.hotelbeds.com';

export const name = 'hotelbeds';

function ensureConfigured() {
  if (!API_KEY || !SECRET) {
    throw Object.assign(
      new Error('Hotelbeds is not configured. Set HOTELBEDS_API_KEY and HOTELBEDS_SECRET.'),
      { status: 503 },
    );
  }
}

function authHeaders() {
  const signature = crypto
    .createHash('sha256')
    .update(API_KEY + SECRET + Math.floor(Date.now() / 1000))
    .digest('hex');
  return { 'Api-key': API_KEY, 'X-Signature': signature, Accept: 'application/json', 'Content-Type': 'application/json' };
}

export async function search({ city, checkIn, checkOut, guests }) {
  ensureConfigured();
  const res = await fetch(`${BASE}/hotel-api/1.0/hotels`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      stay: { checkIn, checkOut },
      occupancies: [{ rooms: 1, adults: guests || 2, children: 0 }],
      destination: { code: city },
    }),
  });
  if (!res.ok) throw new Error(`Hotelbeds availability failed (${res.status})`);
  // Map res.json().hotels into the shape used by src/suppliers/hotels/simulated.js.
  throw new Error('Hotelbeds response mapping not implemented — fill in when credentials are available.');
}

export async function priceRate(/* rateKey */) {
  ensureConfigured();
  throw new Error('Hotelbeds checkrates not implemented — fill in when credentials are available.');
}

export async function book(/* rate, details */) {
  ensureConfigured();
  throw new Error('Hotelbeds booking not implemented — fill in when credentials are available.');
}

export async function cancel(/* supplierRef */) {
  ensureConfigured();
  throw new Error('Hotelbeds cancellation not implemented — fill in when credentials are available.');
}
