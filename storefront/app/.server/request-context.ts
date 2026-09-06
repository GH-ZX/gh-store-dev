import { AsyncLocalStorage } from "node:async_hooks";
import { createSessionClient, withSessionCookies } from "./session";
import type { StoreEnvVars } from "./env";

type RequestState = ReturnType<typeof createSessionClient> & { request: Request; memo: Map<string, Promise<unknown>> };
const requests = new AsyncLocalStorage<RequestState>();

export function getRequestState(): RequestState {
  const state = requests.getStore();
  if (!state) throw new Error("Session access requires an active HTTP request.");
  return state;
}

/** Keep migrated services' session and authorization isolated across concurrent requests. */
export async function withRequestContext(request: Request, env: StoreEnvVars, handle: () => Promise<Response>) {
  const state = { ...createSessionClient(request, env), request, memo: new Map<string, Promise<unknown>>() };
  return requests.run(state, async () => {
    const response = await handle();
    return withSessionCookies(response, state.jar, state.isProduction);
  });
}

export function memoizeRequest<T>(key: string, load: () => Promise<T>): Promise<T> {
  const memo = getRequestState().memo;
  const existing = memo.get(key);
  if (existing) return existing as Promise<T>;
  const pending = load();
  memo.set(key, pending);
  return pending;
}
