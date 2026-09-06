import {
  data,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { getMessages } from "@/i18n/messages";
import { accountContext } from "@server/account";
import { sessionCookieHeaders } from "@server/session";
import {
  getMyTelegramLink,
  mintTelegramConnectCode,
  unlinkMyTelegram,
} from "@server/lib/services/telegram-link.service";
import { getPublicStoreSettings } from "@server/lib/services/settings.service";
import {
  AccountHeading,
  AccountNavigation,
  AccountResult,
} from "@/components/account-ui";
import { AccountTelegram } from "@/components/account-telegram";
export async function loader(args: LoaderFunctionArgs) {
  const { supabase, locale, jar, isProduction } = await accountContext(args);
  const [link, settings] = await Promise.all([
    getMyTelegramLink(supabase),
    getPublicStoreSettings(supabase),
  ]);
  const raw = settings.telegramBotUsername?.replace(/^@/, "") ?? "";
  const botUrl = /^[a-z0-9_]{5,32}$/i.test(raw) ? `https://t.me/${raw}` : null;
  return data(
    { locale, link, botUrl },
    { headers: sessionCookieHeaders(jar, isProduction) },
  );
}
export async function action(args: ActionFunctionArgs) {
  const { supabase, jar, isProduction } = await accountContext(args);
  const form = await args.request.formData();
  const finish = (
    error: string | null,
    unlinked = false,
    code: string | null = null,
    expiresAt: string | null = null,
  ) =>
    data(
      { error, unlinked, code, expiresAt },
      {
        status: error ? 400 : 200,
        headers: sessionCookieHeaders(jar, isProduction),
      },
    );
  try {
    if (form.get("intent") === "telegram-unlink") {
      await unlinkMyTelegram(supabase);
      return finish(null, true);
    }
    if (form.get("intent") !== "telegram-connect")
      return finish("invalid_input");
    const { code, expiresAt } = await mintTelegramConnectCode(supabase);
    return finish(null, false, code, expiresAt);
  } catch {
    return finish("unknown");
  }
}
export const meta = () => [{ name: "robots", content: "noindex, nofollow" }];
export default function TelegramConnect() {
  const { locale, link, botUrl } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const messages = getMessages(locale, "account");
  return (
    <section className="sf-account-page">
      <AccountHeading
        eyebrow={messages.telegramConnect.eyebrow}
        title={messages.telegramConnect.title}
        description={messages.telegramConnect.description}
      />
      <AccountNavigation locale={locale} messages={messages} />
      <div className="mb-5">
        <AccountResult
          messages={messages}
          error={result?.error}
          notice={result?.unlinked ? messages.telegramConnect.unlinked : null}
        />
      </div>
      <div className="sf-account-connect-panel">
        <AccountTelegram
          messages={messages}
          link={link}
          code={result?.code}
          expiresAt={result?.expiresAt}
          connect
          botUrl={botUrl}
        />
      </div>
    </section>
  );
}
