import { randomUUID } from "node:crypto";
import {
  type EvaluationInput,
  type EvaluationResult,
  evaluate,
  type Workflow,
} from "@wb/workflow-engine";
import {
  subscriptionCatalogue,
  TRIGGER_SUBSCRIPTION_OPENED,
} from "@/catalogue/catalogue";
import { resolveSubscriptionFacts } from "@/catalogue/facts";
import { type SubscriptionView, subscriptionView } from "@/catalogue/guards";
import type { Customer, Product, Subscription } from "@/domain/types";
import { writeLog } from "./logger";
import {
  getCustomer,
  getPublishedWorkflow,
  getSubscription,
  listProducts,
} from "./store";

export interface Run {
  runId: string;
  now: string;
  workflow: Workflow;
  customer: Customer;
  subscription: Subscription;
  products: Product[];
  input: EvaluationInput;
  result: EvaluationResult;
  view: SubscriptionView;
}

export class RunError extends Error {}

/**
 * Evaluates the published workflow for one subscription: load, resolve facts,
 * evaluate, apply guards and limits. Writes nothing; see `runAndLog`.
 */
export async function runForSubscription(
  subscriptionId: string,
  now: Date,
): Promise<Run> {
  const subscription = await getSubscription(subscriptionId);
  if (!subscription)
    throw new RunError(`Unknown subscription ${subscriptionId}.`);
  return runFor(subscription, now);
}

/** The same evaluation for a subscription the caller already holds. */
export async function runFor(
  subscription: Subscription,
  now: Date,
): Promise<Run> {
  const customer = await getCustomer(subscription.customerId);
  if (!customer)
    throw new RunError(`Unknown customer ${subscription.customerId}.`);
  const workflow = await getPublishedWorkflow(TRIGGER_SUBSCRIPTION_OPENED);
  if (!workflow)
    throw new RunError("No workflow is published for subscriptions.");
  const products = await listProducts();

  const input = resolveSubscriptionFacts(customer, subscription, now);
  const result = evaluate({
    workflow,
    catalogue: subscriptionCatalogue,
    input,
  });
  const view = subscriptionView(result, subscription, products);
  return {
    runId: randomUUID(),
    now: now.toISOString(),
    workflow,
    customer,
    subscription,
    products,
    input,
    result,
    view,
  };
}

/** `runForSubscription`, recorded in the runtime log as an evaluation. */
export async function runAndLog(
  subscriptionId: string,
  now: Date,
): Promise<Run> {
  const run = await runForSubscription(subscriptionId, now);
  await writeLog({
    kind: "evaluation",
    runId: run.runId,
    at: new Date().toISOString(),
    now: run.now,
    workflowId: run.workflow.id,
    workflowName: run.workflow.name,
    customerId: run.customer.id,
    subscriptionId: run.subscription.id,
    facts: run.input,
    result: run.result,
    view: run.view,
  });
  return run;
}
