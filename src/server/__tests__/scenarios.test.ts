/** @jest-environment node */
import type { CapabilityView } from "@/catalogue/guards";
import { runForSubscription } from "../run";
import { publishWorkflow, resetState, updateSubscription } from "../store";
import { withTempData } from "./helpers";

/**
 * The seed table from PLAN.md, end to end through store, facts, engine,
 * guards and limits. "Same published workflow, different customers,
 * different capabilities, and you can see which rule decided."
 */

const now = new Date("2026-10-12T09:00:00.000Z");
withTempData();

beforeEach(() => resetState(now));

const summary = (view: CapabilityView | undefined) =>
  view && {
    availability: view.availability,
    reason: view.reason,
    source: view.source,
    rule: view.decision.decidedBy?.ruleId ?? null,
  };

async function capabilities(subscriptionId: string) {
  const run = await runForSubscription(subscriptionId, now);
  return {
    run,
    sub: (capability: string) => summary(run.view.capabilities[capability]),
    item: (itemId: string, capability: string) =>
      summary(run.view.items[itemId]?.[capability]),
  };
}

describe("Standard workflow", () => {
  beforeEach(() => publishWorkflow("standard"));

  it("lets Anna cancel her big pantry subscription (rule 3) but not her small coffee one", async () => {
    const pantry = await capabilities("anna-pantry");
    expect(pantry.run.workflow.id).toBe("standard");
    expect(pantry.sub("subscription.cancel")).toEqual({
      availability: "enabled",
      reason: undefined,
      source: "rule",
      rule: "loyal-can-cancel",
    });
    expect(pantry.sub("item.add")?.availability).toBe("enabled");
    expect(pantry.item("anna-pantry-oil", "item.remove")?.availability).toBe(
      "enabled",
    );
    expect(pantry.run.view.limits).toEqual({
      maxItems: 4,
      maxQuantity: {
        "anna-pantry-oil": 5,
        "anna-pantry-coffee": 5,
        "anna-pantry-granola": 5,
      },
    });

    const coffee = await capabilities("anna-coffee");
    expect(coffee.sub("subscription.cancel")).toEqual({
      availability: "disabled",
      reason: "Please contact support to cancel.",
      source: "rule",
      rule: "baseline",
    });
  });

  it("sends Ben, in his first cycle, to support (rule 4), with the baseline deny overridden", async () => {
    const ben = await capabilities("ben-coffee");
    expect(ben.sub("subscription.cancel")).toEqual({
      availability: "disabled",
      reason: "In your first cycle, please contact support to cancel.",
      source: "rule",
      rule: "first-cycle-support",
    });
    expect(
      ben.run.result.subject.capabilities["subscription.cancel"].overridden.map(
        (o) => o.ruleId,
      ),
    ).toEqual(["baseline"]);
    expect(ben.sub("subscription.pause")?.availability).toBe("hidden");
  });

  it("only lets Ben reactivate his canceled tea subscription", async () => {
    const tea = await capabilities("ben-tea");
    const canceled = "Canceled subscriptions cannot be changed.";
    expect(tea.sub("subscription.reactivate")?.availability).toBe("enabled");
    expect(tea.sub("subscription.resume")).toMatchObject({
      availability: "disabled",
      source: "guard",
      reason: "Only paused subscriptions can be resumed.",
      rule: "baseline",
    });
    expect(tea.sub("subscription.cancel")).toMatchObject({
      availability: "disabled",
      source: "guard",
      reason: "This subscription is already canceled.",
    });
    expect(tea.sub("item.add")).toMatchObject({
      availability: "disabled",
      source: "guard",
      reason: canceled,
    });
    expect(tea.item("ben-tea-green", "item.updateQuantity")).toMatchObject({
      availability: "disabled",
      source: "guard",
      reason: canceled,
    });
  });

  it("locks Carla down to updating her payment method (rule 1)", async () => {
    const carla = await capabilities("carla-tea");
    const reason =
      "Your last payment failed. Update your payment method to continue.";
    expect(carla.sub("payment.update")).toMatchObject({
      availability: "enabled",
      rule: "payment-failed",
    });
    expect(carla.sub("subscription.cancel")).toMatchObject({
      availability: "disabled",
      reason,
    });
    expect(carla.sub("item.add")).toMatchObject({
      availability: "disabled",
      reason,
    });
    expect(carla.item("carla-tea-green", "item.remove")).toMatchObject({
      availability: "disabled",
      reason,
      rule: "payment-failed",
    });
    // Status changes that make no sense for a failed subscription show the
    // guard's reason instead of the lockdown's.
    expect(carla.sub("subscription.resume")).toMatchObject({
      availability: "disabled",
      source: "guard",
      reason: "Only paused subscriptions can be resumed.",
      rule: "payment-failed",
    });
    expect(carla.sub("subscription.pause")).toMatchObject({
      availability: "disabled",
      source: "guard",
    });
    // The renewal lock also matched (renewal in 1 day) but came too late.
    expect(
      carla.run.result.children["carla-tea-green"].capabilities[
        "item.remove"
      ].overridden.map((o) => o.ruleId),
    ).toEqual(["renewal-lock", "baseline"]);
  });

  it("locks Dan's item edits the day before renewal (rule 2)", async () => {
    const dan = await capabilities("dan-box");
    const reason =
      "Item changes are locked in the 2 days before renewal, so the right box ships.";
    expect(dan.sub("item.add")).toMatchObject({
      availability: "disabled",
      reason,
      rule: "renewal-lock",
    });
    expect(dan.item("dan-box-coffee", "item.updateQuantity")).toMatchObject({
      availability: "disabled",
      reason,
    });
    expect(dan.sub("payment.update")?.availability).toBe("enabled");
  });

  it("lets Dan resume his paused snacks, but not remove their only item", async () => {
    const snacks = await capabilities("dan-snacks");
    expect(snacks.sub("subscription.resume")?.availability).toBe("enabled");
    // No rule mentions pause for a standard customer: default deny hides it.
    expect(snacks.sub("subscription.pause")).toMatchObject({
      availability: "hidden",
      source: "default",
    });
    expect(snacks.item("dan-snacks-chocolate", "item.remove")).toMatchObject({
      availability: "disabled",
      source: "guard",
      reason: "A subscription needs at least one item.",
    });
  });

  it("gives Eve (Pro) pause and six items, but keeps her premium cheese (rule 6)", async () => {
    const eve = await capabilities("eve-deli");
    expect(eve.sub("subscription.pause")).toMatchObject({
      availability: "enabled",
      rule: "pro-perks",
    });
    expect(eve.run.view.limits.maxItems).toBe(6);
    expect(eve.item("eve-deli-cheese", "item.remove")).toMatchObject({
      availability: "disabled",
      reason: "Premium items can only be removed by our support team.",
      rule: "premium-items-stay",
    });
    expect(eve.item("eve-deli-oil", "item.remove")?.availability).toBe(
      "enabled",
    );
    expect(eve.sub("subscription.cancel")?.rule).toBe("baseline");
  });
});

describe("limits (Standard)", () => {
  beforeEach(() => publishWorkflow("standard"));

  it("disables adding once the item limit is reached", async () => {
    await updateSubscription("anna-pantry", (s) => ({
      ...s,
      items: [
        ...s.items,
        {
          id: "x",
          productId: "oat-milk",
          title: "Oat Milk",
          quantity: 1,
          totalPrice: 300,
        },
      ],
    }));
    const pantry = await capabilities("anna-pantry");
    expect(pantry.sub("item.add")).toMatchObject({
      availability: "disabled",
      source: "limit",
      reason: "You can have up to 4 items in this subscription.",
      rule: "baseline",
    });
  });
});

describe("Starter workflow (the seeded default)", () => {
  it("is what the portal runs after a reset", async () => {
    const anna = await capabilities("anna-pantry");
    expect(anna.run.workflow.id).toBe("starter");
  });

  it("lets Anna cancel but sends Ben, in his first cycle, to support", async () => {
    expect(
      (await capabilities("anna-pantry")).sub("subscription.cancel"),
    ).toMatchObject({
      availability: "enabled",
      rule: "baseline",
    });
    expect(
      (await capabilities("ben-coffee")).sub("subscription.cancel"),
    ).toMatchObject({
      availability: "disabled",
      reason: "In your first cycle, please contact support to cancel.",
      rule: "first-cycle-support",
    });
  });

  it("allows up to 5 items and 10 of each", async () => {
    const pantry = await capabilities("anna-pantry");
    expect(pantry.run.view.limits.maxItems).toBe(5);
    expect(pantry.run.view.limits.maxQuantity["anna-pantry-oil"]).toBe(10);
  });
});
