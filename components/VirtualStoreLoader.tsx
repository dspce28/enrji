'use client';

import dynamic from 'next/dynamic';
import type { StoreProduct } from './VirtualStore';

// Three.js needs the browser: load the store only on the client, and only on this page.
const VirtualStore = dynamic(() => import('./VirtualStore'), {
  ssr: false,
  loading: () => <div className="vstore-loading" style={{ position: 'relative', height: '70vh' }}><span className="display">Opening the store</span></div>,
});

export function VirtualStoreLoader({ products }: { products: StoreProduct[] }) {
  return <VirtualStore products={products} />;
}
