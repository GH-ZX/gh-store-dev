import { Link } from "react-router";
import { AdminCard } from "@/components/admin/admin-form";
import { ProductCreateForm } from "@/components/admin/product-create-form";
import { ChevronIcon } from "@/components/ui/icons";
import { SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";


/**
 * A product that no supplier carries.
 *
 * Its own page rather than a panel on the list: creating is not something an
 * operator does while scanning a catalog, and a form permanently occupying the
 * top of the list would be in the way of the thing they came for.
 */

import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { isLocale } from "@/i18n/config";
function requireLocale(value: string | undefined) { if (!value || !isLocale(value)) throw new Response("Not Found", { status: 404 }); return value; }
import { requireDashboardAdmin } from "@server/dashboard-access";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const locale = requireLocale(params.locale);
  await requireDashboardAdmin(request, locale);

  return { locale };
}

export default function Page() {
 const { locale } = useLoaderData<typeof loader>();
const messages = getMessages(locale, "admin").catalog;
  return (
    <div className="grid gap-8">
      <div>
        <Link
          to={`/${locale}/dashboard/catalog`}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
        >
          <ChevronIcon direction="start" className="size-4 rtl:rotate-180" />
          {messages.backToCatalog}
        </Link>

        <SectionHeader
          as="h1"
          eyebrow={messages.eyebrow}
          title={messages.create.title}
          subtitle={messages.create.description}
          className="mt-5"
        />
      </div>

      <AdminCard title={messages.create.formTitle} description={messages.create.formDescription}>
        <ProductCreateForm locale={locale} messages={messages.create} errors={messages.errors} />
      </AdminCard>
    </div>
  );
}
