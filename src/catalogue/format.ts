import { type FactValue, withUnit } from "@wb/workflow-engine";
import { formatMoney } from "@/domain/billing";
import type { Subscription } from "@/domain/types";
import { subscriptionCatalogue } from "./catalogue";

const facts = new Map(subscriptionCatalogue.facts.map((f) => [f.id, f]));

/** A fact value as a customer or merchant would read it. */
export function formatFact(
  factId: string,
  value: FactValue | undefined,
  currencyCode: string,
): string {
  if (value === null || value === undefined) return "not set";
  const fact = facts.get(factId);
  if (fact?.type === "enum") {
    return fact.options?.find((o) => o.value === value)?.label ?? String(value);
  }
  if (typeof value === "number" && fact?.scale === 100) {
    return formatMoney(value, currencyCode);
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  return typeof value === "number"
    ? withUnit(String(value), value, fact?.unit)
    : String(value);
}

/** A condition's expected value, formatted like the fact it compares. */
export function formatExpected(
  factId: string,
  value: unknown,
  currencyCode: string,
): string {
  if (Array.isArray(value)) {
    return value
      .map((v) => formatFact(factId, v as FactValue, currencyCode))
      .join(typeof value[0] === "number" ? " and " : ", ");
  }
  return formatFact(factId, value as FactValue, currencyCode);
}

export function subscriptionTitle(subscription: Subscription): string {
  const [first, ...rest] = subscription.items;
  if (!first) return "Empty subscription";
  return rest.length === 0
    ? first.title
    : `${first.title} and ${rest.length} more`;
}

const dateFormat = new Intl.DateTimeFormat("en-IE", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

const dateTimeFormat = new Intl.DateTimeFormat("en-IE", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}
