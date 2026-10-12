import { Suspense } from "react";

export default function WorkflowEditorPage({
  params,
}: PageProps<"/builder/[workflowId]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      {params.then(({ workflowId }) => (
        <h1 className="text-2xl font-semibold">Workflow {workflowId}</h1>
      ))}
    </Suspense>
  );
}
