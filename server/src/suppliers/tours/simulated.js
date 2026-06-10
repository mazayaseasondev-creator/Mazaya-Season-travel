import crypto from 'node:crypto';
import { config } from '../../config.js';

// A built-in test tours/activities supplier. It returns deterministic inventory
// with transfer and guide options so the whole tour flow (search -> choose
// options -> book -> voucher -> cancel) can be built and demoed without a real
// activities contract (e.g. Viator / GetYourGuide / Hotelbeds Activities).
export const name = 'simulated';

const CURRENCY = 'AED';

// Add-on options offered on every tour, as a price delta per traveller (cents).
const TRANSFERS = [
  { code: 'none', name: 'No transfer', delta: 0 },
  { code: 'shared', name: 'Shared transfer', delta: 4000 },
  { code: 'private', name: 'Private transfer', delta: 12000 },
];
const GUIDES = [
  { code: 'audio', name: 'Audio guide', delta: 0 },
  { code: 'group', name: 'Live group guide', delta: 6000 },
  { code: 'private', name: 'Private guide', delta: 18000 },
];

const CATALOGUE = {
  dubai: [
    { name: 'Desert Safari with BBQ Dinner', durationHours: 6, base: 22000 },
    { name: 'Burj Khalifa: At the Top', durationHours: 2, base: 17000 },
    { name: 'Dubai Marina Dhow Cruise', durationHours: 3, base: 13000 },
  ],
  istanbul: [
    { name: 'Bosphorus Sunset Cruise', durationHours: 3, base: 11000 },
    { name: 'Old City Highlights Walking Tour', durationHours: 5, base: 9000 },
  ],
  london: [
    { name: 'Tower of London & Crown Jewels', durationHours: 3, base: 15000 },
    { name: 'Thames River Sightseeing Cruise', durationHours: 2, base: 8000 },
  ],
};

function normCity(c) { return String(c || '').trim().toLowerCase(); }
function seedOf(s) { return parseInt(crypto.createHash('sha256').update(s).digest('hex').slice(0, 8), 16); }

function generatedTours(city) {
  const seed = seedOf(city);
  const base = 8000 + (seed % 20000);
  const title = city.replace(/\b\w/g, (m) => m.toUpperCase());
  return [
    { name: `${title} City Highlights Tour`, durationHours: 4, base },
    { name: `${title} Food & Culture Walk`, durationHours: 3, base: Math.round(base * 0.7) },
  ];
}

// --- signed, stateless tour keys (same approach as hotel/flight keys) -------
function signKey(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', config.rateKeySecret).update(body).digest('base64url');
  return `${body}.${sig}`;
}
export function decodeKey(tourKey) {
  const [body, sig] = String(tourKey || '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', config.rateKeySecret).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); }
  catch { return null; }
}

export async function search({ city, date, travellers, markupPercent = 0 }) {
  if (!city || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) {
    throw Object.assign(new Error('Provide a city and a valid date (YYYY-MM-DD)'), { status: 400 });
  }
  const markup = 1 + (Number(markupPercent) || 0) / 100;
  const pax = Math.max(1, parseInt(travellers || '1', 10));
  const key = normCity(city);
  const tours = CATALOGUE[key] || generatedTours(key);
  const cityLabel = city.trim();

  return {
    city: cityLabel, date, travellers: pax,
    tours: tours.map((t, ti) => {
      // The price deltas are signed into the key so they can be trusted later.
      const base = Math.round(t.base * markup);
      const signed = {
        id: `${key}-${ti}`, n: t.name, c: cityLabel, dt: date,
        b: base, cur: CURRENCY, du: t.durationHours,
        tr: TRANSFERS.map((x) => ({ code: x.code, d: x.delta })),
        gu: GUIDES.map((x) => ({ code: x.code, d: x.delta })),
      };
      return {
        tourId: signed.id,
        tourKey: signKey(signed),
        name: t.name,
        city: cityLabel,
        date,
        durationHours: t.durationHours,
        basePrice: base / 100,
        currency: CURRENCY,
        transferOptions: TRANSFERS.map((x) => ({ code: x.code, name: x.name, priceDelta: x.delta / 100 })),
        guideOptions: GUIDES.map((x) => ({ code: x.code, name: x.name, priceDelta: x.delta / 100 })),
      };
    }),
  };
}

// Price a chosen tour + options at booking time. Validates the option codes
// against the signed key so a client cannot invent a cheaper add-on.
export async function priceTour(tourKey, { transferCode, guideCode, travellers }) {
  const t = decodeKey(tourKey);
  if (!t) return null;
  const pax = Math.max(1, parseInt(travellers || '1', 10));
  const transfer = t.tr.find((x) => x.code === (transferCode || 'none'));
  const guide = t.gu.find((x) => x.code === (guideCode || 'audio'));
  if (!transfer || !guide) return { invalidOption: true };
  const perPax = t.b + transfer.d + guide.d;
  return {
    tourName: t.n, city: t.c, date: t.dt,
    transferCode: transfer.code, guideCode: guide.code,
    travellers: pax, amountCents: perPax * pax, currency: t.cur,
  };
}

export async function book() {
  return {
    supplierRef: 'SIMTR-' + crypto.randomBytes(5).toString('hex').toUpperCase(),
    voucherCode: 'TVR-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
  };
}

export async function cancel() {
  return { ok: true };
}
