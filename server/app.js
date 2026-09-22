import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadUser } from './auth.js';
import { HttpError, expireStaleOrders } from './orders.js';
import { storeRoutes } from './routes/store.js';
import { adminRoutes } from './routes/admin.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/**
 * @param {object} cfg
 * @param {import('node:sqlite').DatabaseSync} cfg.db
 * @param {ReturnType<import('./payments.js').stripeClient>|null} cfg.stripe
 * @param {string} [cfg.stripeWebhookSecret]
 * @param {boolean} cfg.demoPayments
 * @param {string} cfg.baseUrl
 * @param {boolean} [cfg.secureCookies]
 */
export function createApp(cfg) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
    });
    next();
  });

  // Stripe needs the exact raw bytes to verify its signature, so this route is mounted before express.json().
  app.use('/api/payments/stripe/webhook', express.raw({ type: '*/*', limit: '1mb' }));

  // Only JSON bodies are accepted on mutating API calls. Browsers cannot send
  // cross-site JSON without a CORS preflight, which acts as CSRF protection
  // alongside SameSite=Lax cookies.
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path === '/payments/stripe/webhook') return next();
    if (!req.is('application/json')) return res.status(415).json({ error: 'Content-Type must be application/json' });
    next();
  });
  app.use(express.json({ limit: '200kb' }));
  app.use(loadUser(cfg.db));

  // Release abandoned reservations lazily and on a timer.
  let lastSweep = 0;
  app.use('/api', (_req, _res, next) => {
    if (Date.now() - lastSweep > 60_000) { lastSweep = Date.now(); expireStaleOrders(cfg.db); }
    next();
  });

  app.use('/api', storeRoutes(cfg));
  app.use('/api/admin', adminRoutes(cfg));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  app.get('/vendor/three.module.js', (_req, res) => res.sendFile(join(root, 'node_modules/three/build/three.module.js')));
  app.get('/vendor/three.core.js', (_req, res) => res.sendFile(join(root, 'node_modules/three/build/three.core.js')));
  app.use(express.static(join(root, 'public'), { maxAge: '1h', index: 'index.html' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...(err.problems && { problems: err.problems }) });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });

  return app;
}
