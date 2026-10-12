/** @jest-environment node */
import { readLog } from "../logger";
import { performAction } from "../perform";
import { getSubscription, publishWorkflow, resetState } from "../store";
import { withTempData } from "./helpers";

const now = new Date("2026-10-12T09:00:00.000Z");
const later = (days: number) =>
  new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
withTempData();
// These tests exercise Standard's rules (renewal lock, limits, lockdown).
beforeEach(async () => {
  await resetState(now);
  await publishWorkflow("standard");
});

describe("performAction", () => {
  it("performs an enabled action, saves it, and logs it", async () => {
    const outcome = await performAction(
      {
        subscriptionId: "anna-pantry",
        action: { capability: "subscription.cancel" },
      },
      now,
    );
    expect(outcome).toMatchObject({
      ok: true,
      message: "Subscription canceled.",
    });
    expect((await getSubscription("anna-pantry"))?.status).toBe("canceled");
    const [entry] = await readLog({ subscriptionId: "anna-pantry" });
    expect(entry).toMatchObject({
      kind: "action",
      outcome: "performed",
      action: { capability: "subscription.cancel" },
      workflowId: "standard",
    });
    expect(entry.kind === "action" && entry.result.trace).toHaveLength(7);
  });

  it("refuses what the workflow denies, with its reason, and changes nothing", async () => {
    const outcome = await performAction(
      {
        subscriptionId: "ben-coffee",
        action: { capability: "subscription.cancel" },
      },
      now,
    );
    expect(outcome).toMatchObject({
      ok: false,
      reason: "In your first cycle, please contact support to cancel.",
    });
    expect((await getSubscription("ben-coffee"))?.status).toBe("active");
    const [entry] = await readLog({ subscriptionId: "ben-coffee" });
    expect(entry).toMatchObject({
      outcome: "refused",
      decision: { decision: { decidedBy: { ruleId: "first-cycle-support" } } },
    });
  });

  it("refuses capabilities that are hidden by default deny", async () => {
    const outcome = await performAction(
      {
        subscriptionId: "ben-coffee",
        action: { capability: "subscription.pause" },
      },
      now,
    );
    expect(outcome).toEqual({
      ok: false,
      reason: "This is not available for your subscription.",
      runId: expect.any(String),
    });
  });

  it("re-evaluates at the requested time: Anna's pantry locks 2 days before renewal", async () => {
    const action = {
      capability: "item.updateQuantity" as const,
      itemId: "anna-pantry-coffee",
      quantity: 2,
    };
    expect(
      (await performAction({ subscriptionId: "anna-pantry", action }, now)).ok,
    ).toBe(true);
    expect(
      await performAction({ subscriptionId: "anna-pantry", action }, later(11)),
    ).toMatchObject({
      ok: false,
      reason:
        "Item changes are locked in the 2 days before renewal, so the right box ships.",
    });
  });

  it("enforces limits on the server, not just in the UI", async () => {
    const quantity = await performAction(
      {
        subscriptionId: "anna-pantry",
        action: {
          capability: "item.updateQuantity",
          itemId: "anna-pantry-coffee",
          quantity: 6,
        },
      },
      now,
    );
    expect(quantity).toMatchObject({
      ok: false,
      reason: "Quantity can be at most 5.",
    });
    const [entry] = await readLog({ subscriptionId: "anna-pantry" });
    expect(entry).toMatchObject({ outcome: "invalid" });

    await performAction(
      {
        subscriptionId: "anna-pantry",
        action: { capability: "item.add", productId: "oat-milk" },
      },
      now,
    );
    const fifth = await performAction(
      {
        subscriptionId: "anna-pantry",
        action: { capability: "item.add", productId: "green-tea" },
      },
      now,
    );
    expect(fifth).toMatchObject({
      ok: false,
      reason: "You can have up to 4 items in this subscription.",
    });
  });

  it("lets Carla recover by updating her card, which then unlocks the rest", async () => {
    const refused = await performAction(
      {
        subscriptionId: "carla-tea",
        action: { capability: "subscription.cancel" },
      },
      now,
    );
    expect(refused.ok).toBe(false);
    const paid = await performAction(
      {
        subscriptionId: "carla-tea",
        action: { capability: "payment.update", brand: "Visa", last4: "1111" },
      },
      now,
    );
    expect(paid.ok).toBe(true);
    expect(await getSubscription("carla-tea")).toMatchObject({
      status: "active",
      currentCycle: 4,
    });
  });

  it("holds its checks under concurrent requests", async () => {
    const ben = await getSubscription("ben-coffee");
    const removals = await Promise.all(
      (ben?.items ?? []).map((item) =>
        performAction(
          {
            subscriptionId: "ben-coffee",
            action: { capability: "item.remove", itemId: item.id },
          },
          now,
        ),
      ),
    );
    expect(removals.filter((o) => o.ok)).toHaveLength(1);
    expect(removals.find((o) => !o.ok)).toMatchObject({
      reason: "A subscription needs at least one item.",
    });
    expect((await getSubscription("ben-coffee"))?.items).toHaveLength(1);

    const adds = await Promise.all(
      ["oat-milk", "green-tea", "chocolate"].map((productId) =>
        performAction(
          {
            subscriptionId: "anna-pantry",
            action: { capability: "item.add", productId },
          },
          now,
        ),
      ),
    );
    expect(adds.filter((o) => o.ok)).toHaveLength(1);
    expect((await getSubscription("anna-pantry"))?.items).toHaveLength(4);

    const cancels = await Promise.all(
      [1, 2].map(() =>
        performAction(
          {
            subscriptionId: "anna-pantry",
            action: { capability: "subscription.cancel" },
          },
          now,
        ),
      ),
    );
    expect(cancels.filter((o) => o.ok)).toHaveLength(1);
  });

  it("reports an unknown subscription without throwing", async () => {
    expect(
      await performAction(
        {
          subscriptionId: "nope",
          action: { capability: "subscription.cancel" },
        },
        now,
      ),
    ).toEqual({ ok: false, reason: "Unknown subscription nope." });
  });
});
