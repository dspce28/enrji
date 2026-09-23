import { openDb, seed } from './db.js';
import { createApp } from './app.js';
import { stripeClient } from './payments.js';
import { expireStaleOrders } from './orders.js';

const env = process.env;
const port = Number(env.PORT) || 3000;
const production = env.NODE_ENV === 'production';
const baseUrl = (env.BASE_URL || `http://localhost:${port}`).replace(/\/$/, '');
const adminEmail = env.ADMIN_EMAIL || 'admin@enrji.local';
const adminPassword = env.ADMIN_PASSWORD || (production ? null : 'admin1234');

if (!adminPassword) {
  console.error('ADMIN_PASSWORD must be set in production.');
  process.exit(1);
}

const db = openDb(env.DATABASE_PATH || 'data/enrji.db');
const seeded = seed(db, { adminEmail, adminPassword });

const stripe = env.STRIPE_SECRET_KEY ? stripeClient(env.STRIPE_SECRET_KEY) : null;
// Demo payments stay on in development; in production they need an explicit opt-in.
const demoPayments = env.DEMO_PAYMENTS ? env.DEMO_PAYMENTS === 'true' : !production;

if (!stripe && !demoPayments) {
  console.error('No payment provider: set STRIPE_SECRET_KEY or DEMO_PAYMENTS=true.');
  process.exit(1);
}

const app = createApp({
  db, stripe, demoPayments, baseUrl,
  uploadDir: env.UPLOAD_DIR || 'data/uploads',
  stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
  secureCookies: baseUrl.startsWith('https://'),
});

setInterval(() => expireStaleOrders(db), 60_000).unref();

app.listen(port, () => {
  console.log(`ENRJI store running at ${baseUrl}`);
  console.log(`Payments: ${[stripe && 'Stripe', demoPayments && 'Demo'].filter(Boolean).join(' + ')}`);
  if (seeded.seededAdmin) console.log(`Admin account created: ${adminEmail}${production ? '' : ` / ${adminPassword}`}`);
});
