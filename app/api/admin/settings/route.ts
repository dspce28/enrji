import { body, route } from '@/lib/store/api';
import { requireArea } from '@/lib/store/admin';
import { saveSettings } from '@/lib/store/adminMisc';
import type { StoreSettings } from '@/lib/store/settings';

export const PUT = route(async (req) => { const u = await requireArea('settings'); return { settings: await saveSettings(await body<Partial<StoreSettings>>(req), u.id) }; });
