import "server-only";

import { requireAdmin } from "@/lib/auth/guards";
import { logFailure } from "@/lib/logging/logger";
import { PAGE_SIZE, pageRange } from "@/lib/paging";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/types/database";

/**
 * What administrators have done.
 *
 * `audit_logs` has been written since the first hand-made order change and read
 * by nothing, which makes it a record nobody could consult. Every entry names an
 * actor, so the point of showing it is accountability: a delivery marked
 * complete by hand, a balance corrected, an administrator promoted, all with a
 * name and a time against them.
 */

export type AuditEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  actor: { id: string | null; name: string | null; email: string | null };
  values: Json;
};

type ProfileEmbed = { id: string; email: string | null; full_name: string | null; username: string | null };

/**
 * Record who did what, so a hand-made change is never anonymous.
 *
 * Written with service authority rather than the admin's own session: the point
 * of the row is that it exists, and an audit trail an actor could decline to
 * write is not one. It lives here beside the reader for the obvious reason —
 * this was previously the same function copied into two services, and the third
 * caller is what made that a problem rather than a duplication.
 *
 * A failed write is logged. Stage 11's exit condition is that every sensitive
 * admin action is auditable, and an audit insert that fails in silence is the
 * one failure that would quietly falsify it.
 */
export async function recordAudit(input: {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  values: Record<string, unknown>;
}): Promise<void> {
  const service = createSupabaseServiceClient();
  const { error } = await service.from("audit_logs").insert({
    actor_user_id: input.actorId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsonb column
    new_values: input.values as any,
  });

  if (error) {
    logFailure("admin.audit", "audit_write_failed", error, {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
    });
  }
}

export type AuditLogPage = {
  entries: AuditEntry[];
  /** How many entries match in total, which is what the pager counts pages from. */
  total: number;
};

export async function getAuditLog(
  options: { page?: number; pageSize?: number; action?: string } = {},
): Promise<AuditLogPage> {
  await requireAdmin();

  const { from, to } = pageRange(options.page ?? 1, options.pageSize ?? PAGE_SIZE);

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("audit_logs")
    .select(
      `id, action, entity_type, entity_id, new_values, created_at, actor_user_id,
       profiles!audit_logs_actor_user_id_fkey (id, email, full_name, username)`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (options.action) {
    query = query.eq("action", options.action);
  }

  const { data, count } = await query;

  const entries = (data ?? []).map((row) => {
    const profile = (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles) as
      | ProfileEmbed
      | null;

    return {
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      createdAt: row.created_at,
      actor: {
        id: row.actor_user_id,
        // An actor whose account was deleted still leaves the record behind:
        // the FK is `on delete set null`, so the entry outlives the person.
        name: profile?.full_name ?? profile?.username ?? null,
        email: profile?.email ?? null,
      },
      values: row.new_values,
    };
  });

  return { entries, total: count ?? entries.length };
}
