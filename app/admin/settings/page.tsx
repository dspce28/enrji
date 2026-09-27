import { needStaff } from '@/lib/store/admin';
import { getSettings } from '@/lib/store/settings';
import { SettingsForm } from '@/components/admin/SettingsForm';

export const metadata = { title: 'Settings' };

export default async function Settings() {
  await needStaff('settings', '/admin/settings');
  const s = await getSettings();
  const r = (p: number) => String(p / 100);
  return (
    <>
      <header className="admin-head"><h1>Store settings</h1></header>
      <SettingsForm initial={{
        shipping: { flat: r(s.shipping.flat), freeAbove: r(s.shipping.freeAbove) },
        cod: { enabled: s.cod.enabled, fee: r(s.cod.fee), maxOrder: r(s.cod.maxOrder) },
        returns: { windowDays: String(s.returns.windowDays), exchangeOnly: s.returns.exchangeOnly },
        gst: { threshold: r(s.gst.threshold), rateUpTo: String(s.gst.rateUpTo), rateAbove: String(s.gst.rateAbove) },
        store: s.store,
      }} />
    </>
  );
}
