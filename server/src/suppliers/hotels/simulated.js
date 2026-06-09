import crypto from 'node:crypto';
import { config } from '../../config.js';

// A built-in test "bedbank" supplier. It returns deterministic inventory so the
// whole hotel flow (search -> price -> book -> voucher -> cancel) can be built
// and demoed without a real Hotelbeds/TBO contract. Swap PAYMENT/HOTEL_SUPPLIER
// for the real provider once a commercial agreement exists.
export const name = 'simulated';

const CURRENCY = 'AED';

// A small curated catalogue for well-known cities; any other city still gets
// generated inventory (below) so search always returns results.
const CATALOGUE = {
  dubai: [
    { name: 'Dubai Marina Hotel', rating: 4, base: 62000 },
    { name: 'Downtown Burj View Suites', rating: 5, base: 98000 },
    { name: 'Deira City Inn', rating: 3, base: 34000 },
  ],
  istanbul: [
    { name: 'Sultanahmet Boutique Hotel', rating: 4, base: 41000 },
    { name: 'Bosphorus Grand', rating: 5, base: 72000 },
  ],
  london: [
    { name: 'Kensington Court Hotel', rating: 4, base: 88000 },
    { name: 'City of London Inn', rating: 3, base: 56000 },
  ],
  maldives: [
    { name: 'Maldives Resort Villa', rating: 5, base: 185000 },
  ],
};

// Room products offered at every hotel, as a multiplier on the hotel base rate.
const ROOMS = [
  { roomName: 'Standard Room', board: 'Room only', factor: 1.0 },
  { roomName: 'Deluxe Room', board: 'Breakfast included', factor: 1.35 },
  { roomName: 'Suite', board: 'Half board', factor: 1.9 },
];

function normCity(c) { return String(c || '').trim().toLowerCase(); }

// Stable pseudo-random base price for cities not in the curated catalogue, so a
// given city always returns the same inventory.
function generatedHotels(city) {
  const seed = parseInt(crypto.createHash('sha256').update(city).digest('hex').slice(0, 8), 16);
  const base = 30000 + (seed % 60000); // 300–900 AED
  const title = city.replace(/\b\w/g, (m) => m.toUpperCase());
  return [
    { name: `${title} City Hotel`, rating: 4, base },
    { name: `${title} Central Inn`, rating: 3, base: Math.round(base * 0.8) },
  ];
}

function nightsBetween(checkIn, checkOut) {
  const a = new Date(checkIn + 'T00:00:00Z');
  const b = new Date(checkOut + 'T00:00:00Z');
  const n = Math.round((b - a) / (24 * 60 * 60 * 1000));
  return n;
}

// --- signed, stateless rate keys -------------------------------------------
// We sign each rate so a client can hand it back at booking time and the server
// can trust the price without storing every search result.
function signRate(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', config.rateKeySecret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function decodeRate(rateKey) {
  const [body, sig] = String(rateKey || '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', config.rateKeySecret).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); }
  catch { return null; }
}

export async function search({ city, checkIn, checkOut, guests }) {
  const nights = nightsBetween(checkIn, checkOut);
  if (!city || !(nights > 0)) {
    throw Object.assign(new Error('Provide a city and a valid check-in/check-out date range'), { status: 400 });
  }
  const key = normCity(city);
  const hotels = CATALOGUE[key] || generatedHotels(key);
  const cityLabel = city.trim();

  return {
    city: cityLabel,
    checkIn, checkOut, nights, guests: guests || 2,
    hotels: hotels.map((h, hi) => ({
      id: `${key}-${hi}`,
      name: h.name,
      city: cityLabel,
      rating: h.rating,
      rooms: ROOMS.map((r) => {
        const nightly = Math.round(h.base * r.factor);
        const total = nightly * nights;
        const rate = {
          h: h.name, c: cityLabel, r: r.roomName, b: r.board,
          ci: checkIn, co: checkOut, ni: nights, n: nightly, cur: CURRENCY,
        };
        return {
          rateKey: signRate(rate),
          roomName: r.roomName,
          board: r.board,
          nightlyPrice: nightly / 100,
          totalPrice: total / 100,
          totalCents: total,
          currency: CURRENCY,
          nights,
        };
      }),
    })),
  };
}

// Re-price a rate at booking time (here it is simply the signed amount; a real
// supplier would re-check live availability and may return a small change).
export async function priceRate(rateKey) {
  const rate = decodeRate(rateKey);
  if (!rate) return null;
  return {
    hotelName: rate.h, city: rate.c, roomName: rate.r, board: rate.b,
    checkIn: rate.ci, checkOut: rate.co, nights: rate.ni,
    amountCents: rate.n * rate.ni, currency: rate.cur,
  };
}

export async function book() {
  return {
    supplierRef: 'SIMHB-' + crypto.randomBytes(5).toString('hex').toUpperCase(),
    voucherCode: 'VCH-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
  };
}

export async function cancel() {
  return { ok: true };
}
