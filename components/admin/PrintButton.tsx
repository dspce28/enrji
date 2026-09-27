'use client';

export function PrintButton() {
  return <button className="btn btn-sm no-print" onClick={() => window.print()}>Print</button>;
}
