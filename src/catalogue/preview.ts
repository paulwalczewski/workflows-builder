import type { PreviewTarget } from "@wb/workflow-builder";
import type { Customer, Subscription } from "@/domain/types";
import { resolveSubscriptionFacts } from "./facts";
import { formatFact, subscriptionTitle } from "./format";

/** What the builder previews against: one customer and their subscriptions. */
export interface CustomerPreviewData {
  customer: Customer;
  subscriptions: Subscription[];
}

/**
 * The builder's `resolveFacts`: each of the customer's subscriptions becomes
 * one preview target. Pure, so it runs in the browser on every edit.
 */
export function resolveCustomerTargets(
  { customer, subscriptions }: CustomerPreviewData,
  now: Date,
): PreviewTarget[] {
  return subscriptions.map((subscription) => ({
    id: subscription.id,
    label: `${subscriptionTitle(subscription)} (${subscription.status})`,
    input: resolveSubscriptionFacts(customer, subscription, now),
    childLabels: Object.fromEntries(
      subscription.items.map((item) => [item.id, item.title]),
    ),
    formatFact: (factId, value) =>
      formatFact(factId, value, subscription.currencyCode),
  }));
}
