import type { Condition, Effect, Rule, Workflow } from "./types";

/**
 * Canonical JSON for a workflow: fixed key order, two-space indent, trailing
 * newline. Saving an untouched workflow therefore rewrites the same bytes,
 * which keeps diffs of the stored files meaningful.
 */
export function serializeWorkflow(workflow: Workflow): string {
  return `${JSON.stringify(canonicalWorkflow(workflow), null, 2)}\n`;
}

export function canonicalWorkflow(workflow: Workflow): Workflow {
  return {
    ...(workflow.$schema !== undefined && { $schema: workflow.$schema }),
    schemaVersion: workflow.schemaVersion,
    id: workflow.id,
    name: workflow.name,
    ...(workflow.description !== undefined && {
      description: workflow.description,
    }),
    status: workflow.status,
    trigger: workflow.trigger,
    ...(workflow.updatedAt !== undefined && { updatedAt: workflow.updatedAt }),
    rules: workflow.rules.map(canonicalRule),
  };
}

function canonicalRule(rule: Rule): Rule {
  return {
    id: rule.id,
    name: rule.name,
    ...(rule.description !== undefined && { description: rule.description }),
    when: {
      match: rule.when.match,
      conditions: rule.when.conditions.map(canonicalCondition),
    },
    then: rule.then.map(canonicalEffect),
  };
}

function canonicalCondition(condition: Condition): Condition {
  return { fact: condition.fact, op: condition.op, value: condition.value };
}

function canonicalEffect(effect: Effect): Effect {
  switch (effect.type) {
    case "capability.allow":
      return { type: effect.type, capabilities: [...effect.capabilities] };
    case "capability.deny":
      return {
        type: effect.type,
        capabilities: [...effect.capabilities],
        reason: effect.reason,
      };
    case "limit.set":
      return { type: effect.type, limit: effect.limit, value: effect.value };
  }
}
