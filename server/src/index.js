import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import multer from 'multer';
import { config } from './config.js';
import { migrate } from './db.js';
import { authRouter } from './auth.js';
import { visaTypesRouter, visasRouter } from './visas.js';
import { hotelsRouter } from './hotels.js';
import { flightsRouter } from './flights.js';
import { toursRouter } from './tours.js';
import { paymentsRouter } from './payments.js';
import { adminRouter } from './admin.js';
import { leadsRouter } from './leads.js';
import { vouchersRouter } from './pricing.js';
import { query } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

export function createApp() {
  const app = express();

  // CSP is disabled here because the current front-end uses inline event
  // handlers (onclick). Tighten this before launch.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json());
  app.use(cookieParser());

  // Liveness: the process is up.
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Readiness: the process can reach the database (use for load-balancer checks).
  app.get('/api/ready', async (_req, res) => {
    try {
      await query('select 1');
      res.json({ ok: true, db: 'up' });
    } catch (e) {
      res.status(503).json({ ok: false, db: 'down' });
    }
  });

  // Limit auth traffic to slow down code-guessing / abuse.
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
  app.use('/api/auth', authLimiter, authRouter);

  // Phase 2: visa products, requests + documents, payments, and the admin queue.
  app.use('/api/visa-types', visaTypesRouter);
  app.use('/api/visas', visasRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/admin', adminRouter);

  // Phase 3: hotel + flight + tour search and bookings (supplier-agnostic).
  app.use('/api/hotels', hotelsRouter);
  app.use('/api/flights', flightsRouter);
  app.use('/api/tours', toursRouter);

  // Phase 4: public contact-form leads.
  app.use('/api/leads', leadsRouter);

  // Pricing: voucher validation for signed-in customers.
  app.use('/api/vouchers', vouchersRouter);

  // Serve the existing static front-end (defaults to the repo root) so the site
  // and the API share one origin.
  const staticDir = process.env.STATIC_DIR ? resolve(process.env.STATIC_DIR) : repoRoot;
  app.use(express.static(staticDir));

  // Turn known errors (upload limits, bad file types) into clean JSON for the
  // API; fall back to a generic 500 for anything unexpected.
  app.use((err, req, res, _next) => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : 'Upload rejected';
      return res.status(400).json({ error: msg });
    }
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Server error' : err.message });
  });

  return app;
}

async function main() {
  await migrate();
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`Mazaya server running on http://localhost:${config.port}`);
    if (config.exposeOtp) console.log('DEV mode: OTP codes are returned in API responses and logged here.');
  });
}

// Only auto-start when this file is run directly (not when imported by tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
