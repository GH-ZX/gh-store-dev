/**
 * Reduce an order's many delivery attempts to the one word a list can show.
 *
 * Ordered by how much an operator needs to look at it, not by how far the order
 * has progressed: one failed item in an otherwise delivered order is the whole
 * reason to open that order, so the worst state wins. A refund outranks the
 * states that are merely unfinished, because money has already moved.
 *
 * Returns null when nothing has been attempted yet — that is not a state, and a
 * list should say nothing rather than invent "pending".
 */
const PRIORITY = ["failed", "reconcile", "refunded", "pending", "processing", "completed"];

export function worstFulfillmentState(states: string[]): string | null {
  for (const state of PRIORITY) {
    if (states.includes(state)) {
      return state;
    }
  }

  // An attempt in a state the priority list does not know about still needs to
  // surface, so the first one is reported rather than dropped.
  return states[0] ?? null;
}
