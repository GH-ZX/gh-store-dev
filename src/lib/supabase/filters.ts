/**
 * Search terms that are safe to embed in a PostgREST filter.
 *
 * `or=(...)` is parsed as a comma-separated list of `column.operator.value`
 * triples, so a comma, quote, parenthesis, or backslash typed into a search box
 * would change the shape of the filter rather than the text being matched.
 * `%`, `_`, and `*` are `like` wildcards, so a term containing one would match
 * far more rows than the operator asked for.
 *
 * Each is replaced with a space rather than deleted: "ahmed,ali" should search
 * for two words, not for "ahmedali". An empty result means the term carried no
 * searchable characters, and the caller should skip the filter entirely rather
 * than search for nothing.
 */
export function safeFilterTerm(value: string): string {
  return value.replace(/[,()"'\\%_*]/g, " ").trim();
}
