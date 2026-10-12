import {
  type Catalogue,
  type Condition,
  type Effect,
  type FactDef,
  OPERATORS_BY_TYPE,
  type Operator,
  type Rule,
  uniqueSlug,
  type Workflow,
} from "@wb/workflow-engine";

/**
 * Pure editing operations on a workflow document. Every function returns a
 * new workflow so the builder stays a controlled component.
 */

export function uniqueRuleId(workflow: Workflow, base = "rule"): string {
  return uniqueSlug(base, new Set(workflow.rules.map((r) => r.id)), "rule");
}

export function addRule(workflow: Workflow): Workflow {
  const rule: Rule = {
    id: uniqueRuleId(workflow),
    name: "New rule",
    when: { match: "all", conditions: [] },
    then: [],
  };
  return { ...workflow, rules: [...workflow.rules, rule] };
}

export function replaceRule(
  workflow: Workflow,
  index: number,
  rule: Rule,
): Workflow {
  return { ...workflow, rules: replaceAt(workflow.rules, index, rule) };
}

/** `list` with the entry at `index` swapped for `value`. */
export function replaceAt<T>(list: readonly T[], index: number, value: T): T[] {
  return list.map((entry, i) => (i === index ? value : entry));
}

/** `list` without the entry at `index`. */
export function removeAt<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

export function moveRule(
  workflow: Workflow,
  from: number,
  to: number,
): Workflow {
  if (to < 0 || to >= workflow.rules.length || from === to) return workflow;
  const rules = [...workflow.rules];
  const [rule] = rules.splice(from, 1);
  rules.splice(to, 0, rule);
  return { ...workflow, rules };
}

export function removeRule(workflow: Workflow, index: number): Workflow {
  return { ...workflow, rules: removeAt(workflow.rules, index) };
}

export function duplicateRule(workflow: Workflow, index: number): Workflow {
  const original = workflow.rules[index];
  const copy: Rule = {
    ...(JSON.parse(JSON.stringify(original)) as Rule),
    id: uniqueRuleId(workflow, `${original.id}-copy`),
    name: `${original.name} (copy)`,
  };
  const rules = [...workflow.rules];
  rules.splice(index + 1, 0, copy);
  return { ...workflow, rules };
}

/** A sensible starting condition for a fact: first operator, typed value. */
export function defaultCondition(fact: FactDef): Condition {
  const op = OPERATORS_BY_TYPE[fact.type][0];
  return { fact: fact.id, op, value: defaultValue(fact, op) };
}

export function defaultValue(fact: FactDef, op: Operator): Condition["value"] {
  switch (fact.type) {
    case "number":
      return op === "between" ? [0, 10 * (fact.scale ?? 1)] : 0;
    case "enum":
      return fact.options?.[0] ? [fact.options[0].value] : [];
    case "boolean":
      return true;
  }
}

/** Keeps the value when it still fits the new operator, else resets it. */
export function changeOperator(
  condition: Condition,
  fact: FactDef,
  op: Operator,
): Condition {
  const wasRange = condition.op === "between";
  const isRange = op === "between";
  return wasRange === isRange
    ? { ...condition, op }
    : { ...condition, op, value: defaultValue(fact, op) };
}

export function defaultEffect(
  type: Effect["type"],
  catalogue: Catalogue,
): Effect {
  switch (type) {
    case "capability.allow":
      return { type, capabilities: [] };
    case "capability.deny":
      return { type, capabilities: [], reason: "" };
    case "limit.set":
      return { type, limit: catalogue.limits[0]?.id ?? "", value: 1 };
  }
}

/** Stored number to the figure a merchant reads (e.g. cents to euros). */
export function toDisplay(value: number, scale = 1): number {
  return value / scale;
}

/** The figure a merchant typed back to the stored integer. */
export function fromDisplay(value: number, scale = 1): number {
  return Math.round(value * scale);
}
