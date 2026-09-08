/**
 * Render a user-written description with line-break support.
 *
 * Descriptions are stored as plain text and authored in textarea fields where
 * pressing Enter creates a newline. Without this helper those newlines vanish,
 * turning multi-step instructions into an unreadable wall. Splitting on `\n\n`
 * gives paragraph breaks; a single `\n` becomes a `<br>`.
 */

function paragraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

export function DescriptionText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const blocks = paragraphs(text);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      {blocks.map((block, index) => (
        <p
          key={index}
          className="max-w-2xl text-base leading-7 text-[var(--ink-soft)]"
          // Each block may still contain single newlines (steps, lists) —
          // preserve them as line breaks within the paragraph.
          dangerouslySetInnerHTML={{
            __html: block
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/\n/g, "<br />"),
          }}
        />
      ))}
    </div>
  );
}
