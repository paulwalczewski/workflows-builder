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

/** What a run needs besides the subscription; shared by every run for a customer. */
export interface RunContext {
  customer: Customer;
  workflow: Workflow;
  products: Product[];
}

export async function loadRunContext(customerId: string): Promise<RunContext> {
  const [customer, workflow, products] = await Promise.all([
    getCustomer(customerId),
    getPublishedWorkflow(TRIGGER_SUBSCRIPTION_OPENED),
    listProducts(),
  ]);
  if (!customer) throw new RunError(`Unknown customer ${customerId}.`);
  if (!workflow)
    throw new RunError("No workflow is published for subscriptions.");
  return { customer, workflow, products };
}

/**
 * The same evaluation for a subscription the caller already holds. Pass a
 * context to reuse it across several subscriptions of one customer.
 */
export async function runFor(
  subscription: Subscription,
  now: Date,
  context?: RunContext,
): Promise<Run> {
  const { customer, workflow, products } =
    context ?? (await loadRunContext(subscription.customerId));
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

/** The log fields every entry about a run starts with. */
export function runLogFields(run: Run) {
  return {
    runId: run.runId,
    at: new Date().toISOString(),
    now: run.now,
    workflowId: run.workflow.id,
    workflowName: run.workflow.name,
    customerId: run.customer.id,
    subscriptionId: run.subscription.id,
  };
}

/** Records a run in the runtime log as an evaluation. */
export async function logEvaluation(run: Run): Promise<void> {
  await writeLog({
    kind: "evaluation",
    ...runLogFields(run),
    facts: run.input,
    result: run.result,
    view: run.view,
  });
}

/** `runForSubscription`, recorded in the runtime log as an evaluation. */
export async function runAndLog(
  subscriptionId: string,
  now: Date,
): Promise<Run> {
  const run = await runForSubscription(subscriptionId, now);
  await logEvaluation(run);
  return run;
}
