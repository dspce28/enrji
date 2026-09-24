/** Five stars filled to a rating (0–5), e.g. 4.3 fills four and a third. */
export function Stars({ value, size = 13, label = true }: { value: number; size?: number; label?: boolean }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span className="stars" style={{ fontSize: size }} role={label ? 'img' : undefined} aria-label={label ? `${value.toFixed(1)} out of 5 stars` : undefined} aria-hidden={!label || undefined}>
      <span className="stars-off">★★★★★</span>
      <span className="stars-on" style={{ width: `${pct}%` }}>★★★★★</span>
    </span>
  );
}
