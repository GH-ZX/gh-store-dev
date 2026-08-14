import "server-only";

import { requireAdmin, requireAuth } from "@/lib/auth/guards";
import { logOutcome } from "@/lib/logging/logger";
import { PAGE_SIZE, pageRange } from "@/lib/paging";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SupportStatus } from "@/lib/support/status";

/**
 * Customer support threads.
 *
 * The tables have existed since the orders and operations migration and nothing
 * has ever written to them; this is the code that makes them real. The database
 * already holds the rules that matter — a customer reads and writes only their
 * own thread, cannot post as the store, and has no update policy at all, so a
 * thread's status is moved by the reply trigger or by an admin and never by the
 * person who raised it.
 *
 * That means this module deliberately does not re-check ownership before a read.
 * Repeating a rule in application code is how the two drift apart, and the copy
 * that runs second is the one that gets forgotten. Every query here uses the
 * caller's own session, so RLS is the authority.
 */

export type SupportThread = {
  id: string;
  subject: string;
  status: string;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
};

export type SupportMessage = {
  id: string;
  senderRole: string;
  body: string;
  createdAt: string;
};

/** A thread with a customer attached, which is what the owner's queue shows. */
export type SupportQueueThread = SupportThread & {
  customer: { id: string; name: string | null; email: string | null };
};

export type SupportThreadsResult =
  | { ok: true; threads: SupportThread[]; total: number }
  | { ok: false };

export type SupportQueueResult =
  | { ok: true; threads: SupportQueueThread[]; total: number }
  | { ok: false };

export type SupportConversationResult =
  | { ok: true; thread: SupportThread; messages: SupportMessage[] }
  | { ok: false; reason: "not_found" | "unknown" };

export type OpenThreadResult =
  | { ok: true; threadId: string }
  | { ok: false; reason: "invalid_input" | "too_many" | "unknown" };

export type ReplyResult =
  | { ok: true }
  | { ok: false; reason: "invalid_input" | "not_found" | "closed" | "unknown" };

export type SetStatusResult = { ok: true } | { ok: false; reason: "not_found" | "unknown" };

const SUBJECT_MAX = 200;
const BODY_MAX = 4000;

/** How many threads one customer may have open before they are asked to wait. */
const OPEN_THREAD_LIMIT = 5;

const THREAD_COLUMNS = "id, subject, status, message_count, last_message_at, created_at";

type ThreadRow = {
  id: string;
  subject: string;
  status: string;
  message_count: number;
  last_message_at: string | null;
  created_at: string;
};

function toThread(row: ThreadRow): SupportThread {
  return {
    id: row.id,
    subject: row.subject,
    status: row.status,
    messageCount: row.message_count,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
  };
}

/**
 * Open a thread with its first message.
 *
 * Two writes rather than an RPC, and the order matters: the thread is created
 * first because the message's own insert policy checks that the thread exists
 * and belongs to the caller. If the message fails the thread is removed again,
 * so a customer never lands on an empty conversation they cannot add to.
 */
export async function openSupportThread(input: {
  subject: string;
  body: string;
}): Promise<OpenThreadResult> {
  const result = await attemptOpenThread(input);

  logOutcome("support", "thread_opened", result, {
    ...(result.ok ? { threadId: result.threadId } : {}),
  });

  return result;
}

async function attemptOpenThread(input: {
  subject: string;
  body: string;
}): Promise<OpenThreadResult> {
  const user = await requireAuth();

  const subject = input.subject.trim();
  const body = input.body.trim();

  if (subject.length === 0 || subject.length > SUBJECT_MAX) {
    return { ok: false, reason: "invalid_input" };
  }

  if (body.length === 0 || body.length > BODY_MAX) {
    return { ok: false, reason: "invalid_input" };
  }

  const supabase = await createSupabaseServerClient();

  /*
   * Rate limit by open threads rather than by time. Someone with a real problem
   * may well write twice in a minute; someone with five unanswered threads is
   * making the queue worse for themselves.
   */
  const { count } = await supabase
    .from("support_threads")
    .select("id", { count: "exact", head: true })
    .in("status", ["open", "pending"]);

  if ((count ?? 0) >= OPEN_THREAD_LIMIT) {
    return { ok: false, reason: "too_many" };
  }

  const { data: thread, error: threadError } = await supabase
    .from("support_threads")
    .insert({ user_id: user.id, subject, status: "open" })
    .select("id")
    .maybeSingle();

  if (threadError || !thread) {
    return { ok: false, reason: "unknown" };
  }

  const { error: messageError } = await supabase.from("support_messages").insert({
    thread_id: thread.id,
    sender_id: user.id,
    sender_role: "customer",
    body,
  });

  if (messageError) {
    // Roll back by hand: an empty thread is worse than no thread, because the
    // customer sees a ticket they believe was sent.
    await supabase.from("support_threads").delete().eq("id", thread.id);

    return { ok: false, reason: "unknown" };
  }

  return { ok: true, threadId: thread.id };
}

/** A customer's own threads, newest activity first. */
export async function getMySupportThreads(): Promise<SupportThreadsResult> {
  await requireAuth();

  const supabase = await createSupabaseServerClient();
  const { data, error, count } = await supabase
    .from("support_threads")
    .select(THREAD_COLUMNS, { count: "exact" })
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    // Not an empty list: "you have no tickets" and "we could not read your
    // tickets" look identical on screen and mean opposite things.
    return { ok: false };
  }

  const threads = (data ?? []).map(toThread);

  return { ok: true, threads, total: count ?? threads.length };
}

/**
 * One conversation.
 *
 * Shared by the customer's page and the dashboard. Neither passes a user id:
 * RLS decides what the caller can see, so an admin gets any thread and a
 * customer gets only their own from the identical query.
 */
export async function getSupportConversation(threadId: string): Promise<SupportConversationResult> {
  await requireAuth();

  const supabase = await createSupabaseServerClient();
  const { data: thread, error: threadError } = await supabase
    .from("support_threads")
    .select(THREAD_COLUMNS)
    .eq("id", threadId)
    .maybeSingle();

  if (threadError) {
    return { ok: false, reason: "unknown" };
  }

  if (!thread) {
    // Also what a customer asking for someone else's thread gets: RLS filters it
    // out, and "not found" is the right thing to say rather than "not yours".
    return { ok: false, reason: "not_found" };
  }

  const { data: messages, error: messageError } = await supabase
    .from("support_messages")
    .select("id, sender_role, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (messageError) {
    return { ok: false, reason: "unknown" };
  }

  return {
    ok: true,
    thread: toThread(thread),
    messages: (messages ?? []).map((message) => ({
      id: message.id,
      senderRole: message.sender_role,
      body: message.body,
      createdAt: message.created_at,
    })),
  };
}

/**
 * Add a message to a thread.
 *
 * `role` is not a parameter a caller chooses freely — an admin reply goes
 * through {@link replyAsAdmin}, which checks admin first. A customer's insert
 * policy pins `sender_role` to 'customer' regardless of what is sent, so the
 * worst a crafted call can do is fail.
 */
export async function replyToThread(input: { threadId: string; body: string }): Promise<ReplyResult> {
  const result = await attemptReply(input, "customer");

  logOutcome("support", "thread_replied", result, { threadId: input.threadId, role: "customer" });

  return result;
}

export async function replyAsAdmin(input: { threadId: string; body: string }): Promise<ReplyResult> {
  await requireAdmin();

  const result = await attemptReply(input, "admin");

  logOutcome("support", "thread_replied", result, { threadId: input.threadId, role: "admin" });

  return result;
}

async function attemptReply(
  input: { threadId: string; body: string },
  role: "customer" | "admin",
): Promise<ReplyResult> {
  const user = await requireAuth();
  const body = input.body.trim();

  if (body.length === 0 || body.length > BODY_MAX) {
    return { ok: false, reason: "invalid_input" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: thread } = await supabase
    .from("support_threads")
    .select("id, status")
    .eq("id", input.threadId)
    .maybeSingle();

  if (!thread) {
    return { ok: false, reason: "not_found" };
  }

  /*
   * Checked here as well as being obvious in the UI, because a closed thread's
   * reply box is disabled rather than absent and a stale page could still post.
   * An admin may write to a closed thread; that is how it gets reopened.
   */
  if (thread.status === "closed" && role === "customer") {
    return { ok: false, reason: "closed" };
  }

  const { error } = await supabase.from("support_messages").insert({
    thread_id: input.threadId,
    sender_id: user.id,
    sender_role: role,
    body,
  });

  return error ? { ok: false, reason: "unknown" } : { ok: true };
}

/** The owner's queue: every thread at a status, most recently active first. */
export async function getSupportQueue(options: {
  status?: SupportStatus | "all";
  page?: number;
}): Promise<SupportQueueResult> {
  await requireAdmin();

  const { from, to } = pageRange(options.page ?? 1, PAGE_SIZE);

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("support_threads")
    .select(
      `${THREAD_COLUMNS}, profiles!support_threads_user_id_fkey (id, email, full_name, username)`,
      { count: "exact" },
    )
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (options.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }

  const { data, error, count } = await query;

  if (error) {
    return { ok: false };
  }

  const threads = (data ?? []).map((row) => {
    const profile = (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles) as {
      id: string;
      email: string | null;
      full_name: string | null;
      username: string | null;
    } | null;

    return {
      ...toThread(row),
      customer: {
        id: profile?.id ?? "",
        name: profile?.full_name ?? profile?.username ?? null,
        email: profile?.email ?? null,
      },
    };
  });

  return { ok: true, threads, total: count ?? threads.length };
}

/**
 * Move a thread's status by hand.
 *
 * Admin only — and not merely by convention: `support_threads` has no customer
 * update policy at all, so this would fail for anyone else even without the
 * guard above.
 */
export async function setThreadStatus(input: {
  threadId: string;
  status: SupportStatus;
}): Promise<SetStatusResult> {
  await requireAdmin();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("support_threads")
    .update({ status: input.status })
    .eq("id", input.threadId)
    .select("id")
    .maybeSingle();

  const result: SetStatusResult = error
    ? { ok: false, reason: "unknown" }
    : data
      ? { ok: true }
      : { ok: false, reason: "not_found" };

  logOutcome("support", "thread_status_set", result, {
    threadId: input.threadId,
    status: input.status,
  });

  return result;
}
