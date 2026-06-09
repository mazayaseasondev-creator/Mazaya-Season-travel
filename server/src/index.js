import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { config } from './config.js';
import { migrate } from './db.js';
import { authRouter } from './auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

export function createApp() {
  const app = express();

  // CSP is disabled here because the current front-end uses inline event
  // handlers (onclick). Tighten this before launch.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json());
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Limit auth traffic to slow down code-guessing / abuse.
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
  app.use('/api/auth', authLimiter, authRouter);

  // Serve the existing static front-end (defaults to the repo root) so the site
  // and the API share one origin.
  const staticDir = process.env.STATIC_DIR ? resolve(process.env.STATIC_DIR) : repoRoot;
  app.use(express.static(staticDir));

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
