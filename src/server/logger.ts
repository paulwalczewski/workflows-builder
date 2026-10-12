import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { EvaluationInput, EvaluationResult } from "@wb/workflow-engine";
import type { CapabilityView, SubscriptionView } from "@/catalogue/guards";

/**
 * Runtime log: one JSON object per line in `logs/runtime.jsonl`. Every portal
 * evaluation and every action attempt is written, with enough of the trace
 * to answer "why could this customer do that?" without the UI.
 */

export function logFile(): string {
  return (
    process.env.LOG_FILE ??
    join(/* turbopackIgnore: true */ process.cwd(), "logs", "runtime.jsonl")
  );
}

interface BaseEntry {
  runId: string;
  at: string;
  now: string;
  workflowId: string;
  workflowName: string;
  customerId: string;
  subscriptionId: string;
}

export interface EvaluationEntry extends BaseEntry {
  kind: "evaluation";
  facts: EvaluationInput;
  result: EvaluationResult;
  view: SubscriptionView;
}

export interface ActionEntry extends BaseEntry {
  kind: "action";
  action: { capability: string; itemId?: string; payload?: unknown };
  outcome: "performed" | "refused" | "invalid";
  /** The evaluation the server ran to check this action. */
  facts: EvaluationInput;
  result: EvaluationResult;
  reason?: string;
  /** For refusals: the capability's view, including the deciding rule. */
  decision?: CapabilityView;
}

export type LogEntry = EvaluationEntry | ActionEntry;

export async function writeLog(entry: LogEntry): Promise<void> {
  const file = logFile();
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(entry)}\n`);
}

/** Empties the runtime log, e.g. when the data is reset to the seed. */
export async function clearLog(): Promise<void> {
  await rm(logFile(), { force: true });
}

/**
 * The most recent entries, newest first, optionally only one kind, customer
 * or subscription. `limit` counts entries after filtering.
 */
export async function readLog({
  customerId,
  subscriptionId,
  kind,
  limit = 50,
}: {
  customerId?: string;
  subscriptionId?: string;
  kind?: LogEntry["kind"];
  limit?: number;
} = {}): Promise<LogEntry[]> {
  let text: string;
  try {
    text = await readFile(logFile(), "utf8");
  } catch {
    return [];
  }
  const entries: LogEntry[] = [];
  const lines = text.trimEnd().split("\n");
  for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
    try {
      const entry = JSON.parse(lines[i]) as LogEntry;
      if (
        (!customerId || entry.customerId === customerId) &&
        (!subscriptionId || entry.subscriptionId === subscriptionId) &&
        (!kind || entry.kind === kind)
      ) {
        entries.push(entry);
      }
    } catch {
      // A torn last line from a concurrent append; skip it.
    }
  }
  return entries;
}
