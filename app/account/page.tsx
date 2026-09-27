import type { Metadata } from 'next';
import { needUser } from '@/lib/store/pages';
import { AccountShell } from '@/components/store/AccountNav';
import { ProfileForm } from '@/components/store/ProfileForm';

export const metadata: Metadata = { title: 'Your account', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function Account({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const u = await needUser('/account');
  const welcome = (await searchParams).welcome === '1' || !u.name;
  return (
    <AccountShell active="/account" title={u.name ? `Hello, ${u.name.split(' ')[0]}` : 'Welcome to ENRJI'} admin={u.role !== 'customer'}>
      {welcome && <p className="lead" style={{ marginBottom: 24 }}>Tell us your name so we know what to call you.</p>}
      <ProfileForm user={{ name: u.name ?? '', email: u.email ?? '', phone: u.phone, marketingConsent: u.marketingConsent }} />
    </AccountShell>
  );
}
