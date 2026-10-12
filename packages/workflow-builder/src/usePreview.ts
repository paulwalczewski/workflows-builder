import {
  type Catalogue,
  type CheckResult,
  checkWorkflow,
  type EvaluationResult,
  evaluate,
  type Workflow,
} from "@wb/workflow-engine";
import { useMemo, useState } from "react";
import type { PreviewSubject, PreviewTarget } from "./types";

export interface Preview {
  check: CheckResult;
  targets: PreviewTarget[];
  target: PreviewTarget | undefined;
  /** Null when there is nothing to preview against yet. */
  result: EvaluationResult | null;
  /** The workflow the result came from (the last valid one when stale). */
  evaluated: Workflow | null;
  /** True when the draft has errors and the result is from the last valid draft. */
  stale: boolean;
}

/**
 * Checks the draft and runs it in the browser against the chosen subject on
 * every change. A draft with errors keeps showing the last valid result.
 */
export function usePreview<Data>({
  workflow,
  catalogue,
  subjects,
  resolveFacts,
  subjectId,
  targetId,
  now,
}: {
  workflow: Workflow;
  catalogue: Catalogue;
  subjects: PreviewSubject<Data>[];
  resolveFacts: (data: Data, now: Date) => PreviewTarget[];
  subjectId: string | undefined;
  targetId: string | null;
  now: string;
}): Preview {
  const check = useMemo(
    () => checkWorkflow(workflow, catalogue),
    [workflow, catalogue],
  );
  // The last draft without errors, updated during render (no extra pass).
  const [lastValid, setLastValid] = useState<Workflow | null>(
    check.ok ? check.workflow : null,
  );
  if (check.ok && check.workflow !== lastValid) setLastValid(check.workflow);

  const subject = subjects.find((s) => s.id === subjectId) ?? subjects[0];
  const targets = useMemo(
    () => (subject ? resolveFacts(subject.data, new Date(now)) : []),
    [subject, resolveFacts, now],
  );
  const target = targets.find((t) => t.id === targetId) ?? targets[0];

  const evaluated = check.ok ? check.workflow : lastValid;
  const result = useMemo(
    () =>
      evaluated && target
        ? evaluate({ workflow: evaluated, catalogue, input: target.input })
        : null,
    [evaluated, target, catalogue],
  );

  return { check, targets, target, result, evaluated, stale: !check.ok };
}
