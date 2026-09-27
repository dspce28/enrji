import 'server-only';
import { db, schema } from '../db';

/** Store settings (editable in the admin). Money in paise. */
export interface StoreSettings {
  shipping: { flat: number; freeAbove: number };
  cod: { enabled: boolean; fee: number; maxOrder: number };
  returns: { windowDays: number; exchangeOnly: boolean };
  gst: { threshold: number; rateUpTo: number; rateAbove: number };
  store: { name: string; gstin: string; address: string };
}

const DEFAULTS: StoreSettings = {
  shipping: { flat: 0, freeAbove: 0 },
  cod: { enabled: true, fee: 0, maxOrder: 500000 },
  returns: { windowDays: 7, exchangeOnly: false },
  gst: { threshold: 250000, rateUpTo: 5, rateAbove: 18 },
  store: { name: 'ENRJI', gstin: '', address: '' },
};

export async function getSettings(): Promise<StoreSettings> {
  const rows = await db().select().from(schema.settings);
  const out = structuredClone(DEFAULTS) as unknown as Record<string, unknown>;
  for (const r of rows) out[r.key] = { ...(out[r.key] as object), ...(r.value as object) };
  return out as unknown as StoreSettings;
}
