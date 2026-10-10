"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="route-error">
      <span className="route-loading-mark">!</span>
      <p className="eyebrow">Something needs attention</p>
      <h1>We couldn&apos;t load this page.</h1>
      <p>Try again, or return to the school portal and continue from there.</p>
      <button className="quick-action" onClick={reset} type="button">
        Try again
      </button>
    </main>
  );
}
