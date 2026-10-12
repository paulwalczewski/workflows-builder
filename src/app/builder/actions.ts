"use server";

import type { Diagnostic, Workflow } from "@wb/workflow-engine";
import { refresh } from "next/cache";
import { TRIGGER_SUBSCRIPTION_OPENED } from "@/catalogue/catalogue";
import {
  deleteWorkflow,
  getWorkflow,
  InvalidWorkflowError,
  listWorkflows,
  publishWorkflow,
  saveWorkflow,
  WorkflowInUseError,
} from "@/server/store";

export type SaveOutcome =
  | { ok: true; workflow: Workflow; diagnostics: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] };

/**
 * Saves a draft after the same checks the runtime uses on load. Errors are
 * returned, never thrown, so the editor can show them next to the rules.
 */
export async function saveWorkflowAction(doc: unknown): Promise<SaveOutcome> {
  try {
    const workflow = await saveWorkflow(doc);
    refresh();
    return { ok: true, workflow, diagnostics: [] };
  } catch (error) {
    if (error instanceof InvalidWorkflowError) {
      return { ok: false, diagnostics: error.diagnostics };
    }
    throw error;
  }
}

export async function publishWorkflowAction(id: unknown): Promise<void> {
  if (typeof id !== "string") return;
  await publishWorkflow(id);
  refresh();
}

async function freeId(base: string): Promise<string> {
  const taken = new Set((await listWorkflows()).map((w) => w.id));
  const slug =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "workflow";
  if (!taken.has(slug)) return slug;
  for (let n = 2; ; n++) if (!taken.has(`${slug}-${n}`)) return `${slug}-${n}`;
}

/** A new draft that starts with a Baseline rule, so it is explicit about the default. */
export async function createWorkflowAction(): Promise<string> {
  const id = await freeId("new-workflow");
  await saveWorkflow({
    schemaVersion: 1,
    id,
    name: "New workflow",
    status: "draft",
    trigger: TRIGGER_SUBSCRIPTION_OPENED,
    rules: [
      {
        id: "baseline",
        name: "Baseline",
        when: { match: "all", conditions: [] },
        then: [
          {
            type: "capability.allow",
            capabilities: ["item.*", "payment.update"],
          },
        ],
      },
    ],
  } satisfies Workflow);
  refresh();
  return id;
}

export async function duplicateWorkflowAction(
  id: unknown,
): Promise<string | null> {
  if (typeof id !== "string") return null;
  const original = await getWorkflow(id);
  if (!original) return null;
  const copyId = await freeId(`${original.id}-copy`);
  await saveWorkflow({
    ...original,
    id: copyId,
    name: `${original.name} (copy)`,
    status: "draft",
  });
  refresh();
  return copyId;
}

export type DeleteOutcome = { ok: true } | { ok: false; reason: string };

export async function deleteWorkflowAction(
  id: unknown,
): Promise<DeleteOutcome> {
  if (typeof id !== "string") return { ok: false, reason: "Unknown workflow." };
  try {
    await deleteWorkflow(id);
  } catch (error) {
    if (error instanceof WorkflowInUseError) {
      return { ok: false, reason: error.message };
    }
    throw error;
  }
  refresh();
  return { ok: true };
}
