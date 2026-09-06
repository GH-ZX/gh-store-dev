import { useCallback, type FormEventHandler } from "react";
import { useFetcher } from "react-router";
import { INITIAL_WEBSITE_STATE, type WebsiteActionState } from "./website-action-state";

/** Keep failed submissions editable and revalidate the storefront after each save. */
export function useWebsiteAction(intent: string): [WebsiteActionState, FormEventHandler<HTMLFormElement>, boolean] {
  const fetcher = useFetcher<WebsiteActionState>();
  const submit = fetcher.submit;
  const action = useCallback<FormEventHandler<HTMLFormElement>>((event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("intent", intent);
    void submit(form, { method: "post" });
  }, [intent, submit]);
  return [fetcher.data ?? INITIAL_WEBSITE_STATE, action, fetcher.state !== "idle"];
}
