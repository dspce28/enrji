import { needStaff } from '@/lib/store/admin';
import { auditTrail, listStaff } from '@/lib/store/adminMisc';
import { StaffForm } from '@/components/admin/StaffForm';

export const metadata = { title: 'Staff & log' };

export default async function AdminStaff() {
  const me = await needStaff('staff', '/admin/staff');
  const [staff, log] = await Promise.all([listStaff(), auditTrail()]);
  return (
    <>
      <header className="admin-head"><h1>Staff & activity</h1></header>
      <section className="admin-card">
        <h2>Who has access</h2>
        <p className="muted">Staff handle orders, returns, stock and see customers. Admins can also change products and prices, coupons, reports, settings and staff.</p>
        <table className="atable compact">
          <thead><tr><th>Name</th><th>Mobile</th><th>Role</th><th>Last login</th></tr></thead>
          <tbody>{staff.map((s) => <tr key={s.id}><td>{s.name ?? '—'}{s.id === me.id && ' (you)'}</td><td>{s.phone}</td><td>{s.role}</td><td>{s.lastLoginAt?.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) ?? 'never'}</td></tr>)}</tbody>
        </table>
        <StaffForm />
      </section>
      <section className="admin-card">
        <h2>Activity log</h2>
        <table className="atable compact">
          <thead><tr><th>When</th><th>Who</th><th>What</th><th>Record</th></tr></thead>
          <tbody>{log.map(({ a, by, phone }) => <tr key={a.id}><td>{a.at.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td><td>{by ?? phone ?? 'system'}</td><td>{a.action}</td><td className="muted">{a.entity} {a.entityId}</td></tr>)}</tbody>
        </table>
      </section>
    </>
  );
}
