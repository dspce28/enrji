import type { MetadataRoute } from 'next';
import { getProducts } from '@/lib/catalogue';
import { SITE_URL } from '@/lib/config';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = ['', '/shop', '/lookbook', '/collections/tees', '/collections/sweatshirts', '/collections/limited-edition', '/trial-room', '/virtual-store', '/our-story', '/size-guide', '/faq', '/contact'];
  const products = await getProducts();
  return [
    ...pages.map((p) => ({ url: `${SITE_URL}${p}` })),
    ...products.map((p) => ({ url: `${SITE_URL}/products/${p.handle}`, lastModified: p.createdAt })),
  ];
}
