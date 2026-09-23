import { inr, percentOff } from '@/lib/format';

export function Price({ price, compareAt, showOff = false }: { price: number; compareAt: number | null; showOff?: boolean }) {
  const off = percentOff(price, compareAt);
  return (
    <span className="price">
      <span>{inr(price)}</span>
      {compareAt ? <s aria-label={`was ${inr(compareAt)}`}>{inr(compareAt)}</s> : null}
      {showOff && off > 0 && <span className="off">{off}% off</span>}
    </span>
  );
}
