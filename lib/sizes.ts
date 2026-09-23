// Measurements from the size-chart images on the store's product pages (inches, measured flat; chest doubled).
export const TEE_SIZES = [
  { size: 'S', chest: 38, length: 26.5 },
  { size: 'M', chest: 40, length: 27 },
  { size: 'L', chest: 42, length: 28 },
  { size: 'XL', chest: 44, length: 29 },
  { size: '2XL', chest: 46, length: 30 },
  { size: '3XL', chest: 48, length: 30.5 },
];

// The published sweatshirt chart stops at XXL (listed as 2XL on the store); 3XL isn't measured yet.
export const SWEAT_SIZES = [
  { size: 'S', chest: 40, length: 25.5 },
  { size: 'M', chest: 42, length: 26.5 },
  { size: 'L', chest: 44, length: 27.5 },
  { size: 'XL', chest: 46, length: 28.5 },
  { size: '2XL', chest: 48, length: 29.5 },
];

export const sizesFor = (kind: 'tee' | 'sweatshirt') => (kind === 'tee' ? TEE_SIZES : SWEAT_SIZES);
