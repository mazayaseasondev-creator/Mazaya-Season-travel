// Real Viator (Tours & Activities) integration.
//
// This is a documented stub wired through the same interface as the simulated
// supplier; it requires a Viator Partner API key, so it is not exercised by the
// dev/test flow. When credentials exist, this is the only file that needs real
// API calls. The same shape also fits GetYourGuide or Hotelbeds Activities.
//
// Viator flow:
//   1. Search       POST /products/search          -> products for a destination
//   2. Availability POST /availability/check        -> bookable options + price
//   3. Booking      POST /bookings/book             -> confirmation + voucher
//   4. Cancellation POST /bookings/{ref}/cancel      -> cancellation result
//
// Auth: header `exp-api-key: <key>`. Docs: https://docs.viator.com/

const API_KEY = process.env.VIATOR_API_KEY;
const BASE = process.env.VIATOR_BASE_URL || 'https://api.viator.com/partner';

export const name = 'viator';

function ensureConfigured() {
  if (!API_KEY) {
    throw Object.assign(new Error('Viator is not configured. Set VIATOR_API_KEY.'), { status: 503 });
  }
}

function authHeaders() {
  return { 'exp-api-key': API_KEY, Accept: 'application/json;version=2.0', 'Content-Type': 'application/json' };
}

export async function search({ city, date, travellers }) {
  ensureConfigured();
  const res = await fetch(`${BASE}/products/search`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ filtering: { destination: city }, startDate: date, currency: 'AED', count: 6 }),
  });
  if (!res.ok) throw new Error(`Viator search failed (${res.status})`);
  // Map res.json().products into the shape from src/suppliers/tours/simulated.js.
  throw new Error('Viator response mapping not implemented — fill in when credentials are available.');
}

export async function priceTour(/* tourKey, options */) {
  ensureConfigured();
  throw new Error('Viator availability/pricing not implemented — fill in when credentials are available.');
}

export async function book(/* details */) {
  ensureConfigured();
  throw new Error('Viator booking not implemented — fill in when credentials are available.');
}

export async function cancel(/* supplierRef */) {
  ensureConfigured();
  throw new Error('Viator cancellation not implemented — fill in when credentials are available.');
}
