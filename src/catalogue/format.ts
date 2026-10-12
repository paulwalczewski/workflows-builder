import { type FactValue, factDef, formatFactValue } from "@wb/workflow-engine";
import { formatMoney } from "@/domain/billing";
import type { Subscription } from "@/domain/types";
import { subscriptionCatalogue } from "./catalogue";

/** A fact value as a customer or merchant would read it. */
export function formatFact(
  factId: string,
  value: FactValue | undefined,
  currencyCode: string,
): string {
  const fact = factDef(subscriptionCatalogue, factId);
  // Money facts are stored in minor units (scale 100): show them as currency.
  if (typeof value === "number" && fact?.scale === 100) {
    return formatMoney(value, currencyCode);
  }
  return formatFactValue(fact, value);
}

/** How each subscription status is labelled and coloured in the portal. */
export const STATUS_CHIP = {
  active: { label: "Active", color: "success" },
  paused: { label: "Paused", color: "warning" },
  canceled: { label: "Canceled", color: "default" },
  failed: { label: "Payment failed", color: "danger" },
} as const;

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
