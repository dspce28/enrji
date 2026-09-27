import 'server-only';
import { redirect } from 'next/navigation';
import { ownStore } from '../db';
import { accountUrl } from '../config';
import { currentUser } from './auth';

/** For account pages: the signed-in user, or off to log in (and back here afterwards). */
export async function needUser(path: string) {
  if (!ownStore) redirect(accountUrl);
  const u = await currentUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(path)}`);
  return u;
}
