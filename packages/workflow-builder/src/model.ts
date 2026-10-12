import {
  type Catalogue,
  type Condition,
  type Effect,
  type FactDef,
  type FactValue,
  OPERATORS_BY_TYPE,
  type Operator,
  type Rule,
  type Workflow,
  withUnit,
} from "@wb/workflow-engine";

/**
 * Pure editing operations on a workflow document. Every function returns a
 * new workflow so the builder stays a controlled component.
 */

export function uniqueRuleId(workflow: Workflow, base = "rule"): string {
  const taken = new Set(workflow.rules.map((r) => r.id));
  const slug =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "rule";
  if (!taken.has(slug)) return slug;
  for (let n = 2; ; n++) {
    if (!taken.has(`${slug}-${n}`)) return `${slug}-${n}`;
  }
}

export function addRule(
  workflow: Workflow,
  at = workflow.rules.length,
): Workflow {
  const rule: Rule = {
    id: uniqueRuleId(workflow),
    name: "New rule",
    when: { match: "all", conditions: [] },
    then: [],
  };
  const rules = [...workflow.rules];
  rules.splice(at, 0, rule);
  return { ...workflow, rules };
}

export function updateRule(
  workflow: Workflow,
  index: number,
  change: (rule: Rule) => Rule,
): Workflow {
  return {
    ...workflow,
    rules: workflow.rules.map((rule, i) => (i === index ? change(rule) : rule)),
  };
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
  return { ...workflow, rules: workflow.rules.filter((_, i) => i !== index) };
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

export function formatFactValue(
  fact: FactDef | undefined,
  value: FactValue | undefined,
): string {
  if (value === null || value === undefined) return "not set";
  if (!fact) return String(value);
  if (fact.type === "enum") {
    return fact.options?.find((o) => o.value === value)?.label ?? String(value);
  }
  if (fact.type === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") {
    const shown = toDisplay(value, fact.scale).toLocaleString("en", {
      maximumFractionDigits: 2,
    });
    return withUnit(shown, toDisplay(value, fact.scale), fact.unit);
  }
  return String(value);
}

export function capabilityLabel(catalogue: Catalogue, pattern: string): string {
  if (pattern === "*") return "Everything";
  if (pattern.endsWith(".*")) return `All ${pattern.slice(0, -2)} capabilities`;
  return catalogue.capabilities.find((c) => c.id === pattern)?.label ?? pattern;
}

export function limitLabel(catalogue: Catalogue, id: string): string {
  return catalogue.limits.find((l) => l.id === id)?.label ?? id;
}

export function factDef(catalogue: Catalogue, id: string): FactDef | undefined {
  return catalogue.facts.find((f) => f.id === id);
}
