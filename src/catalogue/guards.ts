import type { CapabilityDecision, EvaluationResult } from "@wb/workflow-engine";
import type { Product, Subscription, SubscriptionItem } from "@/domain/types";
import { CAPABILITIES, LIMITS } from "./catalogue";

/**
 * Guards are this product's fixed rules, applied after the workflow. A
 * merchant cannot grant past them: a capability the workflow allows but a
 * guard blocks is shown disabled with the guard's reason.
 */
export interface Guard {
  reason: string;
}

export type Availability = "enabled" | "disabled" | "hidden";

/** Where the final answer came from, for the debug panel and logs. */
export type Source = "rule" | "default" | "guard" | "limit";

export interface CapabilityView {
  capability: string;
  availability: Availability;
  reason?: string;
  source: Source;
  decision: CapabilityDecision;
  guard?: Guard;
}

export interface SubscriptionView {
  capabilities: Record<string, CapabilityView>;
  items: Record<string, Record<string, CapabilityView>>;
  limits: {
    maxItems: number | null;
    maxQuantity: Record<string, number | null>;
  };
}

export function guardFor(
  capability: string,
  subscription: Subscription,
  products: Product[],
  item?: SubscriptionItem,
): Guard | null {
  const { status } = subscription;
  const blocked = (reason: string): Guard => ({ reason });

  switch (capability) {
    case CAPABILITIES.pause:
      return status === "active"
        ? null
        : blocked("Only active subscriptions can be paused.");
    case CAPABILITIES.resume:
      return status === "paused"
        ? null
        : blocked("Only paused subscriptions can be resumed.");
    case CAPABILITIES.reactivate:
      return status === "canceled"
        ? null
        : blocked("Only canceled subscriptions can be reactivated.");
    case CAPABILITIES.cancel:
      return status === "canceled"
        ? blocked("This subscription is already canceled.")
        : null;
    case CAPABILITIES.addItem: {
      if (status === "canceled")
        return blocked("Canceled subscriptions cannot be changed.");
      const taken = new Set(subscription.items.map((i) => i.productId));
      return products.some((p) => !taken.has(p.id))
        ? null
        : blocked("Every product is already in this subscription.");
    }
    case CAPABILITIES.removeItem:
      if (status === "canceled")
        return blocked("Canceled subscriptions cannot be changed.");
      return subscription.items.length <= 1 && item
        ? blocked("A subscription needs at least one item.")
        : null;
    case CAPABILITIES.updateQuantity:
      return status === "canceled"
        ? blocked("Canceled subscriptions cannot be changed.")
        : null;
    default:
      return null;
  }
}

function view(
  decision: CapabilityDecision,
  guard: Guard | null,
  limitReason: string | null,
): CapabilityView {
  const base = {
    capability: decision.capability,
    decision,
    ...(guard && { guard }),
  };
  if (!decision.allowed && !decision.reason) {
    return { ...base, availability: "hidden", source: "default" };
  }
  // A guard states a fact about the subscription ("already canceled"), which
  // is truer than any rule's reason, so it wins over a rule's deny.
  if (guard) {
    return {
      ...base,
      availability: "disabled",
      reason: guard.reason,
      source: "guard",
    };
  }
  if (!decision.allowed) {
    return {
      ...base,
      availability: "disabled",
      reason: decision.reason,
      source: "rule",
    };
  }
  if (limitReason) {
    return {
      ...base,
      availability: "disabled",
      reason: limitReason,
      source: "limit",
    };
  }
  return { ...base, availability: "enabled", source: "rule" };
}

/**
 * Combines the workflow's answer with guards and limits into what the portal
 * shows and what server actions enforce. Pure. Precedence:
 * 1. no rule decided (default deny): hidden
 * 2. a guard blocks: disabled with the guard's reason
 * 3. a rule denied: disabled with the rule's reason
 * 4. a limit is reached: disabled with a generated reason
 * 5. otherwise enabled
 */
export function subscriptionView(
  result: EvaluationResult,
  subscription: Subscription,
  products: Product[],
): SubscriptionView {
  const maxItems = result.subject.limits[LIMITS.maxItems]?.value ?? null;

  const capabilities: Record<string, CapabilityView> = {};
  for (const decision of Object.values(result.subject.capabilities)) {
    const atLimit =
      decision.capability === CAPABILITIES.addItem &&
      maxItems !== null &&
      subscription.items.length >= maxItems;
    capabilities[decision.capability] = view(
      decision,
      guardFor(decision.capability, subscription, products),
      atLimit
        ? `You can have up to ${maxItems} items in this subscription.`
        : null,
    );
  }

  const items: SubscriptionView["items"] = {};
  const maxQuantity: Record<string, number | null> = {};
  for (const item of subscription.items) {
    const target = result.children[item.id];
    if (!target) continue;
    maxQuantity[item.id] = target.limits[LIMITS.maxQuantity]?.value ?? null;
    items[item.id] = {};
    for (const decision of Object.values(target.capabilities)) {
      items[item.id][decision.capability] = view(
        decision,
        guardFor(decision.capability, subscription, products, item),
        null,
      );
    }
  }

  return { capabilities, items, limits: { maxItems, maxQuantity } };
}

/** The view for one capability, on the subscription or on one item. */
export function capabilityView(
  view: SubscriptionView,
  capability: string,
  itemId?: string,
): CapabilityView | undefined {
  return itemId
    ? view.items[itemId]?.[capability]
    : view.capabilities[capability];
}
