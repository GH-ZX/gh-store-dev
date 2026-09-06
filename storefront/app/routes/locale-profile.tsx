import {
  data,
  Form,
  Link,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { z } from "zod";
import { getMessages } from "@/i18n/messages";
import { accountContext } from "@server/account";
import { sessionCookieHeaders } from "@server/session";
import {
  getMyProfile,
  updateMyProfile,
  UsernameTakenError,
} from "@server/lib/services/profile.service";
import {
  getMyTelegramLink,
  mintTelegramLinkCode,
  unlinkMyTelegram,
} from "@server/lib/services/telegram-link.service";
import { getMyWallet } from "@server/lib/services/wallet.service";
import { strongPasswordSchema } from "@server/lib/auth/password-policy";
import {
  AccountHeading,
  AccountNavigation,
  AccountCard,
  AccountResult,
  SubmitButton,
  accountField,
  accountSecondary,
} from "@/components/account-ui";
import { AccountTelegram } from "@/components/account-telegram";
export async function loader(args: LoaderFunctionArgs) {
  const { supabase, locale, userId, jar, isProduction } =
    await accountContext(args);
  const [profile, link] = await Promise.all([
    getMyProfile(supabase),
    getMyTelegramLink(supabase),
  ]);
  const wallet =
    profile?.isActive && profile.role !== "admin"
      ? await getMyWallet(supabase, userId)
      : null;
  return data(
    { locale, profile, link, wallet },
    { headers: sessionCookieHeaders(jar, isProduction) },
  );
}
export async function action(args: ActionFunctionArgs) {
  const { supabase, jar, isProduction } = await accountContext(args);
  const form = await args.request.formData();
  const intent = String(form.get("intent") ?? "profile");
  const finish = (
    error: string | null,
    notice: string | null = null,
    code: string | null = null,
    expiresAt: string | null = null,
  ) =>
    data(
      { error, notice, code, expiresAt },
      {
        status: error ? 400 : 200,
        headers: sessionCookieHeaders(jar, isProduction),
      },
    );
  const profile = await getMyProfile(supabase);
  if (!profile?.isActive) return finish("not_signed_in");
  try {
    if (intent === "telegram-link") {
      const code = await mintTelegramLinkCode(supabase);
      return finish(null, null, code.code, code.expiresAt);
    }
    if (intent === "telegram-unlink") {
      await unlinkMyTelegram(supabase);
      return finish(null, "unlinked");
    }
    if (intent === "password") {
      const password = String(form.get("password") ?? "");
      if (!strongPasswordSchema.safeParse(password).success)
        return finish("weak_password");
      if (password !== form.get("confirmPassword")) return finish("mismatch");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return finish("unknown");
      await supabase.auth.signOut({ scope: "others" });
      return finish(null, "password_saved");
    }
    if (intent !== "profile") return finish("invalid_input");
    const parsed = z
      .object({
        fullName: z.string().trim().max(120),
        username: z.union([
          z.literal(""),
          z
            .string()
            .trim()
            .min(3)
            .max(32)
            .regex(/^[a-z0-9_]+$/i),
        ]),
      })
      .safeParse({
        fullName: String(form.get("fullName") ?? ""),
        username: String(form.get("username") ?? "").trim(),
      });
    if (!parsed.success) return finish("invalid_input");
    await updateMyProfile(supabase, {
      fullName: parsed.data.fullName || null,
      username: parsed.data.username || null,
    });
    return finish(null, "profile_saved");
  } catch (error) {
    return finish(
      error instanceof UsernameTakenError ? "username_taken" : "unknown",
    );
  }
}
export const meta = () => [{ name: "robots", content: "noindex, nofollow" }];
export default function Profile() {
  const { locale, profile, link, wallet } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const messages = getMessages(locale, "account"),
    common = getMessages(locale, "common");
  if (!profile) return <p role="alert">{common.states.errorDescription}</p>;
  if (!profile.isActive)
    return (
      <section className="sf-account-page">
        <AccountHeading
          title={messages.banned.title}
          description={messages.banned.description}
        />
        <Link to={`/${locale}/contact`}>{common.links.contact}</Link>
      </section>
    );
  const notice =
    result?.notice === "profile_saved"
      ? messages.profile.saved
      : result?.notice === "password_saved"
        ? messages.password.saved
        : result?.notice === "unlinked"
          ? messages.telegram.unlinked
          : null;
  return (
    <section className="sf-account-page">
      <AccountHeading
        eyebrow={messages.eyebrow}
        title={messages.title}
        description={messages.description}
      />
      <AccountNavigation locale={locale} messages={messages} />
      <div className="mb-5">
        <AccountResult
          messages={messages}
          error={result?.error}
          notice={notice}
        />
      </div>
      <div className="sf-account-profile-grid">
        <div className="grid gap-6">
          <AccountCard
            title={messages.profile.title}
            description={messages.profile.description}
          >
            <Form method="post" className="grid gap-4">
              <input type="hidden" name="intent" value="profile" />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm">
                  {messages.profile.fullName}
                  <input
                    className={accountField}
                    name="fullName"
                    defaultValue={profile.fullName ?? ""}
                    maxLength={120}
                    autoComplete="name"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  {messages.profile.username}
                  <input
                    className={accountField}
                    name="username"
                    defaultValue={profile.username ?? ""}
                    minLength={3}
                    maxLength={32}
                    pattern="[A-Za-z0-9_]+"
                    autoComplete="username"
                    dir="ltr"
                  />
                  <span className="text-xs text-[var(--ink-muted)]">
                    {messages.profile.usernameHint}
                  </span>
                </label>
              </div>
              <label className="grid gap-2 text-sm">
                {messages.profile.email}
                <input
                  className={accountField}
                  value={profile.email ?? ""}
                  readOnly
                  disabled
                  dir="ltr"
                />
                <span className="text-xs text-[var(--ink-muted)]">
                  {messages.profile.emailHint}
                </span>
              </label>
              <SubmitButton>{messages.profile.saveAction}</SubmitButton>
            </Form>
          </AccountCard>
          <AccountCard
            title={messages.password.title}
            description={messages.password.description}
          >
            <Form method="post" className="grid gap-4">
              <input type="hidden" name="intent" value="password" />
              <label className="grid gap-2 text-sm">
                {messages.password.newPassword}
                <input
                  className={accountField}
                  type="password"
                  name="password"
                  minLength={8}
                  maxLength={128}
                  required
                  autoComplete="new-password"
                  dir="ltr"
                />
                <span className="text-xs text-[var(--ink-muted)]">
                  {messages.password.hint}
                </span>
              </label>
              <label className="grid gap-2 text-sm">
                {messages.password.confirmPassword}
                <input
                  className={accountField}
                  type="password"
                  name="confirmPassword"
                  minLength={8}
                  maxLength={128}
                  required
                  autoComplete="new-password"
                  dir="ltr"
                />
              </label>
              <SubmitButton>{messages.password.saveAction}</SubmitButton>
            </Form>
          </AccountCard>
        </div>
        <div className="grid content-start gap-6">
          {wallet ? (
            <AccountCard title={messages.wallet.title}>
              <p className="text-sm text-[var(--ink-muted)]">
                {messages.wallet.balanceLabel}
              </p>
              <p className="mt-2 text-3xl font-bold">
                <bdi dir="ltr">
                  {new Intl.NumberFormat(locale, {
                    style: "currency",
                    currency: wallet.currency,
                  }).format(wallet.balance)}
                </bdi>
              </p>
              <div className="mt-5 grid gap-2">
                <Link className={accountSecondary} to={`/${locale}/wallet`}>
                  {messages.wallet.historyTitle}
                </Link>
                <Link className={accountSecondary} to={`/${locale}/recharge`}>
                  {messages.wallet.rechargeAction}
                </Link>
              </div>
            </AccountCard>
          ) : null}
          <AccountTelegram
            messages={messages}
            link={link}
            code={result?.code}
            expiresAt={result?.expiresAt}
          />
          <AccountCard
            title={messages.orders.title}
            description={messages.orders.description}
          >
            <Link className={accountSecondary} to={`/${locale}/orders`}>
              {messages.orders.title}
            </Link>
          </AccountCard>
        </div>
      </div>
    </section>
  );
}
