import {
  capabilityIds,
  capabilityPatterns,
  expandPattern,
  limitIds,
  ruleLimits,
  ruleScope,
  ruleVerdicts,
  specificity,
} from "./capabilities";
import { OPERATORS_BY_TYPE } from "./conditions";
import type {
  Catalogue,
  Condition,
  Diagnostic,
  FactDef,
  Rule,
  Scope,
  When,
  Workflow,
} from "./types";

/**
 * Catalogue semantics and rule-order analysis for a workflow whose shape is
 * already valid. Errors block saving; warnings never do.
 */
export function analyze(
  workflow: Workflow,
  catalogue: Catalogue,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const facts = new Map(catalogue.facts.map((f) => [f.id, f]));
  const patterns = new Set(capabilityPatterns(catalogue));
  const offered = new Set(catalogue.effects.map((e) => e.type));
  const childCaps = capabilityIds(catalogue, "child");
  const childLimits = new Set(limitIds(catalogue, "child"));
  const allLimits = new Set(catalogue.limits.map((l) => l.id));
  const child = catalogue.terms?.child ?? "child";

  if (!catalogue.triggers.some((t) => t.id === workflow.trigger)) {
    diagnostics.push({
      severity: "error",
      code: "unknown-trigger",
      message: `Unknown trigger "${workflow.trigger}".`,
    });
  }

  const seenIds = new Set<string>();
  workflow.rules.forEach((rule, ruleIndex) => {
    const at = { ruleId: rule.id, ruleIndex };
    if (seenIds.has(rule.id)) {
      diagnostics.push({
        severity: "error",
        code: "duplicate-rule-id",
        message: `Another rule already uses the id "${rule.id}".`,
        ...at,
      });
    }
    seenIds.add(rule.id);

    rule.when.conditions.forEach((condition, conditionIndex) => {
      const problem = conditionProblem(condition, facts.get(condition.fact));
      if (problem)
        diagnostics.push({
          severity: "error",
          ...problem,
          ...at,
          conditionIndex,
        });
    });

    const scope = ruleScope(rule, catalogue);
    if (rule.then.length === 0) {
      diagnostics.push({
        severity: "warning",
        code: "no-effects",
        message: "This rule has no effects, so it never changes anything.",
        ...at,
      });
    }

    const limitsSet = new Set<string>();
    rule.then.forEach((effect, effectIndex) => {
      const here = { ...at, effectIndex };
      if (!offered.has(effect.type)) {
        diagnostics.push({
          severity: "error",
          code: "effect-not-offered",
          message: `The "${effect.type}" effect is not offered here.`,
          ...here,
        });
      }
      if (effect.type === "limit.set") {
        if (!allLimits.has(effect.limit)) {
          diagnostics.push({
            severity: "error",
            code: "unknown-limit",
            message: `Unknown limit "${effect.limit}".`,
            ...here,
          });
        } else if (scope === "child" && !childLimits.has(effect.limit)) {
          diagnostics.push({
            severity: "error",
            code: "child-rule-subject-target",
            message: `"${effect.limit}" is not a per-${child} limit, but this rule runs once per ${child} because it reads a ${child} fact.`,
            ...here,
          });
        }
        if (limitsSet.has(effect.limit)) {
          diagnostics.push({
            severity: "error",
            code: "in-rule-contradiction",
            message: `This rule sets "${effect.limit}" more than once.`,
            ...here,
          });
        }
        limitsSet.add(effect.limit);
        return;
      }
      for (const pattern of effect.capabilities) {
        if (!patterns.has(pattern)) {
          diagnostics.push({
            severity: "error",
            code: "unknown-capability",
            message: `Unknown capability "${pattern}".`,
            ...here,
          });
        } else if (
          scope === "child" &&
          expandPattern(pattern, childCaps).length === 0
        ) {
          diagnostics.push({
            severity: "error",
            code: "child-rule-subject-target",
            message: `"${pattern}" reaches no per-${child} capability, but this rule runs once per ${child} because it reads a ${child} fact.`,
            ...here,
          });
        }
      }
    });

    diagnostics.push(...contradictions(rule, ruleIndex, catalogue));
  });

  diagnostics.push(...orderDiagnostics(workflow, catalogue));
  return diagnostics;
}

function conditionProblem(
  condition: Condition,
  fact: FactDef | undefined,
): Pick<Diagnostic, "code" | "message"> | null {
  if (!fact) {
    return {
      code: "unknown-fact",
      message: `Unknown fact "${condition.fact}".`,
    };
  }
  if (!OPERATORS_BY_TYPE[fact.type].includes(condition.op)) {
    return {
      code: "operator-mismatch",
      message: `"${condition.op}" cannot compare ${fact.type} fact "${fact.label}".`,
    };
  }
  const { value, op } = condition;
  const bad = (expected: string) => ({
    code: "value-mismatch" as const,
    message: `"${fact.label}" needs ${expected}.`,
  });
  switch (fact.type) {
    case "number":
      if (op === "between") {
        const ok =
          Array.isArray(value) &&
          value.length === 2 &&
          value.every((v) => typeof v === "number") &&
          (value[0] as number) <= (value[1] as number);
        return ok ? null : bad("two numbers, lowest first");
      }
      return typeof value === "number" ? null : bad("a number");
    case "enum": {
      const options = new Set((fact.options ?? []).map((o) => o.value));
      const ok =
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((v) => typeof v === "string" && options.has(v));
      return ok ? null : bad(`one or more of: ${[...options].join(", ")}`);
    }
    case "boolean":
      return typeof value === "boolean" ? null : bad("true or false");
  }
}

/** Opposite answers for one capability at the same specificity inside one rule. */
function contradictions(
  rule: Rule,
  ruleIndex: number,
  catalogue: Catalogue,
): Diagnostic[] {
  const all = catalogue.capabilities.map((c) => c.id);
  const top = new Map<string, { level: number; allowed: Set<boolean> }>();
  for (const effect of rule.then) {
    if (effect.type === "limit.set") continue;
    const allowed = effect.type === "capability.allow";
    for (const pattern of effect.capabilities) {
      const level = specificity(pattern);
      for (const capability of expandPattern(pattern, all)) {
        const current = top.get(capability);
        if (!current || level > current.level) {
          top.set(capability, { level, allowed: new Set([allowed]) });
        } else if (level === current.level) {
          current.allowed.add(allowed);
        }
      }
    }
  }
  const clashing = [...top]
    .filter(([, v]) => v.allowed.size > 1)
    .map(([c]) => c);
  if (clashing.length === 0) return [];
  return [
    {
      severity: "error",
      code: "in-rule-contradiction",
      message: `This rule both allows and denies ${list(clashing)} at the same level of detail.`,
      ruleId: rule.id,
      ruleIndex,
    },
  ];
}

interface Touch {
  key: string;
  verdict: string;
  effectIndex: number;
}

/** What a rule decides, as comparable keys, over the targets its scope reaches. */
function touches(rule: Rule, scope: Scope, catalogue: Catalogue): Touch[] {
  const result: Touch[] = [];
  const scopes: Scope[] =
    scope === "subject" ? ["subject", "child"] : ["child"];
  for (const target of scopes) {
    const caps = capabilityIds(catalogue, target);
    for (const [capability, v] of ruleVerdicts(rule, caps)) {
      result.push({
        key: `capability:${capability}`,
        verdict: v.allowed ? "allows" : "denies",
        effectIndex: v.effectIndex,
      });
    }
    for (const [limit, v] of ruleLimits(rule, limitIds(catalogue, target))) {
      result.push({
        key: `limit:${limit}`,
        verdict: `sets ${v.value}`,
        effectIndex: v.effectIndex,
      });
    }
  }
  return result;
}

/**
 * Shadowed: a rule above always decides the same capability or limit first,
 * because it has no conditions or the same conditions. Possible conflict: a
 * rule above gives a different answer and wins whenever both match. Rules that
 * can never match together (e.g. "cycles at least 3" and "cycles at most 1")
 * are left alone.
 */
function orderDiagnostics(
  workflow: Workflow,
  catalogue: Catalogue,
): Diagnostic[] {
  const rules = workflow.rules.map((rule) => {
    const scope = ruleScope(rule, catalogue);
    return { rule, scope, touches: touches(rule, scope, catalogue) };
  });
  const diagnostics: Diagnostic[] = [];

  rules.forEach((lower, j) => {
    const shadowed = new Map<
      string,
      { above: number; keys: string[]; effectIndex: number }
    >();
    const conflicts = new Map<number, string[]>();

    for (const touch of lower.touches) {
      for (let i = 0; i < j; i++) {
        const upper = rules[i];
        const theirs = upper.touches.find((t) => t.key === touch.key);
        if (!theirs) continue;
        const always =
          upper.rule.when.conditions.length === 0 ||
          sameConditions(upper.rule.when, lower.rule.when);
        if (always) {
          const group = `${i}:${touch.effectIndex}`;
          const entry = shadowed.get(group) ?? {
            above: i,
            keys: [],
            effectIndex: touch.effectIndex,
          };
          entry.keys.push(touch.key);
          shadowed.set(group, entry);
          break;
        }
        if (
          theirs.verdict !== touch.verdict &&
          !neverBothMatch(upper.rule.when, lower.rule.when)
        ) {
          conflicts.set(i, [...(conflicts.get(i) ?? []), touch.key]);
        }
      }
    }

    for (const { above, keys, effectIndex } of shadowed.values()) {
      diagnostics.push({
        severity: "warning",
        code: "shadowed",
        message: `Never takes effect for ${list(keys.map(label))}: rule ${above + 1} "${rules[above].rule.name}" above always decides ${keys.length > 1 ? "them" : "it"} first.`,
        ruleId: lower.rule.id,
        ruleIndex: j,
        effectIndex,
      });
    }
    for (const [above, keys] of conflicts) {
      diagnostics.push({
        severity: "warning",
        code: "possible-conflict",
        message: `When rule ${above + 1} "${rules[above].rule.name}" also matches, it decides ${list(keys.map(label))} instead.`,
        ruleId: lower.rule.id,
        ruleIndex: j,
      });
    }
  });
  return diagnostics;
}

function conditionKey(condition: Condition): string {
  const value = Array.isArray(condition.value)
    ? [...condition.value].sort()
    : condition.value;
  return JSON.stringify([condition.fact, condition.op, value]);
}

/** Same match mode and the same conditions, in any order and key order. */
export function sameConditions(a: When, b: When): boolean {
  if (a.conditions.length !== b.conditions.length) return false;
  if (a.match !== b.match && a.conditions.length > 1) return false;
  const keys = (w: When) => w.conditions.map(conditionKey).sort().join("|");
  return keys(a) === keys(b);
}

interface Range {
  lo: number;
  loIn: boolean;
  hi: number;
  hiIn: boolean;
}

/** The values a condition accepts, when that is a simple range or set. */
function accepted(condition: Condition): Range | Set<unknown> | null {
  const { op, value } = condition;
  const range = (lo: number, loIn: boolean, hi: number, hiIn: boolean) => ({
    lo,
    loIn,
    hi,
    hiIn,
  });
  if (typeof value === "number") {
    switch (op) {
      case "eq":
        return range(value, true, value, true);
      case "gt":
        return range(value, false, Number.POSITIVE_INFINITY, false);
      case "gte":
        return range(value, true, Number.POSITIVE_INFINITY, false);
      case "lt":
        return range(Number.NEGATIVE_INFINITY, false, value, false);
      case "lte":
        return range(Number.NEGATIVE_INFINITY, false, value, true);
    }
  }
  if (op === "between" && Array.isArray(value)) {
    const [lo, hi] = value;
    if (typeof lo === "number" && typeof hi === "number") {
      return range(lo, true, hi, true);
    }
  }
  if (op === "in" && Array.isArray(value)) return new Set(value);
  if ((op === "is" || op === "eq") && typeof value !== "object") {
    return new Set([value]);
  }
  return null;
}

function disjoint(a: Condition, b: Condition): boolean {
  if (a.fact !== b.fact) return false;
  const x = accepted(a);
  const y = accepted(b);
  if (!x || !y) return false;
  if (x instanceof Set && y instanceof Set) {
    return ![...x].some((v) => y.has(v));
  }
  if (x instanceof Set || y instanceof Set) return false;
  const lo = Math.max(x.lo, y.lo);
  const hi = Math.min(x.hi, y.hi);
  if (lo < hi) return false;
  if (lo > hi) return true;
  const loIn = x.lo === lo ? x.loIn : y.loIn;
  const loIn2 = y.lo === lo ? y.loIn : x.loIn;
  const hiIn = x.hi === hi ? x.hiIn : y.hiIn;
  const hiIn2 = y.hi === hi ? y.hiIn : x.hiIn;
  return !(loIn && loIn2 && hiIn && hiIn2);
}

/**
 * True when two rules provably never match the same target: each requires a
 * condition on the same fact, and those conditions accept no common value.
 */
export function neverBothMatch(a: When, b: When): boolean {
  const required = (w: When) =>
    w.match === "all" || w.conditions.length === 1 ? w.conditions : [];
  return required(a).some((x) => required(b).some((y) => disjoint(x, y)));
}

function label(key: string): string {
  return key.slice(key.indexOf(":") + 1);
}

function list(items: string[]): string {
  const unique = [...new Set(items)];
  return unique.length <= 1
    ? `"${unique[0] ?? ""}"`
    : `${unique
        .slice(0, -1)
        .map((i) => `"${i}"`)
        .join(", ")} and "${unique.at(-1)}"`;
}
