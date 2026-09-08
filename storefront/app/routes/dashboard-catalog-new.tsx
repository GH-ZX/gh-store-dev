import { Link } from "react-router";
import { AdminCard } from "@/components/admin/admin-form";
import { ProductCreateForm } from "@/components/admin/product-create-form";
import { ChevronIcon, GamepadIcon } from "@/components/ui/icons";
import { getMessages } from "@/i18n/messages";
import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { isLocale } from "@/i18n/config";
import { requireDashboardAdmin } from "@server/dashboard-access";

function requireLocale(value: string | undefined) {
  if (!value || !isLocale(value)) throw new Response("Not Found", { status: 404 });
  return value;
}

export async function loader({ params, request }: LoaderFunctionArgs) {
  const locale = requireLocale(params.locale);
  await requireDashboardAdmin(request, locale);

  return { locale };
}

export default function Page() {
  const { locale } = useLoaderData<typeof loader>();
  const messages = getMessages(locale, "admin").catalog;

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <div>
        <Link
          to={`/${locale}/dashboard/catalog`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
        >
          <ChevronIcon
            direction={locale === "ar" ? "end" : "start"}
            className="size-4"
          />
          <span>{messages.backToCatalog}</span>
        </Link>
      </div>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)]">
          <GamepadIcon className="size-4 text-[var(--accent)]" />
          <span>{messages.eyebrow}</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--ink)] sm:text-3xl">
          {messages.create.title}
        </h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          {messages.create.description}
        </p>
      </div>

      {/* Form Container */}
      <AdminCard
        title={messages.create.formTitle}
        description={messages.create.formDescription}
      >
        <ProductCreateForm locale={locale} messages={messages.create} errors={messages.errors} />
      </AdminCard>
    </div>
  );
}
