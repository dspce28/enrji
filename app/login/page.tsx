import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ownStore } from '@/lib/db';
import { currentUser } from '@/lib/store/auth';
import { accountUrl } from '@/lib/config';
import { LoginForm } from '@/components/store/LoginForm';

export const metadata: Metadata = { title: 'Log in', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** Only allow in-site paths after login (no open redirects). */
const safeNext = (n?: string) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/account');

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!ownStore) redirect(accountUrl);
  const next = safeNext((await searchParams).next);
  if (await currentUser()) redirect(next);
  return (
    <div className="container auth-page">
      <div className="auth-card">
        <p className="eyebrow">Welcome</p>
        <h1 className="display h2" style={{ marginTop: 12 }}>Log in or sign up</h1>
        <p className="muted" style={{ marginTop: 10 }}>Use your mobile number. We&apos;ll send a one-time code.</p>
        <LoginForm next={next} />
      </div>
    </div>
  );
}
