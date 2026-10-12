/** @jest-environment node */
import {
  addBillingPeriod,
  cycleTotal,
  daysUntilRenewal,
  formatMoney,
  monthlySpend,
} from "../billing";
import type { Subscription } from "../types";

const subscription = (overrides: Partial<Subscription> = {}): Subscription => ({
  id: "s",
  customerId: "c",
  status: "active",
  currentCycle: 1,
  nextBillingDate: "2026-10-14T12:00:00.000Z",
  billingPolicy: { interval: "month", intervalCount: 1 },
  currencyCode: "EUR",
  paymentMethod: { brand: "Visa", last4: "4242" },
  items: [
    { id: "a", productId: "p", title: "A", quantity: 2, totalPrice: 2400 },
    { id: "b", productId: "q", title: "B", quantity: 1, totalPrice: 600 },
  ],
  ...overrides,
});

describe("monthlySpend", () => {
  it.each([
    ["month", 1, 3000],
    ["month", 3, 1000],
    ["week", 1, 13000],
    ["week", 2, 6500],
    ["day", 1, 91250],
    ["year", 1, 250],
  ] as const)("normalises every %s x%i to a month", (interval, intervalCount, expected) => {
    expect(
      monthlySpend(
        subscription({ billingPolicy: { interval, intervalCount } }),
      ),
    ).toBe(expected);
  });

  it("sums item prices per cycle", () => {
    expect(cycleTotal(subscription())).toBe(3000);
  });
});

describe("daysUntilRenewal", () => {
  const now = new Date("2026-10-12T12:00:00.000Z");

  it("rounds partial days up", () => {
    expect(daysUntilRenewal(subscription(), now)).toBe(2);
    expect(
      daysUntilRenewal(
        subscription({ nextBillingDate: "2026-10-14T19:00:00.000Z" }),
        now,
      ),
    ).toBe(3);
    expect(
      daysUntilRenewal(
        subscription({ nextBillingDate: "2026-10-13T00:00:00.000Z" }),
        now,
      ),
    ).toBe(1);
  });

  it("is zero or negative once the renewal is due", () => {
    expect(
      daysUntilRenewal(
        subscription({ nextBillingDate: "2026-10-12T12:00:00.000Z" }),
        now,
      ),
    ).toBe(0);
    expect(
      daysUntilRenewal(
        subscription({ nextBillingDate: "2026-10-10T12:00:00.000Z" }),
        now,
      ),
    ).toBe(-2);
  });

  it("is null when nothing is scheduled", () => {
    expect(
      daysUntilRenewal(subscription({ nextBillingDate: null }), now),
    ).toBeNull();
  });
});

describe("money", () => {
  it("keeps every amount an integer number of minor units", () => {
    const odd = subscription({
      billingPolicy: { interval: "week", intervalCount: 3 },
      items: [
        { id: "a", productId: "p", title: "A", quantity: 3, totalPrice: 2850 },
      ],
    });
    expect(Number.isInteger(monthlySpend(odd))).toBe(true);
    expect(monthlySpend(odd)).toBe(4117);
  });

  it("formats minor units in the currency's own precision", () => {
    expect(formatMoney(950, "EUR")).toBe("€9.50");
    expect(formatMoney(950, "JPY")).toBe("JP¥950");
  });
});

describe("addBillingPeriod", () => {
  it("adds one full policy period", () => {
    const from = new Date("2026-01-31T00:00:00.000Z");
    expect(addBillingPeriod(from, { interval: "week", intervalCount: 2 })).toBe(
      "2026-02-14T00:00:00.000Z",
    );
    expect(addBillingPeriod(from, { interval: "year", intervalCount: 1 })).toBe(
      "2027-01-31T00:00:00.000Z",
    );
  });
});
