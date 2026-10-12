import type { Interval, ISODateTime, Subscription } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** How many billing intervals of each kind fit in one month. */
const PER_MONTH: Record<Interval, number> = {
  day: 365 / 12,
  week: 52 / 12,
  month: 1,
  year: 1 / 12,
};

/** Sum of item prices for one billing cycle, in minor units. */
export function cycleTotal(subscription: Subscription): number {
  return subscription.items.reduce((sum, item) => sum + item.totalPrice, 0);
}

/**
 * Monthly spend: the cycle total normalised to one month by the billing
 * policy, in minor units of the subscription's own currency (no FX), rounded
 * to a whole minor unit.
 */
export function monthlySpend(subscription: Subscription): number {
  const { interval, intervalCount } = subscription.billingPolicy;
  return Math.round(
    (cycleTotal(subscription) * PER_MONTH[interval]) / intervalCount,
  );
}

/**
 * Whole days until the next billing, rounded up, so "in 1.5 days" counts as 2
 * and "in 2.3 days" as 3. Past-due renewals give zero or less. Null when
 * nothing is scheduled (paused or canceled).
 */
export function daysUntilRenewal(
  subscription: Subscription,
  now: Date,
): number | null {
  if (!subscription.nextBillingDate) return null;
  return Math.ceil(
    (Date.parse(subscription.nextBillingDate) - now.getTime()) / DAY_MS,
  );
}

/** The billing date one full policy period after `from`. */
export function addBillingPeriod(
  from: Date,
  { interval, intervalCount }: Subscription["billingPolicy"],
): ISODateTime {
  const next = new Date(from.getTime());
  switch (interval) {
    case "day":
      next.setUTCDate(next.getUTCDate() + intervalCount);
      break;
    case "week":
      next.setUTCDate(next.getUTCDate() + 7 * intervalCount);
      break;
    case "month":
      next.setUTCMonth(next.getUTCMonth() + intervalCount);
      break;
    case "year":
      next.setUTCFullYear(next.getUTCFullYear() + intervalCount);
      break;
  }
  return next.toISOString();
}

export function addDays(from: Date, days: number): ISODateTime {
  return new Date(from.getTime() + days * DAY_MS).toISOString();
}

/** Decimal places of a currency's minor unit (EUR 2, JPY 0). */
export function minorDigits(currencyCode: string): number {
  return (
    new Intl.NumberFormat("en", {
      style: "currency",
      currency: currencyCode,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}

/** Formats integer minor units for display: 950 EUR -> "€9.50". */
export function formatMoney(minor: number, currencyCode: string): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: currencyCode,
  }).format(minor / 10 ** minorDigits(currencyCode));
}

export function describePolicy({
  interval,
  intervalCount,
}: Subscription["billingPolicy"]): string {
  return intervalCount === 1
    ? `Every ${interval}`
    : `Every ${intervalCount} ${interval}s`;
}
