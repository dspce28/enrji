import { DELIVERY_DAYS } from './config';

/** Today's date in India, as a UTC-noon Date (so adding days never trips over time zones). */
function todayInIndia(now: Date) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

/** Adds working days (couriers in India deliver Monday to Saturday, so only Sundays are skipped). */
function addWorkingDays(from: Date, days: number) {
  const d = new Date(from);
  for (let left = days; left > 0;) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0) left--;
  }
  return d;
}

const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', ...opts }).format(d);

/** "Wed 14 – Thu 15 Oct" for an order placed now, from the store's published delivery window. */
export function deliveryWindow(now = new Date()) {
  const start = todayInIndia(now);
  const from = addWorkingDays(start, DELIVERY_DAYS.min);
  const to = addWorkingDays(start, DELIVERY_DAYS.max);
  const sameMonth = from.getUTCMonth() === to.getUTCMonth();
  const day = (d: Date) => `${fmt(d, { weekday: 'short' })} ${d.getUTCDate()}`;
  return sameMonth ? `${day(from)} – ${day(to)} ${fmt(to, { month: 'short' })}` : `${day(from)} ${fmt(from, { month: 'short' })} – ${day(to)} ${fmt(to, { month: 'short' })}`;
}
