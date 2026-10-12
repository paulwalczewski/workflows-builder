import type { Catalogue, Rule, Scope } from "./types";

/** How specific a capability pattern is: exact beats `scope.*` beats `*`. */
export function specificity(pattern: string): 0 | 1 | 2 {
  if (pattern === "*") return 0;
  if (pattern.endsWith(".*")) return 1;
  return 2;
}

export function isWildcard(pattern: string): boolean {
  return specificity(pattern) < 2;
}

export function matchesPattern(pattern: string, capability: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith(".*")) {
    return capability.startsWith(pattern.slice(0, -1));
  }
  return pattern === capability;
}

/** Concrete capability ids a pattern reaches among the given ones. */
export function expandPattern(
  pattern: string,
  capabilities: readonly string[],
): string[] {
  return capabilities.filter((capability) =>
    matchesPattern(pattern, capability),
  );
}

export function capabilityIds(catalogue: Catalogue, scope: Scope): string[] {
  return catalogue.capabilities
    .filter((c) => c.subject === scope)
    .map((c) => c.id);
}

export function limitIds(catalogue: Catalogue, scope: Scope): string[] {
  return catalogue.limits.filter((l) => l.subject === scope).map((l) => l.id);
}

/** Every pattern the catalogue makes meaningful: `*`, each `scope.*`, each id. */
export function capabilityPatterns(catalogue: Catalogue): string[] {
  const ids = catalogue.capabilities.map((c) => c.id);
  const scopes = new Set<string>();
  for (const id of ids) {
    const parts = id.split(".");
    for (let i = 1; i < parts.length; i++) {
      scopes.add(`${parts.slice(0, i).join(".")}.*`);
    }
  }
  return ["*", ...[...scopes].sort(), ...ids];
}

/**
 * A rule is child-scoped when any condition reads a child fact. It then runs
 * once per child and may only touch child capabilities and child limits.
 */
export function ruleScope(rule: Rule, catalogue: Catalogue): Scope {
  const childFacts = new Set(
    catalogue.facts.filter((f) => f.scope === "child").map((f) => f.id),
  );
  return rule.when.conditions.some((c) => childFacts.has(c.fact))
    ? "child"
    : "subject";
}

export interface CapabilityVerdict {
  allowed: boolean;
  reason?: string;
  effectIndex: number;
  /** True when the rule reached this capability through `*` or `scope.*`. */
  viaWildcard: boolean;
  /** True when the rule both allows and denies it at its most specific level. */
  contested: boolean;
}

/**
 * What one rule says about each capability it reaches, after resolving its own
 * effects by specificity. Ties at the same specificity go to deny.
 */
export function ruleVerdicts(
  rule: Rule,
  capabilities: readonly string[],
): Map<string, CapabilityVerdict> {
  const best = new Map<string, CapabilityVerdict & { level: number }>();
  rule.then.forEach((effect, effectIndex) => {
    if (effect.type === "limit.set") return;
    const allowed = effect.type === "capability.allow";
    const reason =
      effect.type === "capability.deny" ? effect.reason : undefined;
    for (const pattern of effect.capabilities) {
      const level = specificity(pattern);
      for (const capability of expandPattern(pattern, capabilities)) {
        const current = best.get(capability);
        const tie = current?.level === level;
        if (current && level < current.level) continue;
        const contested =
          tie && (current.contested || current.allowed !== allowed);
        if (tie && !(current.allowed && !allowed)) {
          current.contested = contested;
          continue;
        }
        best.set(capability, {
          allowed,
          reason,
          effectIndex,
          viaWildcard: level < 2,
          contested,
          level,
        });
      }
    }
  });
  return new Map(
    [...best].map(([capability, { level: _, ...verdict }]) => [
      capability,
      verdict,
    ]),
  );
}

/** The first value each limit is set to inside one rule. */
export function ruleLimits(
  rule: Rule,
  limits: readonly string[],
): Map<string, { value: number; effectIndex: number }> {
  const result = new Map<string, { value: number; effectIndex: number }>();
  rule.then.forEach((effect, effectIndex) => {
    if (effect.type !== "limit.set") return;
    if (!limits.includes(effect.limit) || result.has(effect.limit)) return;
    result.set(effect.limit, { value: effect.value, effectIndex });
  });
  return result;
}
