# ENRJI® storefront (Next.js)

The redesigned ENRJI website. It is a **Next.js front end over the live Shopify store**:

- **Next.js** renders every page and owns the look: home, shop, collections, product pages, cart, Trial Room, Virtual Store, Our Story, size guide, FAQ, contact.
- **Shopify** stays the engine: products, prices, stock, checkout (UPI/cards), orders, customer accounts and admin. Nothing is migrated.
- Products are read from the store's public feed (`/products.json`) and refreshed every 5 minutes. A snapshot in `data/catalogue-snapshot.json` keeps the site up if the store can't be reached.
- **Add to bag** keeps a cart in the browser; **Checkout** and **Buy now** hand off to Shopify's own checkout through a [cart permalink](https://help.shopify.com/en/manual/products/details/cart-permalink). **Orders placed on staging are real orders** in the live Shopify admin.

## Features

| | |
|---|---|
| Shop | Filters by garment, by ENRJI pillar (mental, emotional, physical, spiritual) and stock; sort by price or newest |
| Product page | Photo gallery with zoom, colour and size selection with live stock, Add to bag, Buy now, tee ↔ sweatshirt switch, size chart, "notify me on WhatsApp" for sold-out sizes, sticky mobile buy bar, Product structured data |
| Cart | Slide-out bag, stock re-check before checkout, multi-buy offer note |
| Trial Room | Upload a photo, live camera or mannequin. On-device body tracking (MediaPipe pose + clothes/skin segmentation) warps the garment onto shoulders, torso and arms, keeps face, hair and hands in front, recolours the shopper's own top where it shows, and carries over the photo's shading. "Print on my clothes" mode; 360° view; save image; add to bag. Photos never leave the browser |
| Virtual Store | Walkable 3D gallery (Three.js) with the product photography on the walls, rotating 3D garments on plinths, the Live Like Krishna edition centre stage; guided tour; tap to add to bag |
| 360° view | Product pages and the Trial Room show each tee/sweatshirt as a 3D garment in its real colour and print; drag to spin |

### Trial Room print artwork
The Trial Room draws each tee or sweatshirt in its real colour with its real print. The prints in `public/prints/` were cut out of the flat-lay product photos on enrji.in, and garment colours were sampled from the same photos (`data/garments.json`). `npm run build` regenerates `data/prints.json`, the list the Trial Room reads.

- Products without a usable flat-lay (Energy Fade, which is tone-on-tone black, and Healthy Is New Rich) show the slogan typeset in the brand face instead.
- For sharper results, replace any file with the print artwork from your designer: a transparent PNG trimmed to the print, named `<product-handle>.png` (per colour: `<handle>--<colour>.png`, e.g. `believe--black.png`).

## Run locally

Node 20.9 or newer.

```bash
npm install
npm run dev          # http://localhost:3000
npm run build && npm start
npm run lint         # TypeScript check
npm run snapshot     # refresh data/catalogue-snapshot.json from the live store
```

Copy `.env.example` to `.env.local` to change the store or site URL.

## Deploy to enrji.logicubeit.com

**Option A: Vercel (simplest)**
1. Import this repository in Vercel. The framework is detected automatically.
2. Set the environment variables from `.env.example`.
3. Project → Settings → Domains → add `enrji.logicubeit.com`, then add the DNS record Vercel shows (a CNAME for `enrji`) at the DNS provider for logicubeit.com.

**Option B: your own server**
```bash
npm ci && npm run build
PORT=3000 npm start    # run under pm2/systemd, behind nginx with HTTPS
```

## Moving to enrji.in after approval
1. In Shopify, add a subdomain such as `shop.enrji.in` for the store (checkout and customer accounts live there).
2. Set `NEXT_PUBLIC_SHOPIFY_STORE_URL=https://shop.enrji.in`, `NEXT_PUBLIC_SITE_URL=https://enrji.in`, `ALLOW_INDEXING=true`.
3. Point `enrji.in` at this site. Product URLs (`/products/<handle>`) and collection URLs match Shopify's, so existing links and search rankings carry over.

## Layout
```
app/                 pages (App Router) + api/stock
components/          header, cart, product card/buy box, gallery, TrialRoom, VirtualStore
lib/catalogue.ts     Shopify feed → typed products (hides internal test products)
lib/checkout.ts      Shopify cart permalink
lib/config.ts        store URL, contact details, shipping/returns wording, offers
lib/garment.ts       garment + print renderer (flat)
lib/garment3d.ts     3D garment for the 360° view and Virtual Store
lib/bodyTracking.ts  on-device pose + segmentation (models self-hosted by scripts/vision-assets.mjs)
lib/wornRenderer.ts  WebGL compositor that makes the garment look worn
data/                catalogue snapshot, Trial Room settings
prototype/           earlier Express prototype (reference only, not deployed)
```
