import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Notice } from "@/components/Notice";
import { PortalView } from "@/components/portal/PortalView";
import type { PortalRun, RecentAction } from "@/components/portal/types";
import type { Product } from "@/domain/types";
import { parseNow } from "@/lib/now";
import { type ActionEntry, readLog } from "@/server/logger";
import { loadRunContext, logEvaluation, RunError, runFor } from "@/server/run";
import { getCustomer, listSubscriptions } from "@/server/store";

export default function CustomerPortalPage({
  params,
  searchParams,
}: PageProps<"/portal/[customerId]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading subscriptions…</p>}>
      <CustomerPortal params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CustomerPortal({
  params,
  searchParams,
}: PageProps<"/portal/[customerId]">) {
  const { customerId } = await params;
  const query = await searchParams;
  await connection();
  const simulated = parseNow(query.now);
  const now = simulated ?? new Date();

  const customer = await getCustomer(customerId);
  if (!customer) notFound();
  const subscriptions = (await listSubscriptions()).filter(
    (s) => s.customerId === customer.id,
  );

  let runs: PortalRun[];
  let products: Product[];
  try {
    // Opening the portal is the trigger: the published workflow runs for
    // every subscription on the page, and each run is logged.
    const context = await loadRunContext(customer.id);
    products = context.products;
    const actions = (
      await readLog({ kind: "action", customerId: customer.id, limit: 50 })
    ).filter((e): e is ActionEntry => e.kind === "action");
    runs = await Promise.all(
      subscriptions.map(async (subscription) => {
        const run = await runFor(subscription, now, context);
        await logEvaluation(run);
        const { customer: _, products: __, ...rest } = run;
        return { ...rest, recent: recentActions(actions, subscription.id) };
      }),
    );
  } catch (error) {
    if (!(error instanceof RunError)) throw error;
    return (
      <Notice status="danger" title="The portal cannot evaluate subscriptions">
        {error.message}
      </Notice>
    );
  }

  return (
    <PortalView
      customer={customer}
      runs={runs}
      products={products}
      now={now.toISOString()}
      simulated={simulated !== null}
    />
  );
}

function recentActions(
  actions: ActionEntry[],
  subscriptionId: string,
): RecentAction[] {
  return actions
    .filter((e) => e.subscriptionId === subscriptionId)
    .slice(0, 8)
    .map((e) => ({
      runId: e.runId,
      at: e.at,
      capability: e.action.capability,
      ...(e.action.itemId && { itemId: e.action.itemId }),
      outcome: e.outcome,
      ...(e.reason && { reason: e.reason }),
    }));
}
