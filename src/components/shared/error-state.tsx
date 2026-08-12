type ErrorStateProps = {
  title: string;
  description: string;
};

export function ErrorState({ title, description }: ErrorStateProps) {
  return (
    <div className="rounded-[var(--radius-card)] border border-red-300/20 bg-red-300/5 p-8 text-center">
      <h2 className="text-lg font-semibold text-[var(--ink)]">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--ink-muted)]">{description}</p>
    </div>
  );
}
