import { connection } from "next/server";
import { Suspense } from "react";
import { WorkflowList } from "@/components/builder/WorkflowList";
import { loadWorkflows } from "@/server/store";

export default function BuilderPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Workflow builder
        </h1>
        <p className="text-muted">
          Workflows decide what customers can do with their subscriptions. One
          workflow is published at a time; the rest are drafts.
        </p>
      </div>
      <Suspense fallback={<p className="text-muted">Loading workflows…</p>}>
        <Workflows />
      </Suspense>
    </div>
  );
}

async function Workflows() {
  await connection();
  const { workflows, broken } = await loadWorkflows();
  return <WorkflowList workflows={workflows} broken={broken} />;
}
