import { capabilityView } from "@/catalogue/guards";
import { applyAction, type SubscriptionAction } from "@/domain/transitions";
import { type ActionEntry, writeLog } from "./logger";
import { type Run, RunError, runFor } from "./run";
import { transactSubscription } from "./store";

export interface ActionRequest {
  subscriptionId: string;
  action: SubscriptionAction;
}

export type ActionOutcome =
  | { ok: true; message: string; runId: string }
  | { ok: false; reason: string; runId?: string };

type Verdict = {
  outcome: ActionOutcome;
  log?: { run: Run; kind: ActionEntry["outcome"]; reason?: string };
};

/**
 * The server's side of every portal button. Inside the write queue it re-runs
 * the published workflow for the subscription as stored right now, refuses
 * anything the result does not enable, and applies the change, so two
 * requests at once cannot both pass a check that only one of them may pass.
 * Every attempt is logged.
 */
export async function performAction(
  { subscriptionId, action }: ActionRequest,
  now: Date,
): Promise<ActionOutcome> {
  const itemId = "itemId" in action ? action.itemId : undefined;
  const { capability, ...payload } = action;

  let verdict: Verdict | null;
  try {
    verdict = await transactSubscription<Verdict>(
      subscriptionId,
      async (current) => {
        const run = await runFor(current, now);
        const view = capabilityView(run.view, capability, itemId);
        if (!view || view.availability !== "enabled") {
          const reason =
            view?.reason ?? "This is not available for your subscription.";
          return {
            result: {
              outcome: { ok: false, reason, runId: run.runId },
              log: { run, kind: "refused", reason },
            },
          };
        }
        const applied = applyAction(current, action, {
          products: run.products,
          now,
          maxQuantity: itemId ? run.view.limits.maxQuantity[itemId] : null,
        });
        if (!applied.ok) {
          return {
            result: {
              outcome: { ok: false, reason: applied.reason, runId: run.runId },
              log: { run, kind: "invalid", reason: applied.reason },
            },
          };
        }
        return {
          next: applied.subscription,
          result: {
            outcome: { ok: true, message: applied.message, runId: run.runId },
            log: { run, kind: "performed" },
          },
        };
      },
    );
  } catch (error) {
    if (error instanceof RunError) return { ok: false, reason: error.message };
    throw error;
  }
  if (!verdict) {
    return { ok: false, reason: `Unknown subscription ${subscriptionId}.` };
  }

  if (verdict.log) {
    const { run, kind, reason } = verdict.log;
    await writeLog({
      kind: "action",
      runId: run.runId,
      at: new Date().toISOString(),
      now: run.now,
      workflowId: run.workflow.id,
      workflowName: run.workflow.name,
      customerId: run.customer.id,
      subscriptionId,
      action: { capability, ...(itemId && { itemId }), payload },
      outcome: kind,
      facts: run.input,
      result: run.result,
      ...(reason && { reason }),
      ...(kind === "refused" && {
        decision: capabilityView(run.view, capability, itemId),
      }),
    });
  }
  return verdict.outcome;
}
