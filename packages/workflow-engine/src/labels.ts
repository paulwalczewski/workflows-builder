import { withUnit } from "./conditions";
import type { Catalogue, FactDef, FactValue } from "./types";

/**
 * Catalogue lookups and value formatting shared by the builder and hosts, so
 * a capability, limit or fact reads the same everywhere.
 */

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

/** A fact value as a merchant reads it: option labels, yes/no, scaled units. */
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
    const scaled = value / (fact.scale ?? 1);
    const shown = scaled.toLocaleString("en", { maximumFractionDigits: 2 });
    return withUnit(shown, scaled, fact.unit);
  }
  return String(value);
}

/** `base` as a lowercase slug, suffixed `-2`, `-3`, ... until it is free. */
export function uniqueSlug(
  base: string,
  taken: ReadonlySet<string>,
  fallback: string,
): string {
  const slug =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback;
  if (!taken.has(slug)) return slug;
  for (let n = 2; ; n++) {
    if (!taken.has(`${slug}-${n}`)) return `${slug}-${n}`;
  }
}
