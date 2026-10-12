import {
  capabilityIds,
  limitIds,
  ruleLimits,
  ruleScope,
  ruleVerdicts,
} from "./capabilities";
import { testWhen } from "./conditions";
import type {
  CapabilityDecision,
  Catalogue,
  EvaluationInput,
  EvaluationResult,
  FactValues,
  LimitDecision,
  Rule,
  RuleTrace,
  TargetResult,
  Workflow,
} from "./types";

export interface EvaluateArgs {
  workflow: Workflow;
  catalogue: Catalogue;
  input: EvaluationInput;
}

/**
 * Runs a workflow once for one subject and its children. Pure: no clock, no
 * I/O, no randomness. Rules are read top to bottom; for each capability and
 * limit on each target, the first matching rule that mentions it decides.
 */
export function evaluate({
  workflow,
  catalogue,
  input,
}: EvaluateArgs): EvaluationResult {
  const subjectCaps = capabilityIds(catalogue, "subject");
  const childCaps = capabilityIds(catalogue, "child");
  const subjectLimits = limitIds(catalogue, "subject");
  const childLimits = limitIds(catalogue, "child");

  const subject = emptyTarget(subjectCaps, subjectLimits);
  const children: Record<string, TargetResult> = {};
  for (const child of input.children) {
    children[child.id] = emptyTarget(childCaps, childLimits);
  }

  const trace: RuleTrace[] = workflow.rules.map((rule, ruleIndex) => {
    const scope = ruleScope(rule, catalogue);
    const ruleTrace: RuleTrace = {
      ruleId: rule.id,
      ruleIndex,
      name: rule.name,
      scope,
      evaluations: [],
    };

    if (scope === "subject") {
      const { matched, conditions } = testWhen(rule.when, input.facts);
      ruleTrace.evaluations.push({ targetId: null, matched, conditions });
      if (matched) {
        apply(rule, ruleIndex, subject, subjectCaps, subjectLimits);
        for (const child of input.children) {
          apply(rule, ruleIndex, children[child.id], childCaps, childLimits);
        }
      }
    } else {
      for (const child of input.children) {
        const facts: FactValues = { ...input.facts, ...child.facts };
        const { matched, conditions } = testWhen(rule.when, facts);
        ruleTrace.evaluations.push({ targetId: child.id, matched, conditions });
        if (matched)
          apply(rule, ruleIndex, children[child.id], childCaps, childLimits);
      }
    }
    return ruleTrace;
  });

  return { workflowId: workflow.id, subject, children, trace };
}

/** Partial decisions while rules are being walked; `decidedBy` stays null until a rule decides. */
function emptyTarget(capabilities: string[], limits: string[]): TargetResult {
  const target: TargetResult = { capabilities: {}, limits: {} };
  for (const capability of capabilities) {
    target.capabilities[capability] = {
      capability,
      allowed: false,
      decidedBy: null,
      overridden: [],
    } satisfies CapabilityDecision;
  }
  for (const limit of limits) {
    target.limits[limit] = {
      limit,
      value: null,
      decidedBy: null,
      overridden: [],
    } satisfies LimitDecision;
  }
  return target;
}

function apply(
  rule: Rule,
  ruleIndex: number,
  target: TargetResult,
  capabilities: string[],
  limits: string[],
): void {
  for (const [capability, verdict] of ruleVerdicts(rule, capabilities)) {
    const decision = target.capabilities[capability];
    const ref = {
      ruleId: rule.id,
      ruleIndex,
      effectIndex: verdict.effectIndex,
    };
    if (decision.decidedBy) {
      decision.overridden.push({
        ...ref,
        allowed: verdict.allowed,
        ...(verdict.reason !== undefined && { reason: verdict.reason }),
      });
    } else {
      decision.allowed = verdict.allowed;
      decision.decidedBy = ref;
      if (verdict.reason !== undefined) decision.reason = verdict.reason;
    }
  }

  for (const [limit, { value, effectIndex }] of ruleLimits(rule, limits)) {
    const decision = target.limits[limit];
    const ref = { ruleId: rule.id, ruleIndex, effectIndex };
    if (decision.decidedBy) {
      decision.overridden.push({ ...ref, value });
    } else {
      decision.value = value;
      decision.decidedBy = ref;
    }
  }
}
