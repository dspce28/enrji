# ENRJI — futuristic t-shirt store

A complete e-commerce site for graphic tees, with a neon/cyber look:

- **Storefront**: catalog with search, categories and sorting; product pages with color and size variants and live stock; a cart drawer; guest or account checkout.
- **Virtual tour** (`#/tour`): a walkable 3D showroom built with Three.js. Drag to look, use WASD/arrow keys (or the on-screen d-pad on touch) to walk, and click any tee to inspect it and add it to the cart. There's also an auto-piloted guided tour.
- **Try it on** (`#/try-on`): upload a photo, use your camera, or pick the mannequin. You can drag, pinch, scroll or use the sliders to place the tee, or tap two shoulder points and it fits automatically. The "Print on my shirt" mode places only the graphic, and fabric blending keeps the photo's folds and shading. You can download the result as a PNG. **Photos never leave the browser.**
- **Orders**: stock is reserved at checkout, unpaid orders auto-expire (30 min demo / 60 min Stripe) and release their stock, and every status change goes on a timeline. Status follows a state machine: `pending_payment → paid → processing → shipped → delivered`, plus `cancelled` / `refunded`. Customers can cancel and get a refund before production starts.
- **Inventory**: per-SKU stock (product × color × size), low-stock thresholds and alerts, restock/adjust/damaged/set-count actions, and a full movement ledger (sales, releases and refunds included).
- **Payments**: **Stripe Checkout** (a real hosted payment page with a signed webhook and a return-time verification fallback, plus refunds through the Stripe API) and a **demo card processor** for development. Payments are idempotent, and a late payment on an expired order is flagged for manual refund.
- **Admin console** (`#/admin`): KPIs, 14-day revenue, low stock, top sellers; order management with fulfilment/tracking/refunds; inventory; a product editor with live design preview; a payment ledger.

Every shirt image is rendered from code (`public/js/shirt.js`): 12 generative designs × 7 fabric colors, with no image assets. The same renderer feeds the catalog, the 3D textures and the try-on overlay.

## Run it

Requires **Node 22.13+** (it uses the built-in `node:sqlite`, so there's no native build step).

```bash
npm install
npm start            # http://localhost:3000
npm test             # API tests: checkout, payments, webhooks, inventory, auth
```

On first start the database is created and seeded with 12 products and an admin account:
`admin@enrji.local` / `admin1234` (override with `ADMIN_EMAIL` / `ADMIN_PASSWORD`).

Demo card: `4242 4242 4242 4242`, any future expiry, any CVC. `4000 0000 0000 0002` is always declined.

## Turning on real payments (Stripe)

1. Create a Stripe account and copy the secret key: `STRIPE_SECRET_KEY=sk_test_...`
2. Set `BASE_URL` to the site's public URL.
3. Add a webhook endpoint at `https://<your-domain>/api/payments/stripe/webhook` for
   `checkout.session.completed` and `checkout.session.expired`, and set `STRIPE_WEBHOOK_SECRET`.
   Locally: `stripe listen --forward-to localhost:3000/api/payments/stripe/webhook`.
4. In production (`NODE_ENV=production`), demo payments are off unless `DEMO_PAYMENTS=true`.

Card data never touches this server: Stripe hosts the payment page.

## Layout

```
server/
  index.js          boot, env config
  app.js            express app, security headers, CSRF guard, error handling
  db.js             schema + seed data
  auth.js           scrypt passwords, cookie sessions, rate limit
  orders.js         pricing, stock reservation, order state machine, expiry
  payments.js       demo processor, Stripe REST client, webhook signature check
  routes/store.js   catalog, cart quote, auth, checkout, customer orders, webhooks
  routes/admin.js   stats, products, inventory, orders, payments
public/
  index.html, css/style.css
  js/shirt.js       procedural t-shirt SVG renderer (shared with server)
  js/app.js         hash router, header, cart drawer
  js/views/*.js     home, shop, product, checkout, order, account, tour, tryon, admin
test/api.test.js
```

## Before going live, you still need

- **Hosting with a persistent disk.** SQLite lives in a file. Serverless platforms (e.g. Vercel functions) wipe it, so use a VM/container host (Fly.io, Railway, Render, a VPS) with a volume, or move to Postgres.
- **Transactional email** (order confirmation and shipping notifications). Nothing is sent right now: customers see status on the order page.
- **Real tax and shipping rates.** They're currently a flat 8% tax and a $6 flat rate (free over $75) in `server/orders.js`. Real tax depends on jurisdiction (Stripe Tax can handle it).
- **Print/fulfilment integration** (e.g. Printful or Printify) if you don't print in-house.
- **Legal pages**: privacy policy, terms, returns.
