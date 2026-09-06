import {
  data,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from "react-router";
import { z } from "zod";
import { isLocale } from "@/i18n/config";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import {
  createSessionClient,
  getSessionUserId,
  redirectToLogin,
  sessionCookieHeaders,
  withSessionCookies,
} from "./session";
import { ForbiddenError, requireAdminId } from "./lib/auth/guards";
import { getOrders, getOrderDetail } from "./lib/services/admin-orders.service";
import {
  getRechargeQueues,
  approveRecharge,
  rejectRecharge,
  saveRechargeSettings,
} from "./lib/services/admin-recharge.service";
import { getPayments } from "./lib/services/admin-payments.service";
import {
  listAdminCustomers,
  getAdminCustomer,
  adjustCustomerBalance,
  setCustomerRole,
  setCustomerActive,
  sendCustomerMessage,
} from "./lib/services/admin-customers.service";
import {
  retryFulfillment,
  markDelivered,
  refundOrderManually,
  resendDeliveryNotification,
} from "./lib/services/admin-order-ops.service";
import {
  getReviewsForModeration,
  moderateReview,
} from "./lib/services/reviews.service";
import {
  getSupportQueue,
  getSupportConversation,
  replyAsAdmin,
  setThreadStatus,
} from "./lib/services/support.service";
import { getAuditLog, recordAudit } from "./lib/services/admin-audit.service";
import { getAppEvents } from "./lib/logging/axiom-query";
import { notify } from "./lib/services/notification.service";
import { enqueueTelegramAlert } from "./lib/services/telegram-alerts.service";
import {
  reconcileStuckOrders,
  getLastReconcileRun,
} from "./lib/services/reconciliation.service";
import { rechargeMethodsInputSchema } from "./lib/settings/recharge-settings";
import { createSupabaseServiceClient } from "./lib/supabase/service";

async function access(args: LoaderFunctionArgs | ActionFunctionArgs) {
  const locale = args.params.locale;
  if (!locale || !isLocale(locale))
    throw new Response("Not Found", { status: 404 });
  const { env } = getCloudflareContext(args.context);
  const session = createSessionClient(args.request, env);
  const userId = await getSessionUserId(session.supabase);
  if (!userId)
    throw withSessionCookies(
      redirectToLogin(args.request, locale, new URL(args.request.url).pathname),
      session.jar,
      session.isProduction,
    );
  const admin = await requireAdminId(session.supabase).catch((error) => {
    if (error instanceof ForbiddenError)
      throw withSessionCookies(
        new Response("Forbidden", { status: 403 }),
        session.jar,
        session.isProduction,
      );
    throw error;
  });
  return { ...session, locale, admin };
}

export async function loadDashboardOperations(args: LoaderFunctionArgs) {
  const session = await access(args);
  const { supabase, locale } = session;
  const url = new URL(args.request.url);
  const section =
    url.pathname.split("/dashboard/")[1]?.split("/")[0] ?? "orders";
  const q = url.searchParams.get("q") ?? "";
  const status = url.searchParams.get("status") ?? "all";
  const page = Math.min(
    10000,
    Math.max(1, Number(url.searchParams.get("page")) || 1),
  );
  const base = { locale, section, q, status, page };
  let result;
  if (section === "orders" && args.params.orderId) {
    const order = await getOrderDetail(supabase, args.params.orderId);
    if (!order) throw new Response("Not Found", { status: 404 });
    result = { ...base, kind: "order" as const, order };
  } else if (section === "orders") {
    result = {
      ...base,
      kind: "orders" as const,
      orders: await getOrders(supabase, { search: q, status }),
      lastRun: await getLastReconcileRun(supabase),
    };
  } else if (section === "recharges") {
    result = {
      ...base,
      kind: "recharges" as const,
      queues: await getRechargeQueues(supabase),
    };
  } else if (section === "payments") {
    result = {
      ...base,
      kind: "payments" as const,
      payments: await getPayments(supabase, {
        attentionOnly: status === "attention",
      }),
    };
  } else if (section === "customers" && args.params.userId) {
    const detail = await getAdminCustomer(supabase, args.params.userId);
    if (!detail) throw new Response("Not Found", { status: 404 });
    result = {
      ...base,
      kind: "customer" as const,
      detail,
      idempotencyKey: crypto.randomUUID(),
    };
  } else if (section === "customers") {
    result = {
      ...base,
      kind: "customers" as const,
      customers: await listAdminCustomers(supabase, { query: q }),
    };
  } else if (section === "reviews") {
    const filter = z
      .enum(["all", "pending", "approved", "rejected"])
      .catch("all")
      .parse(status);
    const reviews = await getReviewsForModeration(supabase, {
      status: filter,
      page,
    });
    if (!reviews.ok)
      throw new Response("Unable to load reviews", { status: 503 });
    result = { ...base, kind: "reviews" as const, reviews };
  } else if (section === "support") {
    const filter = z
      .enum(["all", "open", "pending", "resolved", "closed"])
      .catch("all")
      .parse(status);
    const [queue, conversation] = await Promise.all([
      getSupportQueue(supabase, { status: filter, page }),
      url.searchParams.get("thread")
        ? getSupportConversation(
            supabase,
            z
              .uuid()
              .catch("00000000-0000-0000-0000-000000000000")
              .parse(url.searchParams.get("thread")),
          )
        : Promise.resolve(null),
    ]);
    if (!queue.ok)
      throw new Response("Unable to load support requests", { status: 503 });
    result = { ...base, kind: "support" as const, queue, conversation };
  } else if (section === "logs") {
    const view = url.searchParams.get("view") ?? "events";
    const level = z
      .enum(["problems", "error", "all"])
      .catch("problems")
      .parse(url.searchParams.get("level"));
    if (view === "actions")
      result = {
        ...base,
        kind: "logs" as const,
        view,
        audit: await getAuditLog(supabase, { page }),
      };
    else if (view === "syncs") {
      const {
        data: rows,
        error,
        count,
      } = await supabase
        .from("provider_sync_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range((page - 1) * 20, page * 20 - 1);
      if (error)
        throw new Response("Unable to load sync logs", { status: 503 });
      result = {
        ...base,
        kind: "logs" as const,
        view,
        syncs: rows ?? [],
        total: count ?? 0,
      };
    } else
      result = {
        ...base,
        kind: "logs" as const,
        view: "events",
        level,
        events: await getAppEvents({ page, level }),
      };
  } else throw new Response("Not Found", { status: 404 });
  return data(result, {
    headers: sessionCookieHeaders(session.jar, session.isProduction),
  });
}

export async function actDashboardOperations(args: ActionFunctionArgs) {
  const session = await access(args);
  const { supabase, admin } = session;
  const form = await args.request.formData();
  const text = (key: string) => String(form.get(key) ?? "").trim();
  const id = (key: string) => z.uuid().parse(text(key));
  const note = () => z.string().min(1).max(2000).parse(text("note"));
  const intent = text("intent");
  let detail: string | null = null;
  try {
    switch (intent) {
      case "retry": {
        const result = await retryFulfillment(supabase, id("orderId"));
        detail = `${result.state}${result.reason ? `: ${result.reason}` : ""}`;
        break;
      }
      case "deliver":
        await markDelivered(
          supabase,
          id("orderId"),
          note(),
          z.string().max(20000).parse(text("deliveredPayload")),
        );
        break;
      case "refund":
        await refundOrderManually(supabase, id("orderId"), note());
        break;
      case "resend":
        await resendDeliveryNotification(supabase, id("orderId"));
        break;
      case "reconcile":
        await reconcileStuckOrders(createSupabaseServiceClient());
        break;
      case "approve": {
        const creditAmount = text("creditAmount")
          ? z.coerce
              .number()
              .positive()
              .max(1000000)
              .parse(text("creditAmount"))
          : null;
        await approveRecharge(supabase, {
          requestId: id("requestId"),
          creditAmount,
          note: text("note") || null,
        });
        break;
      }
      case "reject":
        await rejectRecharge(supabase, {
          requestId: id("requestId"),
          note: note(),
        });
        break;
      case "recharge-settings": {
        const minAmount = z.coerce.number().positive().parse(text("minAmount"));
        const maxAmount = z.coerce
          .number()
          .min(minAmount)
          .max(100000)
          .parse(text("maxAmount"));
        const count = z.coerce
          .number()
          .int()
          .min(0)
          .max(21)
          .parse(text("methodCount"));
        const methods = rechargeMethodsInputSchema.parse(
          Array.from({ length: count }, (_, index) => ({
            id: text(`method.${index}.id`),
            label_ar: text(`method.${index}.label_ar`),
            label_en: text(`method.${index}.label_en`),
            account: text(`method.${index}.account`),
            instructions_ar: text(`method.${index}.instructions_ar`),
            instructions_en: text(`method.${index}.instructions_en`),
            enabled: text(`method.${index}.enabled`) === "on",
            remove: text(`method.${index}.remove`) === "on",
          })).filter((method) => method.id && !method.remove),
        );
        await saveRechargeSettings(supabase, { minAmount, maxAmount, methods });
        break;
      }
      case "adjust":
        await adjustCustomerBalance(supabase, {
          userId: id("userId"),
          amount: z.coerce
            .number()
            .finite()
            .refine((v) => v !== 0)
            .parse(text("amount")),
          description: note(),
          idempotencyKey: id("idempotencyKey"),
        });
        break;
      case "role":
        await setCustomerRole(
          supabase,
          id("userId"),
          z.enum(["admin", "customer"]).parse(text("role")),
        );
        break;
      case "active":
        await setCustomerActive(
          supabase,
          id("userId"),
          z.enum(["true", "false"]).parse(text("active")) === "true",
        );
        break;
      case "message": {
        const result = await sendCustomerMessage(supabase, {
          userId: id("userId"),
          title: z.string().min(1).max(120).parse(text("title")),
          body: z.string().min(1).max(1000).parse(text("body")),
        });
        if (!result.ok) throw new Error(result.reason);
        break;
      }
      case "moderate": {
        const reviewId = id("reviewId");
        const status = z
          .enum(["pending", "approved", "rejected"])
          .parse(text("status"));
        const isFeatured = text("featured") === "on";
        const result = await moderateReview(supabase, {
          reviewId,
          status,
          isFeatured,
          adminNote: z.string().max(500).parse(text("note")),
        });
        if (!result.ok) throw new Error(result.reason);
        await recordAudit({
          actorId: admin.id,
          action: "review.moderate",
          entityType: "review",
          entityId: reviewId,
          values: { status, isFeatured },
        });
        break;
      }
      case "reply": {
        const threadId = id("threadId");
        const body = z.string().min(1).max(4000).parse(text("body"));
        const result = await replyAsAdmin(supabase, { threadId, body });
        if (!result.ok) throw new Error(result.reason);
        await recordAudit({
          actorId: admin.id,
          action: "support.reply",
          entityType: "support_thread",
          entityId: threadId,
          values: { length: body.length },
        });
        const { data: thread } = await supabase
          .from("support_threads")
          .select("user_id")
          .eq("id", threadId)
          .maybeSingle();
        if (thread) {
          await notify({
            userId: thread.user_id,
            type: "support_reply",
            titleAr: "وصلك رد على طلب الدعم",
            titleEn: "We replied to your request",
            bodyAr: "افتح صفحة الدعم لقراءة الرد.",
            bodyEn: "Open the support page to read our reply.",
            href: `/support?thread=${threadId}`,
            entityType: "support_thread",
            entityId: threadId,
          });
          await enqueueTelegramAlert({
            type: "support_reply",
            userId: thread.user_id,
            payload: { thread_id: threadId, reply: body.slice(0, 400) },
          });
        }
        break;
      }
      case "thread-status": {
        const threadId = id("threadId");
        const status = z
          .enum(["open", "pending", "resolved", "closed"])
          .parse(text("status"));
        const before = await getSupportConversation(supabase, threadId);
        const result = await setThreadStatus(supabase, { threadId, status });
        if (!result.ok) throw new Error(result.reason);
        await recordAudit({
          actorId: admin.id,
          action: "support.set_status",
          entityType: "support_thread",
          entityId: threadId,
          values: { from: before.ok ? before.thread.status : null, to: status },
        });
        break;
      }
      default:
        throw new Error("Invalid operation");
    }
    return data(
      { ok: true, error: null, detail },
      { headers: sessionCookieHeaders(session.jar, session.isProduction) },
    );
  } catch (error) {
    return data(
      {
        ok: false,
        detail: null,
        error:
          error instanceof z.ZodError || error instanceof SyntaxError
            ? "Please check the form fields."
            : error instanceof Error
              ? error.message
              : "The operation failed. Please try again.",
      },
      {
        status: 400,
        headers: sessionCookieHeaders(session.jar, session.isProduction),
      },
    );
  }
}
