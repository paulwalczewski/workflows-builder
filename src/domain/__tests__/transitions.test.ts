/** @jest-environment node */
import { applyAction, parseAction } from "../transitions";
import type { Product, Subscription } from "../types";

const now = new Date("2026-10-12T09:00:00.000Z");
const products: Product[] = [
  { id: "coffee", title: "Coffee", unitPrice: 1200, currencyCode: "EUR" },
  { id: "tea", title: "Tea", unitPrice: 950, currencyCode: "EUR" },
  { id: "yen-tea", title: "Matcha", unitPrice: 1500, currencyCode: "JPY" },
];
const base: Subscription = {
  id: "s1",
  customerId: "c",
  status: "active",
  currentCycle: 2,
  nextBillingDate: "2026-10-20T09:00:00.000Z",
  billingPolicy: { interval: "month", intervalCount: 1 },
  currencyCode: "EUR",
  paymentMethod: { brand: "Visa", last4: "4242" },
  items: [
    {
      id: "i1",
      productId: "coffee",
      title: "Coffee",
      quantity: 2,
      totalPrice: 2400,
    },
  ],
};
const ctx = { products, now };

const next = (result: ReturnType<typeof applyAction>) => {
  if (!result.ok) throw new Error(result.reason);
  return result.subscription;
};

describe("status changes", () => {
  it("cancel and pause stop billing", () => {
    expect(
      next(applyAction(base, { capability: "subscription.cancel" }, ctx)),
    ).toMatchObject({
      status: "canceled",
      nextBillingDate: null,
    });
    expect(
      next(applyAction(base, { capability: "subscription.pause" }, ctx)),
    ).toMatchObject({
      status: "paused",
      nextBillingDate: null,
    });
  });

  it("resume and reactivate schedule the next billing one period from now", () => {
    for (const capability of [
      "subscription.resume",
      "subscription.reactivate",
    ] as const) {
      expect(
        next(
          applyAction(
            { ...base, status: "paused", nextBillingDate: null },
            { capability },
            ctx,
          ),
        ),
      ).toMatchObject({
        status: "active",
        nextBillingDate: "2026-11-12T09:00:00.000Z",
      });
    }
  });
});

describe("items", () => {
  it("adds a product as one unit priced in minor units", () => {
    const added = next(
      applyAction(base, { capability: "item.add", productId: "tea" }, ctx),
    );
    expect(added.items.at(-1)).toEqual({
      id: "s1-tea",
      productId: "tea",
      title: "Tea",
      quantity: 1,
      totalPrice: 950,
    });
  });

  it("refuses unknown, duplicate or foreign-currency products", () => {
    for (const productId of ["nope", "coffee", "yen-tea"]) {
      expect(
        applyAction(base, { capability: "item.add", productId }, ctx).ok,
      ).toBe(false);
    }
  });

  it("recomputes the price from the unit price when the quantity changes", () => {
    const changed = next(
      applyAction(
        base,
        { capability: "item.updateQuantity", itemId: "i1", quantity: 5 },
        ctx,
      ),
    );
    expect(changed.items[0]).toMatchObject({ quantity: 5, totalPrice: 6000 });
  });

  it("enforces whole quantities within the limit", () => {
    const set = (quantity: number, maxQuantity?: number) =>
      applyAction(
        base,
        { capability: "item.updateQuantity", itemId: "i1", quantity },
        { ...ctx, maxQuantity },
      );
    expect(set(0).ok).toBe(false);
    expect(set(1.5).ok).toBe(false);
    expect(set(6, 5)).toEqual({
      ok: false,
      reason: "Quantity can be at most 5.",
    });
    expect(set(5, 5).ok).toBe(true);
    expect(set(100).ok).toBe(false);
  });

  it("removes an item", () => {
    expect(
      next(applyAction(base, { capability: "item.remove", itemId: "i1" }, ctx))
        .items,
    ).toEqual([]);
    expect(
      applyAction(base, { capability: "item.remove", itemId: "zz" }, ctx).ok,
    ).toBe(false);
  });
});

describe("payment", () => {
  it("validates the card details", () => {
    expect(
      applyAction(
        base,
        { capability: "payment.update", brand: "Visa", last4: "12a4" },
        ctx,
      ).ok,
    ).toBe(false);
  });

  it("recovers a failed subscription as a successful billing", () => {
    const failed = { ...base, status: "failed" as const };
    expect(
      next(
        applyAction(
          failed,
          { capability: "payment.update", brand: "Amex", last4: "0005" },
          ctx,
        ),
      ),
    ).toMatchObject({
      status: "active",
      currentCycle: 3,
      paymentMethod: { brand: "Amex", last4: "0005" },
      nextBillingDate: "2026-11-12T09:00:00.000Z",
    });
  });
});

describe("parseAction", () => {
  it("accepts well-formed actions and drops extra fields", () => {
    expect(
      parseAction({ capability: "item.remove", itemId: "i1", sneaky: true }),
    ).toEqual({ capability: "item.remove", itemId: "i1" });
  });

  it.each([
    null,
    "subscription.cancel",
    { capability: "subscription.explode" },
    { capability: "item.add" },
    { capability: "item.updateQuantity", itemId: "i1", quantity: "5" },
    { capability: "payment.update", brand: "Visa" },
  ])("rejects %p", (raw) => {
    expect(parseAction(raw)).toBeNull();
  });
});
