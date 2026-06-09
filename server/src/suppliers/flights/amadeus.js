import { config } from '../../config.js';

// Real Amadeus (Self-Service / Enterprise) flight integration.
//
// This is a documented stub wired through the same interface as the simulated
// supplier; it needs an Amadeus API key + secret (and a commercial agreement for
// ticketing), so it is not exercised by the dev/test flow. When credentials
// exist, this is the only file that needs real API calls.
//
// Amadeus flow:
//   1. OAuth2       POST /v1/security/oauth2/token            -> bearer token
//   2. Search       GET  /v2/shopping/flight-offers           -> priced offers
//   3. Price        POST /v1/shopping/flight-offers/pricing    -> firm price
//   4. Order/hold   POST /v1/booking/flight-orders            -> PNR + deadline
//   5. Ticketing    (issue via the order / consolidator)      -> ticket numbers
//   6. Cancel       DELETE /v1/booking/flight-orders/{id}
//
// Docs: https://developers.amadeus.com/

const API_KEY = process.env.AMADEUS_API_KEY;
const API_SECRET = process.env.AMADEUS_API_SECRET;
const BASE = process.env.AMADEUS_BASE_URL || 'https://test.api.amadeus.com';

export const name = 'amadeus';

function ensureConfigured() {
  if (!API_KEY || !API_SECRET) {
    throw Object.assign(
      new Error('Amadeus is not configured. Set AMADEUS_API_KEY and AMADEUS_API_SECRET.'),
      { status: 503 },
    );
  }
}

async function accessToken() {
  const res = await fetch(`${BASE}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: API_KEY, client_secret: API_SECRET }),
  });
  if (!res.ok) throw new Error(`Amadeus auth failed (${res.status})`);
  return (await res.json()).access_token;
}

export async function search({ origin, destination, departDate, adults }) {
  ensureConfigured();
  const token = await accessToken();
  const params = new URLSearchParams({
    originLocationCode: origin, destinationLocationCode: destination,
    departureDate: departDate, adults: String(adults || 1), currencyCode: config && 'AED', max: '6',
  });
  const res = await fetch(`${BASE}/v2/shopping/flight-offers?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Amadeus search failed (${res.status})`);
  // Map res.json().data into the shape returned by suppliers/flights/simulated.js.
  throw new Error('Amadeus response mapping not implemented — fill in when credentials are available.');
}

export async function priceOffer(/* offerKey */) {
  ensureConfigured();
  throw new Error('Amadeus pricing not implemented — fill in when credentials are available.');
}

export async function hold(/* offer, passengers */) {
  ensureConfigured();
  throw new Error('Amadeus order/hold not implemented — fill in when credentials are available.');
}

export async function issueTicket(/* pnr */) {
  ensureConfigured();
  throw new Error('Amadeus ticketing not implemented — fill in when credentials are available.');
}

export async function cancel(/* pnr */) {
  ensureConfigured();
  throw new Error('Amadeus cancellation not implemented — fill in when credentials are available.');
}
