"""
Builds the "3D photo" assets for the Virtual Store and home page from the catalogue's own model photos.

For each product it:
  1. looks through the product photos and picks the best one with a person in it (MediaPipe pose),
  2. estimates depth with Depth Anything V2 Small (Apache-2.0),
  3. cuts the person out with BiRefNet lite (MIT),
and writes public/store/<handle>.jpg (photo), <handle>-depth.png and <handle>-mask.png, plus data/portraits.json.

Run once, offline (models are not needed at runtime):
  pip install onnxruntime mediapipe pillow numpy
  python3 scripts/depth-portraits.py --models <dir with depth.onnx, birefnet.onnx, pose_landmarker_lite.task>
"""
import argparse, io, json, os, sys, urllib.request
import numpy as np
from PIL import Image, ImageFilter
import onnxruntime as ort
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'store')
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)
PHOTO_W = 900       # delivered photo width (3:4 portrait → 1200 high)
MAP_W = 450         # depth / mask width


def fetch(url, width=1200):
    sep = '&' if '?' in url else '?'
    with urllib.request.urlopen(f'{url}{sep}width={width}', timeout=60) as r:
        return Image.open(io.BytesIO(r.read())).convert('RGB')


def norm(img, size):
    a = np.asarray(img.resize(size, Image.BICUBIC), np.float32) / 255.0
    return ((a - MEAN) / STD).transpose(2, 0, 1)[None]


def person_score(pose, img):
    """Higher for a clear, front-facing, waist-up-or-more person. None if no person."""
    res = pose.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(img)))
    if not res.pose_landmarks:
        return None
    lm = res.pose_landmarks[0]
    vis = lambda i: lm[i].visibility or 0
    if min(vis(0), vis(11), vis(12)) < 0.6:
        return None
    shoulders = abs(lm[11].x - lm[12].x)
    hips = min(vis(23), vis(24))
    centred = 1 - abs((lm[11].x + lm[12].x) / 2 - 0.5) * 2
    return shoulders * 2 + hips * 0.6 + centred * 0.5


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--models', required=True)
    ap.add_argument('--only', nargs='*')
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)

    snap = json.load(open(os.path.join(ROOT, 'data', 'catalogue-snapshot.json')))
    products = snap['products'] if isinstance(snap, dict) else snap
    depth = ort.InferenceSession(os.path.join(args.models, 'depth.onnx'))
    seg = ort.InferenceSession(os.path.join(args.models, 'birefnet.onnx'))
    pose = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=os.path.join(args.models, 'pose_landmarker_lite.task')),
        running_mode=vision.RunningMode.IMAGE, num_poses=1))

    manifest_path = os.path.join(ROOT, 'data', 'portraits.json')
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}

    for p in products:
        handle = p['handle']
        if args.only and handle not in args.only:
            continue
        best = None
        for im in (p.get('images') or [])[:8]:
            try:
                img = fetch(im['src'], 600)
            except Exception as e:
                print('  skip image', e, file=sys.stderr)
                continue
            s = person_score(pose, img)
            if s is not None and (best is None or s > best[0]):
                best = (s, im['src'])
        if not best:
            print(f'{handle}: no model photo')
            manifest.pop(handle, None)
            continue

        img = fetch(best[1], 1200)
        w, h = img.size
        # Normalise to a 3:4 portrait, cropped around the centre.
        tw, th = (w, round(w * 4 / 3)) if h >= w * 4 / 3 else (round(h * 3 / 4), h)
        x0, y0 = (w - tw) // 2, max(0, (h - th) // 2)
        img = img.crop((x0, y0, x0 + tw, y0 + th))

        # Cut-out mask.
        m = seg.run(None, {'input_image': norm(img, (1024, 1024))})[0][0, 0]
        m = 1 / (1 + np.exp(-m))
        mask = Image.fromarray((m * 255).astype(np.uint8)).resize((MAP_W, round(MAP_W * 4 / 3)), Image.BILINEAR)

        # Depth (relative inverse depth: larger = nearer), normalised so the person spans most of the range.
        d = depth.run(None, {'pixel_values': norm(img, (518, 686))})[0][0]
        d = np.asarray(Image.fromarray(d).resize((MAP_W, round(MAP_W * 4 / 3)), Image.BICUBIC))
        mk = np.asarray(mask, np.float32) / 255
        person = d[mk > 0.5] if (mk > 0.5).sum() > 100 else d.ravel()
        lo, hi = np.percentile(d, 2), np.percentile(person, 99)
        dn = np.clip((d - lo) / max(hi - lo, 1e-6), 0, 1)
        depth_img = Image.fromarray((dn * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))

        img.resize((PHOTO_W, round(PHOTO_W * 4 / 3)), Image.LANCZOS).save(os.path.join(OUT, f'{handle}.jpg'), quality=84, optimize=True, progressive=True)
        depth_img.save(os.path.join(OUT, f'{handle}-depth.png'), optimize=True)
        mask.save(os.path.join(OUT, f'{handle}-mask.png'), optimize=True)

        ys, xs = np.nonzero(mk > 0.5)
        bbox = [round(float(xs.min()) / mk.shape[1], 3), round(float(ys.min()) / mk.shape[0], 3), round(float(xs.max()) / mk.shape[1], 3), round(float(ys.max()) / mk.shape[0], 3)] if len(xs) else [0, 0, 1, 1]
        manifest[handle] = {'src': best[1], 'bbox': bbox}
        print(f'{handle}: ok  score {best[0]:.2f}')

    json.dump(dict(sorted(manifest.items())), open(manifest_path, 'w'), indent=1)
    print(len(manifest), 'portraits')


if __name__ == '__main__':
    main()
