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
        # Keep the garment only: the largest piece (drops stray lettering, props at the edge).
        lab, n = ndimage.label(m > 0.5)
        if n == 0:
            print(f'{h}: nothing cut out'); continue
        sizes = ndimage.sum(np.ones_like(m), lab, range(1, n + 1))
        keep = lab == (1 + int(np.argmax(sizes)))
        keep = ndimage.binary_dilation(keep, iterations=3)
        m = m * keep
        ys, xs = np.nonzero(m > 0.5)
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        rgb = np.asarray(crop, np.float32)
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
        print(f'{h}: ok')
    json.dump(dict(sorted(manifest.items())), open(manifest_path, 'w'), indent=1)
    print(len(manifest), 'garment photos')


if __name__ == '__main__':
    main()
