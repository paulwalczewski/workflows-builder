import type {
  Catalogue,
  EvaluationInput,
  FactValue,
  Workflow,
} from "@wb/workflow-engine";

/** Something the merchant can preview the workflow against, e.g. a customer. */
export interface PreviewSubject<Data = unknown> {
  id: string;
  label: string;
  /** Raw host data; only `resolveFacts` looks inside it. */
  data: Data;
}

/**
 * One thing the workflow runs for, e.g. one of the customer's subscriptions,
 * with its facts already resolved.
 */
export interface PreviewTarget {
  id: string;
  label: string;
  input: EvaluationInput;
  /** Display names for the target's children, keyed by child id. */
  childLabels: Record<string, string>;
  /** Optional host formatting for fact values, e.g. money in this target's currency. */
  formatFact?: (factId: string, value: FactValue) => string;
}

export interface WorkflowBuilderProps<Data = unknown> {
  /** The workflow being edited. The builder is controlled and never saves. */
  value: Workflow;
  onChange: (workflow: Workflow) => void;
  catalogue: Catalogue;
  previewSubjects: PreviewSubject<Data>[];
  /** Pure and synchronous: runs in the browser on every edit. */
  resolveFacts: (data: Data, now: Date) => PreviewTarget[];
  /** Starting point for the preview clock; defaults to the browser's time. */
  initialNow?: string;
}
