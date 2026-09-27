import type { Metadata } from 'next';
import { needUser } from '@/lib/store/pages';
import { listAddresses } from '@/lib/store/account';
import { AccountShell } from '@/components/store/AccountNav';
import { AddressBook } from '@/components/store/AddressBook';

export const metadata: Metadata = { title: 'Addresses', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function Addresses() {
  const u = await needUser('/account/addresses');
  const list = await listAddresses(u.id);
  return (
    <AccountShell active="/account/addresses" title="Addresses" admin={u.role !== 'customer'}>
      <AddressBook initial={list} />
    </AccountShell>
  );
}
