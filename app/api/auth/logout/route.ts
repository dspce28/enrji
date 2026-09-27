import { route } from '@/lib/store/api';
import { signOut } from '@/lib/store/auth';

export const POST = route(async () => { await signOut(); return { ok: true }; });
