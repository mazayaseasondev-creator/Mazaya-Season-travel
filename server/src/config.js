import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

// Identifiers (emails / mobiles) that should be granted the admin role on login.
// Comma-separated, e.g. ADMIN_IDENTIFIERS="ops@mazaya.com,+971500000000".
const adminIdentifiers = (process.env.ADMIN_IDENTIFIERS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// Payment provider. 'simulated' is a built-in test gateway that needs no
// credentials; 'ngenius' is the real Network International integration (Phase 4).
const paymentProvider = process.env.PAYMENT_PROVIDER || (isProd ? 'ngenius' : 'simulated');

// Hotel supplier (bedbank). 'simulated' is a built-in test supplier; 'hotelbeds'
// is the real Hotelbeds/APItude integration (needs a commercial contract).
const hotelSupplier = process.env.HOTEL_SUPPLIER || (isProd ? 'hotelbeds' : 'simulated');

// Flight supplier (GDS/consolidator). 'simulated' is a built-in test supplier;
// 'amadeus' is the real Amadeus integration (needs a commercial contract).
const flightSupplier = process.env.FLIGHT_SUPPLIER || (isProd ? 'amadeus' : 'simulated');

// Tours/activities supplier. 'simulated' is a built-in test supplier; 'viator'
// is the real Viator integration (needs a commercial contract).
const tourSupplier = process.env.TOUR_SUPPLIER || (isProd ? 'viator' : 'simulated');

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  isProd,
  jwtSecret: process.env.JWT_SECRET || 'dev-insecure-jwt-secret',
  otpSecret: process.env.OTP_SECRET || 'dev-insecure-otp-secret',
  otpTtlMinutes: parseInt(process.env.OTP_TTL_MINUTES || '5', 10),
  otpMaxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10),
  sessionTtlDays: parseInt(process.env.SESSION_TTL_DAYS || '30', 10),
  // In development we return the OTP in the response so the flow can be tested
  // without a real SMS/email provider. Never expose it in production.
  exposeOtp: !isProd && process.env.EXPOSE_OTP !== 'false',

  // --- Phase 2: visas, document uploads and payments ---
  adminIdentifiers,
  paymentProvider,
  // The simulated gateway lets us complete a payment from the browser without a
  // real card; it must never be enabled in production.
  paymentsSimulated: paymentProvider === 'simulated',
  // Where uploaded visa documents are stored on disk (swap for S3 before launch).
  uploadDir: process.env.UPLOAD_DIR ? resolve(process.env.UPLOAD_DIR) : join(__dirname, '..', 'uploads'),
  maxUploadBytes: parseInt(process.env.MAX_UPLOAD_BYTES || String(5 * 1024 * 1024), 10),
  maxDocumentsPerRequest: parseInt(process.env.MAX_DOCUMENTS_PER_REQUEST || '8', 10),
  // Public origin used to build payment return URLs. Defaults to localhost in dev.
  publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${parseInt(process.env.PORT || '4000', 10)}`,

  // --- Phase 3: hotels + flights + tours ---
  hotelSupplier,
  flightSupplier,
  tourSupplier,
  // Secret used to sign supplier rate/offer keys so quoted prices can be trusted
  // when a customer hands one back at booking time. Falls back to JWT_SECRET.
  rateKeySecret: process.env.RATE_KEY_SECRET || process.env.JWT_SECRET || 'dev-insecure-jwt-secret',
};

if (isProd && (config.jwtSecret.startsWith('dev-') || config.otpSecret.startsWith('dev-'))) {
  throw new Error('Refusing to start in production with default secrets. Set JWT_SECRET and OTP_SECRET.');
}

if (isProd && config.paymentsSimulated) {
  throw new Error('Refusing to start in production with the simulated payment gateway. Set PAYMENT_PROVIDER=ngenius.');
}
