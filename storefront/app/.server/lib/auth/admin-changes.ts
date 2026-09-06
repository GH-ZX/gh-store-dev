/**
 * Who may be promoted, demoted, or suspended.
 *
 * These are the two changes that can lock the owner out of their own store, so
 * the rules live here as plain logic that can be tested without a database, and
 * the service refuses on exactly the same grounds.
 *
 * Both refusals protect against the same accident: an administrator removing the
 * last way back in. Nothing here is about privilege — an admin genuinely may
 * demote another admin — only about leaving a door open.
 */

export type AdminChangeRefusal = "self" | "last_admin" | "unknown_role" | null;

export type RoleChange = {
  actorId: string;
  targetId: string;
  nextRole: string;
  targetIsAdmin: boolean;
  /** How many active administrators exist right now, including the target. */
  activeAdminCount: number;
};

export const ROLES = ["customer", "admin"] as const;

export function refuseRoleChange(change: RoleChange): AdminChangeRefusal {
  if (!(ROLES as readonly string[]).includes(change.nextRole)) {
    return "unknown_role";
  }

  /*
   * Changing your own role is refused outright rather than only when you are the
   * last admin. An owner who demotes themselves cannot undo it from the
   * dashboard — the page they would need is the one they just lost — so it takes
   * a second administrator to do it, who by existing proves there is a way back.
   */
  if (change.actorId === change.targetId) {
    return "self";
  }

  if (change.targetIsAdmin && change.nextRole !== "admin" && change.activeAdminCount <= 1) {
    return "last_admin";
  }

  return null;
}

export type ActiveChange = {
  actorId: string;
  targetId: string;
  nextActive: boolean;
  targetIsAdmin: boolean;
  activeAdminCount: number;
};

export function refuseActiveChange(change: ActiveChange): AdminChangeRefusal {
  if (change.actorId === change.targetId) {
    return "self";
  }

  // Suspending an administrator removes them from the store as surely as
  // demoting them does, so the same floor applies.
  if (!change.nextActive && change.targetIsAdmin && change.activeAdminCount <= 1) {
    return "last_admin";
  }

  return null;
}
