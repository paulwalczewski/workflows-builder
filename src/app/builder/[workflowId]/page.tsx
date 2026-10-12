import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import type { CustomerPreviewData } from "@/catalogue/preview";
import { BuilderClient } from "@/components/builder/BuilderClient";
import { getWorkflow, listCustomers, listSubscriptions } from "@/server/store";

export default function WorkflowEditorPage({
  params,
}: PageProps<"/builder/[workflowId]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading workflow…</p>}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({
  params,
}: Pick<PageProps<"/builder/[workflowId]">, "params">) {
  const { workflowId } = await params;
  await connection();
  const workflow = await getWorkflow(workflowId);
  if (!workflow) notFound();

  const [customers, subscriptions] = await Promise.all([
    listCustomers(),
    listSubscriptions(),
  ]);
  // The fixture customers are the preview subjects; their raw data goes to
  // the browser, where the builder resolves facts on every edit.
  const subjects = customers.map((customer) => ({
    id: customer.id,
    label: `${customer.displayName}${customer.tier === "pro" ? " (Pro)" : ""}`,
    data: {
      customer,
      subscriptions: subscriptions.filter((s) => s.customerId === customer.id),
    } satisfies CustomerPreviewData,
  }));

  return (
    <BuilderClient
      key={workflow.id}
      saved={workflow}
      subjects={subjects}
      now={new Date().toISOString()}
    />
  );
}
