import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/config';

export default function robots(): MetadataRoute.Robots {
  // Staging stays out of search engines until ALLOW_INDEXING=true.
  if (process.env.ALLOW_INDEXING !== 'true') return { rules: { userAgent: '*', disallow: '/' } };
  return { rules: { userAgent: '*', allow: '/', disallow: '/api/' }, sitemap: `${SITE_URL}/sitemap.xml` };
}
