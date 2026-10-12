import { Alert } from "@heroui/react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PortalView } from "@/components/portal/PortalView";
import type { PortalRun, RecentAction } from "@/components/portal/types";
import { parseNow } from "@/lib/now";
import { readLog } from "@/server/logger";
import { RunError, runAndLog } from "@/server/run";
import { getCustomer, listProducts, listSubscriptions } from "@/server/store";

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
  try {
    // Opening the portal is the trigger: the published workflow runs for
    // every subscription on the page, and each run is logged.
    runs = await Promise.all(
      subscriptions.map(async (subscription) => {
        const {
          customer: _,
          products: __,
          ...run
        } = await runAndLog(subscription.id, now);
        return { ...run, recent: await recentActions(subscription.id) };
      }),
    );
  } catch (error) {
    if (!(error instanceof RunError)) throw error;
    return (
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>The portal cannot evaluate subscriptions</Alert.Title>
          <Alert.Description>{error.message}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  return (
    <PortalView
      customer={customer}
      runs={runs}
      products={await listProducts()}
      now={now.toISOString()}
      simulated={simulated !== null}
    />
  );
}

async function recentActions(subscriptionId: string): Promise<RecentAction[]> {
  const entries = await readLog({ subscriptionId, limit: 40 });
  return entries
    .filter((e) => e.kind === "action")
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
