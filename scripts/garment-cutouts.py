"""
Clean garment photos for the AI Trial Room.

Try-on models need the garment on its own, flat and front-on. Each ENRJI product has a "hanger" card
among its photos (the garment on a hanger, beside the fabric notes); this finds that card (no person in it,
a dark panel down the left), cuts the garment out with BiRefNet lite (MIT) and puts it on white:
public/garments/<handle>.jpg, listed in data/garment-photos.json with the garment's average colour.

  pip install onnxruntime mediapipe pillow numpy scipy
  python3 scripts/garment-cutouts.py --models <dir with birefnet.onnx, pose_landmarker_lite.task>
"""
import argparse, io, json, os, urllib.request
import numpy as np
from PIL import Image
from scipy import ndimage
import onnxruntime as ort
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'garments')
# Cards whose props (peacock feathers) overlap the sleeves.
PROPS_ON_CUFFS = {'believe', 'surrender-smile-rise'}
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)


def fetch(url, width):
    sep = '&' if '?' in url else '?'
    with urllib.request.urlopen(f'{url}{sep}width={width}', timeout=60) as r:
        return Image.open(io.BytesIO(r.read())).convert('RGB')


def has_person(pose, img):
    res = pose.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(img)))
    return bool(res.pose_landmarks) and (res.pose_landmarks[0][0].visibility or 0) > 0.5


def is_hanger_card(img):
    """The hanger cards have a dark panel down the left and a dark strip of icons along the bottom."""
    a = np.asarray(img.resize((120, 160)), np.float32) / 255
    lum = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    return lum[:, :28].mean() < 0.25 and lum[-25:].mean() < 0.22


def trim_above_hook(m):
    """Some cards hang the garment from a branch. Cut the thin hook to separate the garment, then keep
    only the hook rows above it that are nothing but hook."""
    b = m > 0.5
    w = m.shape[1]
    opened = ndimage.binary_opening(b, structure=np.ones((1, max(3, int(w * 0.03)))))
    lab, n = ndimage.label(opened)
    if n == 0:
        return m
    g = lab == 1 + int(np.argmax(ndimage.sum(opened, lab, range(1, n + 1))))
    rows = np.nonzero(g.any(1))[0]
    top = rows.min()
    ax = np.nonzero(g[top:top + max(3, int((rows.max() - top) * 0.05))])[1].mean()
    out = m.copy()
    for y in range(top - 1, -1, -1):
        on = np.nonzero(b[y])[0]
        if len(on) == 0 or (np.abs(on - ax) > w * 0.03).any():
            out[:y + 1] = 0
            break
    return out


def panel_edge(img):
    """Right edge (px) of the card's dark text panel, read along the top strip, where the rest of the card
    is bright background: the panel ends where the strip turns light for good."""
    a = np.asarray(img, np.float32) / 255
    lum = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    h, w = lum.shape
    dark = (lum[int(h * 0.02):int(h * 0.12)] < 0.3).mean(0)
    run = max(4, int(w * 0.012))
    for x in range(int(w * 0.6)):
        if dark[x:x + run].mean() < 0.3:
            return x
    return 0


def mirror_hidden_side(m, rgb, cut):
    """Garments are symmetric: rebuild the part hidden behind the panel from the other side,
    mirrored about the centre line (hanger hook and collar)."""
    ys, xs = np.nonzero(m > 0.5)
    if cut <= 0 or xs.min() > cut + m.shape[1] * 0.01:
        return m, rgb, True                                # the panel didn't touch the garment
    y0, y1 = ys.min(), ys.max()
    top = m[y0:y0 + int((y1 - y0) * 0.12)] > 0.5
    ax = float(np.nonzero(top)[1].mean())
    edge = cut + int(m.shape[1] * 0.012)                   # also replace the strip shaded by the panel
    # Only ever the sleeve and side seam: never mirror across the print.
    # Only ever the sleeve and side seam: never mirror across the print. If the panel hid more, give up.
    reach = (ax - edge) / max(1, xs.max() - ax)            # how close to the centre line the rebuild comes
    if reach < 0.3:
        return m, rgb, False
    pad = max(0, int(np.ceil(xs.max() - 2 * ax)) + 4)       # the rebuilt side may reach past the crop
    m = np.pad(m, ((0, 0), (pad, 0))); rgb = np.pad(rgb, ((0, 0), (pad, 0), (0, 0)), constant_values=255)
    ax += pad
    for x in range(0, edge + pad):
        xm = int(round(2 * ax - x))
        if 0 <= xm < m.shape[1]:
            m[:, x] = m[:, xm]; rgb[:, x] = rgb[:, xm]
    print(f'  rebuilt the side hidden by the panel (stops {reach:.2f} of the half-width from the centre)')
    return m, rgb, True


def clean_props(m, rgb):
    """Props on the cards (peacock feathers, leaves) overlap the cuffs. Repaint pixels far from the sleeve colour on the
    lower sleeves with the fabric around them. Prints sit on the chest and are never touched."""
    ys, xs = np.nonzero(m > 0.5)
    y0, y1 = ys.min(), ys.max()
    ax = float(np.nonzero(m[y0:y0 + int((y1 - y0) * 0.12)] > 0.5)[1].mean())
    half = max(xs.max() - ax, ax - xs.min())
    yy, xx = np.mgrid[0:m.shape[0], 0:m.shape[1]]
    cuffs = (m > 0.5) & (yy > y0 + (y1 - y0) * 0.55) & (np.abs(xx - ax) > half * 0.6)
    if cuffs.sum() < 100:
        return rgb
    sleeve = np.median(rgb[cuffs & (m > 0.8)], axis=0)
    far = np.linalg.norm(rgb - sleeve, axis=2) > 70
    bad = ndimage.binary_dilation(cuffs & far, iterations=4) & (m > 0.5)
    if bad.sum() < 50:
        return rgb
    good = ((m > 0.8) & ~ndimage.binary_dilation(bad, iterations=4)).astype(np.float32)
    fill = np.zeros_like(rgb); cov = np.zeros(m.shape, np.float32)
    for k in (0.03, 0.08, 0.2):                            # wider reach where the prop is large
        r = max(8, int(m.shape[1] * k))
        wsum = ndimage.uniform_filter(good, r)
        est = np.stack([ndimage.uniform_filter(rgb[..., c] * good, r) for c in range(3)], -1) / np.maximum(wsum, 1e-6)[..., None]
        take = (cov < 0.05) & (wsum > 0.02)
        fill[take] = est[take]; cov = np.maximum(cov, np.where(take, wsum, 0))
    fill[cov < 0.02] = sleeve
    rgb = rgb.copy(); rgb[bad] = fill[bad]
    print(f'  repainted {int(bad.sum())} prop pixels on the cuffs')
    return rgb


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--models', required=True)
    ap.add_argument('--only', nargs='*')
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    snap = json.load(open(os.path.join(ROOT, 'data', 'catalogue-snapshot.json')))
    products = snap['products'] if isinstance(snap, dict) else snap
    seg = ort.InferenceSession(os.path.join(args.models, 'birefnet.onnx'))
    pose = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=os.path.join(args.models, 'pose_landmarker_lite.task')),
        running_mode=vision.RunningMode.IMAGE, num_poses=1))
    manifest_path = os.path.join(ROOT, 'data', 'garment-photos.json')
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}

    for p in products:
        h = p['handle']
        if args.only and h not in args.only:
            continue
        card = None
        for im in (p.get('images') or [])[:10]:
            try:
                small = fetch(im['src'], 400)
            except Exception:
                continue
            if is_hanger_card(small) and not has_person(pose, small):
                card = im['src']
                break
        if not card:
            print(f'{h}: no hanger photo')
            manifest.pop(h, None)
            continue
        img = fetch(card, 1600)
        w, hh = img.size
        crop = img.crop((int(w * 0.29), int(hh * 0.07), int(w * 0.985), int(hh * 0.8)))
        x = (np.asarray(crop.resize((1024, 1024)), np.float32) / 255 - MEAN) / STD
        m = seg.run(None, {'input_image': x.transpose(2, 0, 1)[None]})[0][0, 0]
        m = 1 / (1 + np.exp(-m))
        m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).resize(crop.size, Image.BICUBIC), np.float32) / 255
        # Drop everything over the card's text panel (it hides part of one sleeve; rebuilt below).
        panel = panel_edge(img) - int(w * 0.29)
        if panel > 0:
            m[:, :panel + int(w * 0.004)] = 0
        # Keep the garment only: the largest piece (drops stray lettering, props at the edge).
        lab, n = ndimage.label(m > 0.5)
        if n == 0:
            print(f'{h}: nothing cut out'); continue
        sizes = ndimage.sum(np.ones_like(m), lab, range(1, n + 1))
        keep = lab == (1 + int(np.argmax(sizes)))
        keep = ndimage.binary_dilation(keep, iterations=3)
        m = m * keep
        rgb = np.asarray(crop, np.float32)
        m = trim_above_hook(m)
        lab, n = ndimage.label(m > 0.5)                    # drop what the trim left floating (branch tips)
        if n > 1:
            m = m * ndimage.binary_dilation(lab == 1 + int(np.argmax(ndimage.sum(m > 0.5, lab, range(1, n + 1)))), iterations=3)
        m, rgb, whole = mirror_hidden_side(m, rgb, panel + int(w * 0.004))
        if not whole:
            print(f'{h}: the panel hides too much of it')
            manifest.pop(h, None)
            if os.path.exists(os.path.join(OUT, f'{h}.jpg')): os.remove(os.path.join(OUT, f'{h}.jpg'))
            continue
        if h in PROPS_ON_CUFFS:
            rgb = clean_props(m, rgb)
        ys, xs = np.nonzero(m > 0.5)
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        out = rgb * m[..., None] + 255 * (1 - m[..., None])
        colour = rgb[m > 0.8].mean(0) if (m > 0.8).sum() > 100 else rgb.mean((0, 1))
        piece = Image.fromarray(out.clip(0, 255).astype(np.uint8)).crop((x0, y0, x1 + 1, y1 + 1))
        # Centre on a white 3:4 canvas with a margin (the try-on model expects 768 × 1024).
        pw, ph = piece.size
        scale = min(700 / pw, 940 / ph)
        piece = piece.resize((max(1, int(pw * scale)), max(1, int(ph * scale))), Image.LANCZOS)
        canvas = Image.new('RGB', (768, 1024), 'white')
        canvas.paste(piece, ((768 - piece.width) // 2, (1024 - piece.height) // 2))
        canvas.save(os.path.join(OUT, f'{h}.jpg'), quality=90, optimize=True)
        manifest[h] = {'src': card, 'color': '#%02x%02x%02x' % tuple(int(c) for c in colour)}
        if h in PROPS_ON_CUFFS:
            manifest[h]['card'] = False                 # fine for the Trial Room, not clean enough to sell with
        print(f'{h}: ok')
    json.dump(dict(sorted(manifest.items())), open(manifest_path, 'w'), indent=1)
    print(len(manifest), 'garment photos')


if __name__ == '__main__':
    main()
