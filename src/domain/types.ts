/**
 * The subscription domain. Field names follow the public API subset we were
 * given; additions are marked and listed in DECISIONS.md. All money is an
 * integer count of minor units (cents), never a float.
 */

export type ISODateTime = string; // "2024-02-15T10:00:00.000Z"
export type Interval = "day" | "week" | "month" | "year";

/** Added: the customer's service level. */
export type Tier = "standard" | "pro";

/** The person who holds subscriptions. */
export interface Customer {
  id: string;
  displayName: string;
  /** Added. */
  tier: Tier;
}

/** Added: something a customer can add to a subscription. */
export interface Product {
  id: string;
  title: string;
  /** Price of one unit per billing cycle, in minor units of `currencyCode` (950 = EUR 9.50). */
  unitPrice: number;
  currencyCode: string;
}

export interface SubscriptionItem {
  id: string;
  /** Added: the product this item is for. */
  productId: string;
  /** e.g. "Monthly Coffee Blend" */
  title: string;
  /** Units per billing cycle. */
  quantity: number;
  /**
   * Price per billing cycle, after discounts, in integer minor units of the
   * subscription's currency (2400 = EUR 24.00). Derived as unitPrice * quantity.
   */
  totalPrice: number;
}

export type SubscriptionStatus =
  | "active" // billing runs on schedule
  | "paused" // billing suspended until resumed
  | "canceled" // permanently stopped, but can be reactivated
  | "failed"; // latest billing attempt failed

/** Added: so `payment.update` has something to change. */
export interface PaymentMethod {
  brand: string;
  last4: string;
}

export interface Subscription {
  id: string;
  customerId: string;
  status: SubscriptionStatus;
  /** 0 before the first billing completes, +1 per successful billing. */
  currentCycle: number;
  nextBillingDate: ISODateTime | null;
  /** How often the subscription is billed, e.g. every 2 weeks. */
  billingPolicy: { interval: Interval; intervalCount: number };
  /** ISO 4217, e.g. "EUR". */
  currencyCode: string;
  items: SubscriptionItem[];
  /** Added. */
  paymentMethod: PaymentMethod;
}
