/** @jest-environment node */
import { evaluate } from "@wb/workflow-engine";
import { subscriptionCatalogue } from "@/catalogue/catalogue";
import { resolveCustomerTargets } from "@/catalogue/preview";
import { runForSubscription } from "../run";
import {
  getPublishedWorkflow,
  listCustomers,
  listSubscriptions,
  resetState,
} from "../store";
import { withTempData } from "./helpers";

const now = new Date("2026-10-12T09:00:00.000Z");
withTempData();
beforeEach(() => resetState(now));

it("gives the builder preview exactly the server's answer for every fixture customer", async () => {
  const workflow = await getPublishedWorkflow("subscription.opened");
  if (!workflow) throw new Error("no published workflow");
  const subscriptions = await listSubscriptions();

  for (const customer of await listCustomers()) {
    const targets = resolveCustomerTargets(
      {
        customer,
        subscriptions: subscriptions.filter(
          (s) => s.customerId === customer.id,
        ),
      },
      now,
    );
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      const preview = evaluate({
        workflow,
        catalogue: subscriptionCatalogue,
        input: target.input,
      });
      const server = await runForSubscription(target.id, now);
      expect(preview).toEqual(server.result);
    }
  }
});
