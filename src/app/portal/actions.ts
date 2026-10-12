"use server";

import { refresh } from "next/cache";
import { parseAction } from "@/domain/transitions";
import { parseNow } from "@/lib/now";
import { clearLog } from "@/server/logger";
import { type ActionOutcome, performAction } from "@/server/perform";
import { resetState } from "@/server/store";

/**
 * A portal button press. The server re-runs the published workflow before
 * changing anything, so a hand-crafted request gets the same answer as the UI.
 * `now` is the demo's simulated time; without it the real time is used.
 */
export async function submitAction(
  subscriptionId: unknown,
  rawAction: unknown,
  now?: unknown,
): Promise<ActionOutcome> {
  const action = parseAction(rawAction);
  if (typeof subscriptionId !== "string" || !action) {
    return { ok: false, reason: "That request was not understood." };
  }
  const at = (typeof now === "string" ? parseNow(now) : null) ?? new Date();
  const outcome = await performAction({ subscriptionId, action }, at);
  if (outcome.ok) refresh();
  return outcome;
}

/**
 * Puts every customer, subscription and workflow back to the seed and clears
 * the runtime log, so the log only covers what happened since.
 */
export async function resetData(): Promise<void> {
  await resetState(new Date());
  await clearLog();
  refresh();
}
