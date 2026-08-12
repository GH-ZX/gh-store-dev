export function LoadingState() {
  return (
    <div className="grid gap-3" aria-label="Loading" role="status">
      <div className="h-4 w-32 animate-pulse rounded bg-[var(--surface-strong)]" />
      <div className="h-12 w-full animate-pulse rounded-xl bg-[var(--surface-strong)]" />
    </div>
  );
}
