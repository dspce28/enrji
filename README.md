# ENRJI® storefront (Next.js)

The redesigned ENRJI website. It is a **Next.js front end over the live Shopify store**:

- **Next.js** renders every page and owns the look: home, shop, collections, product pages, cart, Trial Room, Virtual Store, Our Story, size guide, FAQ, contact.
- **Shopify** stays the engine: products, prices, stock, checkout (UPI/cards), orders, customer accounts and admin. Nothing is migrated.
- Products are read from the store's public feed (`/products.json`) and refreshed every 5 minutes. A snapshot in `data/catalogue-snapshot.json` keeps the site up if the store can't be reached.
- **Add to bag** keeps a cart in the browser; **Checkout** and **Buy now** hand off to Shopify's own checkout through a [cart permalink](https://help.shopify.com/en/manual/products/details/cart-permalink). **Orders placed on staging are real orders** in the live Shopify admin.

## Features

| | |
|---|---|
| Shop | Every card leads with the same shot: the garment on its hanger, cut out on ivory (`public/garments/`, from `scripts/garment-cutouts.py`); the worn photo shows on hover. Filters by garment, by ENRJI pillar (mental, emotional, physical, spiritual) and stock; sort by price or newest |
| Product page | Photo gallery with zoom, colour and size selection with live stock, Add to bag, Buy now, tee ↔ sweatshirt switch, size chart, "notify me on WhatsApp" for sold-out sizes, sticky mobile buy bar, Product structured data |
| Cart | Slide-out bag, stock re-check before checkout, multi-buy offer note |
| Trial Room | Upload a photo (or pick a sample model), choose a piece, and an AI try-on model re-draws the same photo wearing it; before/after slider, save, add to bag. Uses the free IDM-VTON demo on Hugging Face (`lib/hfTryon.ts`), called from the shopper's browser. **Non-commercial licence: fine for staging, switch to a licensed provider (e.g. FASHN or Gemini) before launch.** Garment photos: `public/garments/`, made by `scripts/garment-cutouts.py`: it removes the card's text panel, rebuilds the sleeve that panel hid by mirroring the other side, and skips cards where the panel hides the print (Be The Change and Energy Step sweatshirts) |
| Home | Editorial "quiet luxury" page: paired model photographs that open from a centre window (tejint-style), a brand statement, the Live Like Krishna edition, category tiles, a curated edit, an index of the four energies with floating photographs, the founder's words |
| Lookbook | Two full-screen pages built to the same behaviour as tejint.com. `/lookbook` (after tejint.com/studio): a row of editorial photographs glided by scroll, swipe or drag, each sized by its position on screen (half size on the left, up to 1.75× on the right), fabric ground, vertical sidebar, animated buttons. `/lookbook/energies` (after tejint.com's home carousel): the four energies as a centre card with its neighbours turned 90° and cropped either side, the "hop" ease, letter-by-letter titles and a breathing preview behind. Built with GSAP. Photos: `data/lookbook.json` and the COVER list in `app/lookbook/energies/page.tsx` |
| Virtual Store | Black-and-gold walkable 3D store (Three.js) with an animated entrance; the model photos on the walls have real depth; life-size 3D models on the centre stage and on plinths turn to face you; guided tour; tap anything to add to bag |
| 360° view | Product pages and the Trial Room show each tee/sweatshirt as a 3D garment in its real colour and print; drag to spin |

### Trial Room print artwork
AI try-on models draw lettering approximately ("SELLNG"). After the model dresses the photo, `lib/printOverlay.ts` finds the print it drew on the chest, erases it (keeping the fabric's shading), and lays the real artwork in its place. Visible hands and hair stay in front of it. When it can't do this cleanly (no print found, an odd size, or a forearm across the chest), it leaves the model's print as it is.

The prints in `public/prints/` were cut out of the flat-lay product photos on enrji.in, and garment colours were sampled from the same photos (`data/garments.json`). `npm run build` regenerates `data/prints.json`, the list the Trial Room reads.

- Products without a usable flat-lay (Energy Fade, which is tone-on-tone black, and Healthy Is New Rich) have no artwork file, so the AI's own lettering stays.
- For sharper results, replace any file with the print artwork from your designer: a transparent PNG trimmed to the print, named `<product-handle>.png` (per colour: `<handle>--<colour>.png`, e.g. `believe--black.png`).

### 3D photos (Virtual Store)
There is no 3D scan or turntable shoot. Each product's best model photo from the store is turned into a "3D photo" offline:
depth from Depth Anything V2 Small (Apache-2.0), cut-out from BiRefNet lite (MIT), model photo chosen with MediaPipe pose.
The results live in `public/store/<handle>.jpg|-depth.png|-mask.png` and `data/portraits.json`; `lib/depthPortrait.ts` renders them.
They turn about ±35°, not 360°, because a single photo has no back. Re-run after adding products:

```bash
pip install onnxruntime mediapipe pillow numpy
# models: onnx-community/depth-anything-v2-small (onnx/model.onnx → depth.onnx),
#         onnx-community/BiRefNet_lite-ONNX (onnx/model.onnx → birefnet.onnx), pose_landmarker_lite.task
python3 scripts/depth-portraits.py --models <dir>          # or --only <handle> ...
```

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
lib/garment3d.ts     3D garment for the 360° view
lib/depthPortrait.ts 3D photos of the model shots (Virtual Store)
lib/bodyTracking.ts  on-device pose + segmentation (models self-hosted by scripts/vision-assets.mjs)
lib/wornRenderer.ts  WebGL compositor that makes the garment look worn
data/                catalogue snapshot, Trial Room settings
prototype/           earlier Express prototype (reference only, not deployed)
```
