import Link from 'next/link';

/** Small round "home" button for the full-screen Lookbook pages (they hide the site header). */
export function HomeButton({ className = '' }: { className?: string }) {
  return (
    <Link href="/" className={`lb-home ${className}`} aria-label="Back to home" title="Home">
      <svg viewBox="0 0 24 24" aria-hidden><path d="M4 11.5 12 4l8 7.5" /><path d="M6.5 10v9.5h4v-5h3v5h4V10" /></svg>
    </Link>
  );
}
