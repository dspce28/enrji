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

/** Returns the generated photo. Throws with a readable message when the free service is busy or out of quota. */
export async function aiTryOn(person: Blob, garment: Blob, description: string, onStatus?: (s: TryOnStatus) => void, signal?: AbortSignal): Promise<Blob> {
  onStatus?.({ stage: 'uploading' });
  const [p, g] = await Promise.all([upload(person, 'person.jpg', signal), upload(garment, 'garment.jpg', signal)]);
  const r = await fetch(`${TRYON_SPACE}/call/tryon`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [{ background: ref(p), layers: [], composite: null }, ref(g), description, true, true, 30, Math.floor(Math.random() * 10000)] }),
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
        else if (event === 'error') error = data && data !== 'null' ? data : 'The free try-on service is busy or has hit its daily limit.';
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
