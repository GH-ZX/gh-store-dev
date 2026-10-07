import { runtimeVar } from "@server/runtime-env";
import { createSupabaseServiceClient } from "@server/lib/supabase/service";
import { logFailure, log } from "@server/lib/logging/logger";

export type EmailTemplateKind =
  | "order_delivered"
  | "order_failed"
  | "recharge_approved"
  | "password_reset";

export type SendEmailInput = {
  userId: string;
  kind: EmailTemplateKind;
  refId?: string;
  locale?: "ar" | "en";
  data?: Record<string, string | number | boolean | null | undefined>;
};

export type SendEmailResult =
  | { success: true; id?: string }
  | { success: false; reason: string; error?: unknown }
  | { skipped: true; reason: string };

function getSenderAddress(): string {
  return runtimeVar("EMAIL_FROM") || "GH Store <notifications@gh-store.me>";
}

function renderHtmlEmail({
  kind,
  locale = "ar",
  data = {},
}: {
  kind: EmailTemplateKind;
  locale: "ar" | "en";
  data: Record<string, unknown>;
}): { subject: string; html: string } {
  const isAr = locale === "ar";

  let subject = "";
  let headline = "";
  let bodyText = "";

  switch (kind) {
    case "order_delivered": {
      const orderNumber = String(data.orderNumber || data.order_number || "");
      subject = isAr
        ? `تم تسليم طلبك بنجاح #${orderNumber} — متجر GH`
        : `Your order #${orderNumber} has been delivered — GH Store`;
      headline = isAr ? "تم تسليم طلبك بنجاح!" : "Your order has been delivered!";
      bodyText = isAr
        ? `طلبك رقم #${orderNumber} أصبح جاهزاً ومكتملاً الآن. يمكنك مراجعة تفاصيل البطاقات أو الحساب داخل حسابك في المتجر.`
        : `Your order #${orderNumber} is now complete. You can view your purchase details and keys in your store account.`;
      break;
    }
    case "order_failed": {
      const orderNumber = String(data.orderNumber || data.order_number || "");
      subject = isAr
        ? `تحديث بخصوص طلبك #${orderNumber} — متجر GH`
        : `Update regarding order #${orderNumber} — GH Store`;
      headline = isAr ? "تعذر تسليم الطلب وتمت إعادة الرصيد" : "Order could not be fulfilled (Refunded)";
      bodyText = isAr
        ? `نعتذر عن الإزعاج، تعذر إتمام طلبك رقم #${orderNumber} وتمت إعادة قيمة الطلب كاملة إلى محفظتك في المتجر.`
        : `We apologize for the inconvenience. Order #${orderNumber} could not be fulfilled and the full amount has been refunded to your store wallet.`;
      break;
    }
    case "recharge_approved": {
      const amount = String(data.amount || "");
      subject = isAr
        ? `تم تأكيد وشحن محفظتك (${amount}$) — متجر GH`
        : `Wallet recharge confirmed (${amount}$) — GH Store`;
      headline = isAr ? "تم شحن المحفظة بنجاح!" : "Wallet recharge confirmed!";
      bodyText = isAr
        ? `تم تأكيد عملية الشحن وإيداع الرصيد في محفظتك بنجاح. يمكنك استخدامه الآن لشراء أي من منتجات المتجر.`
        : `Your recharge request was approved and the credit is now available in your wallet. You can use it right away across our store.`;
      break;
    }
    case "password_reset": {
      subject = isAr ? "إعادة تعيين كلمة المرور — متجر GH" : "Password Reset — GH Store";
      headline = isAr ? "طلب إعادة تعيين كلمة المرور" : "Reset your password";
      bodyText = isAr
        ? "تلقينا طلباً لإعادة تعيين كلمة المرور لحسابك. إذا كنت أنت من قام بالطلب، اضغط على الرابط في المتجر للمتابعة."
        : "We received a request to reset your password. If you requested this, click the link on the store to proceed.";
      break;
    }
  }

  const html = `<!DOCTYPE html>
<html lang="${isAr ? "ar" : "en"}" dir="${isAr ? "rtl" : "ltr"}">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f5f5f7; color: #1d1d1f; margin: 0; padding: 24px; }
    .container { max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e3e3e8; overflow: hidden; }
    .header { padding: 32px 32px 20px; text-align: center; border-bottom: 1px solid #f0f0f3; }
    .brand { font-size: 20px; font-weight: 700; letter-spacing: -0.5px; color: #1d1d1f; }
    .content { padding: 32px; }
    .headline { font-size: 18px; font-weight: 600; margin: 0 0 12px; color: #1d1d1f; }
    .body { font-size: 14px; line-height: 1.6; color: #424245; margin: 0 0 24px; }
    .footer { padding: 20px 32px; background: #fafafc; border-top: 1px solid #f0f0f3; font-size: 12px; color: #86868b; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">GH Store</div>
    </div>
    <div class="content">
      <h1 class="headline">${headline}</h1>
      <p class="body">${bodyText}</p>
    </div>
    <div class="footer">
      ${isAr ? "متجر GH للمنتجات الرقمية والاشتراكات" : "GH Store for Digital Goods & Subscriptions"}
    </div>
  </div>
</body>
</html>`;

  return { subject, html };
}

/**
 * Sends a transactional email using the Resend HTTP API.
 * Idempotent: uses the email_log table to prevent duplicate delivery of the same event.
 * Fails safely and gracefully degrades if Resend API key is unconfigured.
 */
export async function sendTransactionalEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = runtimeVar("RESEND_API_KEY");
  if (!apiKey) {
    return { skipped: true, reason: "resend_api_key_not_configured" };
  }

  const service = createSupabaseServiceClient();
  if (!service) {
    return { skipped: true, reason: "service_role_unavailable" };
  }

  try {
    const client = service as any;
    // Check user profile for email and email preferences
    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("email, email_notifications")
      .eq("id", input.userId)
      .maybeSingle();

    if (profileError || !profile?.email) {
      return { skipped: true, reason: "user_email_not_found" };
    }

    if (profile.email_notifications === false) {
      return { skipped: true, reason: "user_opted_out" };
    }

    // Check idempotency if refId is provided
    if (input.refId) {
      const { data: existing } = await client
        .from("email_log")
        .select("id")
        .eq("user_id", input.userId)
        .eq("kind", input.kind)
        .eq("ref_id", input.refId)
        .eq("status", "sent")
        .maybeSingle();

      if (existing) {
        return { skipped: true, reason: "already_sent" };
      }
    }

    const { subject, html } = renderHtmlEmail({
      kind: input.kind,
      locale: input.locale || "ar",
      data: input.data || {},
    });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: getSenderAddress(),
        to: [profile.email],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      await client.from("email_log").insert({
        user_id: input.userId,
        email: profile.email,
        kind: input.kind,
        ref_id: input.refId ?? null,
        status: "failed",
        error_message: errorText.slice(0, 500),
      });

      logFailure("email", "resend_api_error", new Error(errorText), {
        userId: input.userId,
        kind: input.kind,
        status: res.status,
      });

      return { success: false, reason: "api_error", error: errorText };
    }

    const responseData = (await res.json().catch(() => ({}))) as { id?: string };

    await client.from("email_log").insert({
      user_id: input.userId,
      email: profile.email,
      kind: input.kind,
      ref_id: input.refId ?? null,
      status: "sent",
    });

    log.info("email", "email_sent", {
      userId: input.userId,
      kind: input.kind,
      refId: input.refId,
      emailId: responseData.id,
    });

    return { success: true, id: responseData.id };
  } catch (error) {
    logFailure("email", "send_transactional_email_threw", error, {
      userId: input.userId,
      kind: input.kind,
    });
    return { success: false, reason: "exception", error };
  }
}
