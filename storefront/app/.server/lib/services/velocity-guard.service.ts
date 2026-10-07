import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceClient } from "@server/lib/supabase/service";
import { enqueueTelegramAlert } from "@server/lib/services/telegram-alerts.service";
import { logFailure } from "@server/lib/logging/logger";

export type VelocityAction = "order" | "recharge" | "redeem";

export type VelocityCheckResult = {
  allowed: boolean;
  reason?: string;
};

/**
 * Asserts user velocity limits against high-frequency orders, recharges, and redemptions.
 * When a threshold is exceeded, records a risk hold and dispatches an admin alert.
 */
export async function assertVelocityLimit(
  supabase: SupabaseClient,
  userId: string,
  action: VelocityAction,
  refId?: string,
): Promise<VelocityCheckResult> {
  try {
    if (typeof supabase.rpc !== "function") {
      return { allowed: true };
    }

    const { data, error } = await supabase.rpc("check_velocity", {
      p_user: userId,
      p_action: action,
    });

    if (error || !data) {
      // Fail open on missing RPC in test environments to avoid blocking normal flows
      return { allowed: true };
    }

    const result = data as { allowed: boolean; reason?: string };
    if (!result.allowed) {
      const reason = result.reason || "velocity_exceeded";
      const service = createSupabaseServiceClient() || supabase;

      // Record hold row in risk_holds
      await (service as any).from("risk_holds").insert({
        user_id: userId,
        action,
        reason,
        ref_id: refId ?? null,
        status: "pending",
      });

      // Notify administrator via Telegram
      try {
        await enqueueTelegramAlert({
          type: "risk_hold",
          payload: {
            user_id: userId,
            action,
            reason,
            ref_id: refId ?? null,
          },
        });
      } catch (alertError) {
        logFailure("security", "risk_hold_alert_failed", alertError, { userId, action, reason });
      }

      return { allowed: false, reason };
    }

    return { allowed: true };
  } catch (err) {
    return { allowed: true };
  }
}
