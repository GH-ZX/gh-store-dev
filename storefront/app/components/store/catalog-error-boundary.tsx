import {
  isRouteErrorResponse,
  useParams,
  useRevalidator,
  useRouteError,
} from "react-router";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { Section } from "@/components/ui/section";
import { Button, ButtonLink } from "@/components/ui/button";

export function CatalogErrorBoundary() {
  const error = useRouteError();
  const params = useParams();
  const locale = isLocale(params.locale ?? "")
    ? (params.locale as "ar" | "en")
    : "ar";
  const common = getMessages(locale, "common");
  const catalog = getMessages(locale, "catalog");
  const { revalidate, state } = useRevalidator();
  const missing = isRouteErrorResponse(error) && error.status === 404;
  return (
    <Section spacing="page">
      <div className="mx-auto max-w-xl rounded-[var(--radius-shell)] border bg-[var(--surface)] p-8 text-center">
        <h1 className="text-2xl font-semibold">
          {missing
            ? common.states.notFoundTitle
            : catalog.products.errorTitle}
        </h1>
        <p className="mt-4 text-[var(--ink-muted)]">
          {missing
            ? common.states.notFoundDescription
            : catalog.products.errorDescription}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <ButtonLink href={`/${locale}/products`}>
            {common.navigation.products}
          </ButtonLink>
          {!missing ? (
            <Button
              variant="secondary"
              disabled={state !== "idle"}
              onClick={() => void revalidate()}
            >
              {state !== "idle" ? common.states.loading : common.actions.retry}
            </Button>
          ) : null}
        </div>
      </div>
    </Section>
  );
}
