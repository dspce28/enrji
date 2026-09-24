import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  // The trial room asks for the camera on this origin only.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
];

const config: NextConfig = {
  poweredByHeader: false,
  // Share pictures render on demand and read these from disk.
  outputFileTracingIncludes: {
    '/opengraph-image': ['./assets/fonts/**', './public/store/*.jpg'],
    '/products/[handle]/opengraph-image': ['./assets/fonts/**', './public/store/*.jpg'],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default config;
