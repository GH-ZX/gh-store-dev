import { notFound } from "next/navigation";
import { FoundationHome } from "@/components/home/foundation-home";
import { isLocale, type Locale } from "@/i18n/config";
import { getCommonMessages } from "@/i18n/messages";

export default async function LocalePage({ params }: PageProps<"/[locale]">) {
  const { locale: rawLocale } = (await params) as { locale: string };

  if (!isLocale(rawLocale)) {
    notFound();
  }

  return <FoundationHome messages={getCommonMessages(rawLocale as Locale)} />;
}
