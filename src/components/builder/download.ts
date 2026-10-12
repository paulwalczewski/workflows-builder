import { serializeWorkflow, type Workflow } from "@wb/workflow-engine";

/** Saves a workflow as `<id>.json` in the browser's downloads. */
export function downloadWorkflow(workflow: Workflow): void {
  const blob = new Blob([serializeWorkflow(workflow)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${workflow.id}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
