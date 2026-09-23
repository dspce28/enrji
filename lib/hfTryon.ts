'use client';

/**
 * AI try-on through the free IDM-VTON demo on Hugging Face (yisol/IDM-VTON, CC BY-NC-SA 4.0).
 * NON-COMMERCIAL: fine for the staging/approval site; switch to a licensed provider before launch.
 * Called straight from the shopper's browser, so each visitor uses their own free GPU allowance.
 */

export const TRYON_SPACE = 'https://yisol-idm-vton.hf.space';

type FileRef = { path: string; meta: { _type: 'gradio.FileData' } };
const ref = (path: string): FileRef => ({ path, meta: { _type: 'gradio.FileData' } });

async function upload(blob: Blob, name: string, signal?: AbortSignal): Promise<string> {
  const fd = new FormData();
  fd.append('files', blob, name);
  const r = await fetch(`${TRYON_SPACE}/upload`, { method: 'POST', body: fd, signal });
  if (!r.ok) throw new Error(`upload ${r.status}`);
  return (await r.json())[0];
}

export interface TryOnStatus { stage: 'uploading' | 'queued' | 'generating' | 'downloading'; position?: number; eta?: number }

/**
 * Returns the generated photo. With a mask (white = may repaint), the person image must already be 3:4 and
 * the result is the same size; without one, the Space finds the upper body itself and crops as it likes.
 * Throws with the Space's message when it is busy or out of quota.
 */
export async function aiTryOn(person: Blob, garment: Blob, description: string, mask: Blob | null, onStatus?: (s: TryOnStatus) => void, signal?: AbortSignal): Promise<Blob> {
  onStatus?.({ stage: 'uploading' });
  const [p, g, m] = await Promise.all([upload(person, 'person.jpg', signal), upload(garment, 'garment.jpg', signal), mask ? upload(mask, 'mask.png', signal) : Promise.resolve(null)]);
  const r = await fetch(`${TRYON_SPACE}/call/tryon`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' },
    // Args: image + drawn mask, garment, description, auto-mask, auto-crop, steps, seed.
    body: JSON.stringify({ data: [{ background: ref(p), layers: m ? [ref(m)] : [], composite: null }, ref(g), description, !m, !m, 30, Math.floor(Math.random() * 10000)] }),
  });
  if (!r.ok) throw new Error(`start ${r.status}`);
  const { event_id } = await r.json();
  onStatus?.({ stage: 'queued' });

  const s = await fetch(`${TRYON_SPACE}/call/tryon/${event_id}`, { signal });
  if (!s.ok || !s.body) throw new Error(`stream ${s.status}`);
  const reader = s.body.getReader();
  const dec = new TextDecoder();
  let buf = '', event = '', result: { url: string }[] | null = null, error: string | null = null;
  while (!result && !error) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        if (event === 'complete') result = JSON.parse(data);
        else if (event === 'error') error = data && data !== 'null' ? data : 'busy';
        else if (event === 'generating') onStatus?.({ stage: 'generating' });
      }
    }
  }
  reader.cancel().catch(() => {});
  if (error) throw new Error(error.replace(/^"|"$/g, ''));
  if (!result?.[0]?.url) throw new Error('No image came back from the try-on service.');
  onStatus?.({ stage: 'downloading' });
  const img = await fetch(result[0].url, { signal });
  if (!img.ok) throw new Error(`result ${img.status}`);
  return img.blob();
}
