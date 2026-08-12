type EmptyStateProps = {
  title: string;
  description: string;
};

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--line-strong)] p-8 text-center">
      <h2 className="text-lg font-semibold text-[var(--ink)]">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--ink-muted)]">{description}</p>
    </div>
  );
}
