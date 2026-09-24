"""
Where the face is in each product photo, so crops keep it in frame.

Photos are shown in frames of many shapes (full-height hero halves, wide tiles, squares). Cropping from the
centre cuts off heads when the face sits high in the picture. This finds the head in every catalogue photo
with MediaPipe pose (nose and eyes) and writes data/focal.json: { "<image path>": [x, y] } in 0–1, the point
to keep in view. lib/focus.ts turns it into object-position.

  pip install mediapipe pillow numpy
  python3 scripts/focal-points.py --models <dir with pose_landmarker_lite.task>
"""
import argparse, io, json, os, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def key(src):
    """The image's path without query or host, the same key lib/focus.ts uses."""
    return src.split('?')[0].split('/files/')[-1]


def fetch(src):
    sep = '&' if '?' in src else '?'
    try:
        with urllib.request.urlopen(f'{src}{sep}width=480', timeout=60) as r:
            return Image.open(io.BytesIO(r.read())).convert('RGB')
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--models', required=True)
    args = ap.parse_args()
    snap = json.load(open(os.path.join(ROOT, 'data', 'catalogue-snapshot.json')))
    products = snap['products'] if isinstance(snap, dict) else snap
    srcs = list(dict.fromkeys(im['src'] for p in products for im in (p.get('images') or [])[:10]))
    pose = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=os.path.join(args.models, 'pose_landmarker_lite.task')),
        running_mode=vision.RunningMode.IMAGE, num_poses=1))
    with ThreadPoolExecutor(8) as ex:
        images = list(ex.map(fetch, srcs))
    out = {}
    for src, img in zip(srcs, images):
        if img is None:
            continue
        res = pose.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(img)))
        if not res.pose_landmarks:
            continue
        lm = res.pose_landmarks[0]
        nose, eyes = lm[0], [lm[2], lm[5]]
        if (nose.visibility or 0) < 0.6 or not (0 <= nose.x <= 1 and 0 <= nose.y <= 1):
            continue
        eye_y = sum(e.y for e in eyes) / 2
        # Aim a little above the eyes so the forehead and hair stay in, not just the nose.
        y = max(0.0, eye_y - 0.04)
        out[key(src)] = [round(nose.x, 3), round(y, 3)]
    json.dump(dict(sorted(out.items())), open(os.path.join(ROOT, 'data', 'focal.json'), 'w'), indent=0)
    print(f'{len(out)} of {len(srcs)} photos have a face')


if __name__ == '__main__':
    main()
