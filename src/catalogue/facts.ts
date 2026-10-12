import type { EvaluationInput } from "@wb/workflow-engine";
import { daysUntilRenewal, monthlySpend, unitPrice } from "@/domain/billing";
import type { Customer, Subscription } from "@/domain/types";

/**
 * Turns one subscription (and its customer) into the facts the engine reads.
 * Pure and isomorphic: the server uses it for real evaluations and the
 * builder runs it in the browser for previews.
 */
export function resolveSubscriptionFacts(
  customer: Customer,
  subscription: Subscription,
  now: Date,
): EvaluationInput {
  return {
    facts: {
      "customer.tier": customer.tier,
      "subscription.status": subscription.status,
      "subscription.currentCycle": subscription.currentCycle,
      "subscription.monthlySpend": monthlySpend(subscription),
      "subscription.daysUntilRenewal": daysUntilRenewal(subscription, now),
      "subscription.itemCount": subscription.items.length,
      "subscription.billingInterval": subscription.billingPolicy.interval,
    },
    children: subscription.items.map((item) => ({
      id: item.id,
      facts: {
        "item.quantity": item.quantity,
        "item.unitPrice": item.quantity > 0 ? unitPrice(item) : null,
        "item.totalPrice": item.totalPrice,
      },
    })),
  };
}
