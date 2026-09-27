import { put } from '@vercel/blob';
import { route, StoreError } from '@/lib/store/api';
import { requireArea } from '@/lib/store/admin';

/** POST multipart "file" → { url } on Vercel Blob. Needs BLOB_READ_WRITE_TOKEN (Vercel → Storage → Blob). */
export const POST = route(async (req) => {
  await requireArea('catalogue');
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new StoreError('Photo upload isn’t set up yet (add Blob storage on Vercel). Paste an image link instead.', 503);
  const file = (await req.formData()).get('file');
  if (!(file instanceof File)) throw new StoreError('No file');
  if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) throw new StoreError('Upload a JPG, PNG, WebP or AVIF image.');
  if (file.size > 8e6) throw new StoreError('Images up to 8 MB, please.');
  const safe = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').slice(-60);
  const blob = await put(`products/${Date.now()}-${safe}`, file, { access: 'public', contentType: file.type });
  return { url: blob.url };
});
