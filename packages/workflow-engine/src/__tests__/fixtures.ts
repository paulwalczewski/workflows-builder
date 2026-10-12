import type {
  Catalogue,
  Condition,
  Effect,
  EvaluationInput,
  Rule,
  Workflow,
} from "../types";

/**
 * A deliberately non-subscription catalogue (a meal-kit "box" with "lines"),
 * so the engine tests prove nothing here depends on the host's domain.
 */
export const catalogue: Catalogue = {
  triggers: [{ id: "box.opened", label: "Box opened" }],
  facts: [
    {
      id: "box.tier",
      label: "Tier",
      scope: "subject",
      type: "enum",
      options: [
        { value: "basic", label: "Basic" },
        { value: "pro", label: "Pro" },
      ],
    },
    { id: "box.age", label: "Age", scope: "subject", type: "number" },
    { id: "box.flagged", label: "Flagged", scope: "subject", type: "boolean" },
    { id: "line.price", label: "Line price", scope: "child", type: "number" },
  ],
  capabilities: [
    { id: "box.close", label: "Close", subject: "subject" },
    { id: "box.pause", label: "Pause", subject: "subject" },
    { id: "line.add", label: "Add line", subject: "subject" },
    { id: "line.remove", label: "Remove line", subject: "child" },
    { id: "line.edit", label: "Edit line", subject: "child" },
  ],
  limits: [
    { id: "box.maxLines", label: "Max lines", subject: "subject" },
    { id: "line.maxQuantity", label: "Max quantity", subject: "child" },
  ],
  effects: [
    { type: "capability.allow", label: "Allow" },
    { type: "capability.deny", label: "Deny" },
    { type: "limit.set", label: "Set limit" },
  ],
};

let ruleCounter = 0;

export function rule(
  conditions: Condition[],
  then: Effect[],
  overrides: Partial<Rule> = {},
): Rule {
  ruleCounter += 1;
  return {
    id: `r${ruleCounter}`,
    name: `Rule ${ruleCounter}`,
    when: { match: "all", conditions },
    then,
    ...overrides,
  };
}

export function workflow(
  rules: Rule[],
  overrides: Partial<Workflow> = {},
): Workflow {
  return {
    schemaVersion: 1,
    id: "test",
    name: "Test",
    status: "draft",
    trigger: "box.opened",
    rules,
    ...overrides,
  };
}

export const allow = (...capabilities: string[]): Effect => ({
  type: "capability.allow",
  capabilities,
});

export const deny = (reason: string, ...capabilities: string[]): Effect => ({
  type: "capability.deny",
  capabilities,
  reason,
});

export const limit = (id: string, value: number): Effect => ({
  type: "limit.set",
  limit: id,
  value,
});

export const input = (
  facts: EvaluationInput["facts"] = {},
  children: EvaluationInput["children"] = [],
): EvaluationInput => ({ facts, children });
