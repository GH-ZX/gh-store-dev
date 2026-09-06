import { ChevronIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/**
 * Static content building blocks.
 *
 * {@link FaqList} uses native `details`/`summary`, so it expands without
 * JavaScript, is keyboard-operable for free, and stays findable by in-page
 * search — the marker is replaced with a rotating chevron rather than hidden.
 */

export function FaqList({
  items,
}: {
  items: readonly { question: string; answer: string }[];
}) {
  return (
    <ul className="sf-content-faq">
      {items.map((item) => (
        <li key={item.question}>
          <details className="sf-content-faq-item group">
            <summary className="sf-content-faq-question">
              {item.question}
              <span
                className="grid size-8 shrink-0 place-items-center rounded-lg border border-[var(--line)] text-[var(--ink-muted)] transition-transform duration-[var(--duration)] ease-[var(--ease-spring)] group-open:rotate-180"
                aria-hidden="true"
              >
                <ChevronIcon direction="down" className="size-4" />
              </span>
            </summary>
            <p className="sf-content-faq-answer">{item.answer}</p>
          </details>
        </li>
      ))}
    </ul>
  );
}

/** Numbered step cards for a "how it works" flow. */
export function StepList({
  steps,
}: {
  steps: readonly { title: string; description: string }[];
}) {
  return (
    <ol className="sf-content-steps">
      {steps.map((step, index) => (
        <li key={step.title} className="sf-content-step">
          <span className="grid size-9 place-items-center rounded-lg border border-[var(--line-strong)] bg-[var(--shell)] text-sm font-bold text-[var(--accent)] tabular-nums">
            {index + 1}
          </span>
          <h3 className="mt-4 text-[0.9375rem] font-semibold text-[var(--ink)]">
            {step.title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">
            {step.description}
          </p>
        </li>
      ))}
    </ol>
  );
}

/** Long-form policy sections. */
export function ProseSections({
  sections,
  className,
}: {
  sections: readonly { heading: string; body: string }[];
  className?: string;
}) {
  return (
    <div className={cn("sf-content-prose", className)}>
      {sections.map((section) => (
        <section key={section.heading}>
          <h2 className="text-lg font-semibold tracking-tight text-[var(--ink)]">
            {section.heading}
          </h2>
          <p className="sf-content-prose-body">{section.body}</p>
        </section>
      ))}
    </div>
  );
}
