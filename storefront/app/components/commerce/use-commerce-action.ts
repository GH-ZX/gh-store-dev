import { useCallback, type FormEvent } from "react";
import { useFetcher } from "react-router";
/** Keep native form values while validation runs; imperative submit also serves payment polling. */
export function useCommerceAction<T>(intent: string, initial: T): [T, (form: FormData) => void, boolean, (event: FormEvent<HTMLFormElement>) => void] {
  const fetcher = useFetcher<T>();
  const submit = fetcher.submit;
  const action = useCallback((form: FormData) => {
    form.set("intent", intent);
    void submit(form, { method: "post" });
  }, [intent, submit]);
  const onSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    action(new FormData(event.currentTarget));
  }, [action]);
  return [(fetcher.data as T | undefined) ?? initial, action, fetcher.state !== "idle", onSubmit];
}
