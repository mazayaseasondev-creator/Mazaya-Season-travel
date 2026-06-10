import crypto from 'node:crypto';
import { config } from '../../config.js';

// A built-in test GDS/consolidator. It returns deterministic flight offers so
// the whole flight lifecycle (search -> price -> hold/PNR -> ticket -> cancel)
// can be built and demoed without a real Amadeus/Travelport contract.
export const name = 'simulated';

const CURRENCY = 'AED';

const AIRLINES = [
  { code: 'EY', name: 'Etihad Airways', mult: 1.0 },
  { code: 'EK', name: 'Emirates', mult: 1.08 },
  { code: 'QR', name: 'Qatar Airways', mult: 1.05 },
  { code: 'TK', name: 'Turkish Airlines', mult: 0.92 },
];

function normCode(c) { return String(c || '').trim().toUpperCase(); }
function seedOf(s) { return parseInt(crypto.createHash('sha256').update(s).digest('hex').slice(0, 8), 16); }

// --- signed, stateless offer keys (same approach as the hotel rate keys) ----
function signOffer(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', config.rateKeySecret).update(body).digest('base64url');
  return `${body}.${sig}`;
}
export function decodeOffer(offerKey) {
  const [body, sig] = String(offerKey || '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', config.rateKeySecret).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); }
  catch { return null; }
}

function addHours(date, h) { return new Date(date.getTime() + h * 3600 * 1000); }
function pad(n) { return String(n).padStart(2, '0'); }

export async function search({ origin, destination, departDate, adults, markupPercent = 0 }) {
  const o = normCode(origin), d = normCode(destination);
  const markup = 1 + (Number(markupPercent) || 0) / 100;
  if (!o || !d || !/^\d{4}-\d{2}-\d{2}$/.test(String(departDate || ''))) {
    throw Object.assign(new Error('Provide origin, destination and a valid departDate (YYYY-MM-DD)'), { status: 400 });
  }
  if (o === d) throw Object.assign(new Error('Origin and destination must differ'), { status: 400 });
  const pax = Math.max(1, parseInt(adults || '1', 10));

  // Deterministic route economics: distance-ish base fare and flight duration.
  const routeSeed = seedOf(o + d);
  const baseFare = 90000 + (routeSeed % 220000);     // 900–3100 AED per pax
  const durationH = 2 + (routeSeed % 11);            // 2–12 hours

  const offers = AIRLINES.map((al, i) => {
    const departHour = 6 + (seedOf(o + d + al.code) % 14); // 06:00–19:00
    const departAt = new Date(`${departDate}T${pad(departHour)}:00:00Z`);
    const arriveAt = addHours(departAt, durationH);
    const perPax = Math.round(baseFare * al.mult * markup);
    const offer = {
      o, d, ai: al.code, an: al.name,
      fn: `${al.code}${100 + (routeSeed % 800) + i}`,
      da: departAt.toISOString(), aa: arriveAt.toISOString(),
      cb: 'Economy', p: perPax, cur: CURRENCY, ad: pax,
    };
    return {
      offerKey: signOffer(offer),
      airline: al.name,
      airlineCode: al.code,
      flightNumber: offer.fn,
      origin: o, destination: d,
      departAt: offer.da, arriveAt: offer.aa,
      durationHours: durationH,
      cabin: 'Economy',
      stops: 0,
      pricePerPax: perPax / 100,
      totalPrice: (perPax * pax) / 100,
      totalCents: perPax * pax,
      currency: CURRENCY,
      passengers: pax,
    };
  }).sort((a, b) => a.totalCents - b.totalCents);

  return { origin: o, destination: d, departDate, adults: pax, offers };
}

// Re-price an offer at booking time (here, the signed amount).
export async function priceOffer(offerKey) {
  const off = decodeOffer(offerKey);
  if (!off) return null;
  return {
    airline: off.an, airlineCode: off.ai, flightNumber: off.fn,
    origin: off.o, destination: off.d, departAt: off.da, arriveAt: off.aa,
    cabin: off.cb, passengers: off.ad,
    amountCents: off.p * off.ad, currency: off.cur,
  };
}

// Place a hold: a real GDS returns a PNR and a ticketing deadline by which the
// fare must be paid/ticketed or the hold is released.
export async function hold() {
  const pnr = Array.from({ length: 6 }, () =>
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[crypto.randomInt(0, 32)]).join('');
  const ticketingDeadline = addHours(new Date(), 48).toISOString();
  return { pnr, ticketingDeadline };
}

// Issue the ticket(s) once payment is captured.
export async function issueTicket({ passengers = 1 } = {}) {
  const ticketNumbers = Array.from({ length: passengers }, () =>
    '607-' + String(crypto.randomInt(0, 1e10)).padStart(10, '0'));
  return { ticketNumbers };
}

export async function cancel() {
  return { ok: true };
}
