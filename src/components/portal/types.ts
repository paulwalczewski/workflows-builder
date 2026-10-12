import type { ActionEntry } from "@/server/logger";
import type { Run } from "@/server/run";

/** One recent action attempt, trimmed for the debug panel. */
export interface RecentAction {
  runId: string;
  at: string;
  capability: string;
  itemId?: string;
  outcome: ActionEntry["outcome"];
  reason?: string;
}

/** Everything the portal shows for one subscription, all plain JSON. */
export interface PortalRun extends Omit<Run, "customer" | "products"> {
  recent: RecentAction[];
}
