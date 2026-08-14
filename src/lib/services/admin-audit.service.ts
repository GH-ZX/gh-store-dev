import "server-only";

import { requireAdmin } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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

export async function getAuditLog(options: { limit?: number; action?: string } = {}): Promise<AuditEntry[]> {
  await requireAdmin();

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("audit_logs")
    .select(
      `id, action, entity_type, entity_id, new_values, created_at, actor_user_id,
       profiles!audit_logs_actor_user_id_fkey (id, email, full_name, username)`,
    )
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 100);

  if (options.action) {
    query = query.eq("action", options.action);
  }

  const { data } = await query;

  return (data ?? []).map((row) => {
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
}
