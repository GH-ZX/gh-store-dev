import "server-only";

/**
 * A hard ceiling on how long a supplier may keep a request waiting.
 *
 * The provider clients retry — three attempts, fifteen seconds each, with
 * backoff — which is correct for a purchase, where giving up early risks losing
 * money that has already moved. It is the wrong trade for a balance read: worst
 * case that retry budget is roughly forty-six seconds for one supplier, and
 * Cloudflare kills the whole request at thirty. A refresh of four wallets could
 * therefore never finish, and the owner saw a dead dashboard instead of a failed
 * card.
 *
 * A balance is a read. If a supplier cannot answer within a few seconds, the
 * honest result is "unreachable" now rather than a hang and then nothing. The
 * outstanding fetch is abandoned with the request; nothing has been mutated, so
 * there is nothing to unwind.
 */
export class DeadlineExceededError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} did not answer within ${ms}ms`);
    this.name = "DeadlineExceededError";
  }
}

export async function withDeadline<T>(
  label: string,
  ms: number,
  work: () => Promise<T>,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      work(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new DeadlineExceededError(label, ms)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
