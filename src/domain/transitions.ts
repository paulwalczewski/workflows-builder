import { addBillingPeriod, unitPrice } from "./billing";
import type { Product, Subscription } from "./types";

/**
 * What a customer can ask to happen to a subscription. Capability ids double
 * as action names so the server can check "is this capability enabled?"
 * before applying the change.
 */
export type SubscriptionAction =
  | { capability: "subscription.cancel" }
  | { capability: "subscription.pause" }
  | { capability: "subscription.resume" }
  | { capability: "subscription.reactivate" }
  | { capability: "item.add"; productId: string }
  | { capability: "item.remove"; itemId: string }
  | { capability: "item.updateQuantity"; itemId: string; quantity: number }
  | { capability: "payment.update"; brand: string; last4: string };

export type TransitionResult =
  | { ok: true; subscription: Subscription; message: string }
  | { ok: false; reason: string };

/** The hard ceiling on any quantity, whatever a workflow says. */
export const MAX_QUANTITY = 99;

/** The highest quantity allowed, given the workflow's limit (null: none). */
export function quantityCeiling(limit: number | null | undefined): number {
  return Math.min(limit ?? MAX_QUANTITY, MAX_QUANTITY);
}

/** Products that can still be added: same currency, not already in it. */
export function addableProducts(
  subscription: Subscription,
  products: Product[],
): Product[] {
  return products.filter(
    (p) =>
      p.currencyCode === subscription.currencyCode &&
      !subscription.items.some((i) => i.productId === p.id),
  );
}

/**
 * Applies one action to a subscription. Pure; assumes the capability check
 * already passed and only validates the action's own input.
 */
export function applyAction(
  subscription: Subscription,
  action: SubscriptionAction,
  {
    products,
    now,
    maxQuantity,
  }: { products: Product[]; now: Date; maxQuantity?: number | null },
): TransitionResult {
  const ok = (next: Subscription, message: string): TransitionResult => ({
    ok: true,
    subscription: next,
    message,
  });
  const fail = (reason: string): TransitionResult => ({ ok: false, reason });

  switch (action.capability) {
    case "subscription.cancel":
      return ok(
        { ...subscription, status: "canceled", nextBillingDate: null },
        "Subscription canceled.",
      );
    case "subscription.pause":
      return ok(
        { ...subscription, status: "paused", nextBillingDate: null },
        "Subscription paused.",
      );
    case "subscription.resume":
      return ok(
        {
          ...subscription,
          status: "active",
          nextBillingDate: addBillingPeriod(now, subscription.billingPolicy),
        },
        "Subscription resumed.",
      );
    case "subscription.reactivate":
      return ok(
        {
          ...subscription,
          status: "active",
          nextBillingDate: addBillingPeriod(now, subscription.billingPolicy),
        },
        "Subscription reactivated.",
      );
    case "item.add": {
      const product = products.find((p) => p.id === action.productId);
      if (!product) return fail("That product does not exist.");
      if (product.currencyCode !== subscription.currencyCode) {
        return fail("That product is sold in a different currency.");
      }
      if (subscription.items.some((i) => i.productId === product.id)) {
        return fail(
          "That product is already in this subscription. Change its quantity instead.",
        );
      }
      return ok(
        {
          ...subscription,
          items: [
            ...subscription.items,
            {
              id: `${subscription.id}-${product.id}`,
              productId: product.id,
              title: product.title,
              quantity: 1,
              totalPrice: product.unitPrice,
            },
          ],
        },
        `${product.title} added.`,
      );
    }
    case "item.remove": {
      const item = subscription.items.find((i) => i.id === action.itemId);
      if (!item) return fail("That item is not in this subscription.");
      return ok(
        {
          ...subscription,
          items: subscription.items.filter((i) => i.id !== item.id),
        },
        `${item.title} removed.`,
      );
    }
    case "item.updateQuantity": {
      const item = subscription.items.find((i) => i.id === action.itemId);
      if (!item) return fail("That item is not in this subscription.");
      const ceiling = quantityCeiling(maxQuantity);
      if (!Number.isInteger(action.quantity) || action.quantity < 1) {
        return fail("Quantity must be a whole number of at least 1.");
      }
      if (action.quantity > ceiling)
        return fail(`Quantity can be at most ${ceiling}.`);
      const product = products.find((p) => p.id === item.productId);
      const price = product ? product.unitPrice : unitPrice(item);
      return ok(
        {
          ...subscription,
          items: subscription.items.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  quantity: action.quantity,
                  totalPrice: price * action.quantity,
                }
              : i,
          ),
        },
        `${item.title} quantity set to ${action.quantity}.`,
      );
    }
    case "payment.update": {
      const brand = action.brand.trim();
      if (!brand) return fail("Choose a card brand.");
      if (!/^\d{4}$/.test(action.last4))
        return fail("Enter the last 4 digits of the card.");
      const paymentMethod = { brand, last4: action.last4 };
      if (subscription.status !== "failed") {
        return ok(
          { ...subscription, paymentMethod },
          "Payment method updated.",
        );
      }
      // Simulates the retried billing succeeding with the new card.
      return ok(
        {
          ...subscription,
          paymentMethod,
          status: "active",
          currentCycle: subscription.currentCycle + 1,
          nextBillingDate: addBillingPeriod(now, subscription.billingPolicy),
        },
        "Payment method updated and the failed payment went through.",
      );
    }
  }
}

const str = (value: unknown): value is string => typeof value === "string";

/**
 * Narrows untrusted input (a server action can be called with any body) to a
 * well-formed action. Business validation stays in `applyAction`.
 */
export function parseAction(raw: unknown): SubscriptionAction | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  switch (value.capability) {
    case "subscription.cancel":
    case "subscription.pause":
    case "subscription.resume":
    case "subscription.reactivate":
      return { capability: value.capability };
    case "item.add":
      return str(value.productId)
        ? { capability: value.capability, productId: value.productId }
        : null;
    case "item.remove":
      return str(value.itemId)
        ? { capability: value.capability, itemId: value.itemId }
        : null;
    case "item.updateQuantity":
      return str(value.itemId) && typeof value.quantity === "number"
        ? {
            capability: value.capability,
            itemId: value.itemId,
            quantity: value.quantity,
          }
        : null;
    case "payment.update":
      return str(value.brand) && str(value.last4)
        ? {
            capability: value.capability,
            brand: value.brand,
            last4: value.last4,
          }
        : null;
    default:
      return null;
  }
}
