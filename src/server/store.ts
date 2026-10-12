import {
  access,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import {
  checkWorkflow,
  type Diagnostic,
  SLUG_PATTERN,
  serializeWorkflow,
  type Workflow,
} from "@wb/workflow-engine";
import { subscriptionCatalogue } from "@/catalogue/catalogue";
import { addDays } from "@/domain/billing";
import type { Customer, Product, Subscription } from "@/domain/types";

/**
 * JSON-file persistence. `data/seed` is committed and never written;
 * `data/state` is created from it on first use or on reset. Every write goes
 * through one in-process queue and lands via write-then-rename, so a reader
 * never sees half a file.
 */

export function dataDir(): string {
  return (
    process.env.DATA_DIR ??
    join(/* turbopackIgnore: true */ process.cwd(), "data")
  );
}

const seedDir = () => join(dataDir(), "seed");
const stateDir = () => join(dataDir(), "state");
const stateFile = (name: string) => join(stateDir(), name);
const workflowsDir = () => join(stateDir(), "workflows");

/** Seed subscriptions carry relative dates and product references only. */
interface SeedSubscription
  extends Omit<Subscription, "nextBillingDate" | "items"> {
  nextBillingInDays: number | null;
  items: { id: string; productId: string; quantity: number }[];
}

let queue: Promise<unknown> = Promise.resolve();

/** Runs `task` after every earlier write has finished. */
function serialised<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function writeAtomic(path: string, text: string): Promise<void> {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, text);
  await rename(tmp, path);
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

export function resetState(now: Date): Promise<void> {
  return serialised(() => writeFreshState(now));
}

async function writeFreshState(now: Date): Promise<void> {
  const products = await readJson<Product[]>(join(seedDir(), "products.json"));
  const customers = await readJson<Customer[]>(
    join(seedDir(), "customers.json"),
  );
  const seedSubscriptions = await readJson<SeedSubscription[]>(
    join(seedDir(), "subscriptions.json"),
  );

  const subscriptions = seedSubscriptions.map(
    ({ nextBillingInDays, items, ...rest }) => ({
      ...rest,
      nextBillingDate:
        nextBillingInDays === null ? null : addDays(now, nextBillingInDays),
      items: items.map((item) => {
        const product = products.find((p) => p.id === item.productId);
        if (!product)
          throw new Error(`Seed item ${item.id} references unknown product.`);
        return {
          id: item.id,
          productId: product.id,
          title: product.title,
          quantity: item.quantity,
          totalPrice: product.unitPrice * item.quantity,
        };
      }),
    }),
  ) satisfies Subscription[];

  // Build the new state beside the old one, then swap, so readers outside
  // the write queue see either the old or the new state, never an empty dir.
  const next = `${stateDir()}.next`;
  const old = `${stateDir()}.old`;
  await rm(next, { recursive: true, force: true });
  await mkdir(join(next, "workflows"), { recursive: true });
  await writeFile(join(next, "customers.json"), json(customers));
  await writeFile(join(next, "products.json"), json(products));
  await writeFile(join(next, "subscriptions.json"), json(subscriptions));
  for (const name of await readdir(join(seedDir(), "workflows"))) {
    if (!name.endsWith(".json")) continue;
    const text = await readFile(join(seedDir(), "workflows", name), "utf8");
    await writeFile(join(next, "workflows", name), text);
  }
  await rm(old, { recursive: true, force: true });
  if (await exists(stateFile("subscriptions.json"))) {
    await rename(stateDir(), old);
  }
  await rename(next, stateDir());
  await rm(old, { recursive: true, force: true });
}

/** Creates state from the seed the first time anything reads it. */
async function ensureState(): Promise<void> {
  if (await exists(stateFile("subscriptions.json"))) return;
  await serialised(async () => {
    if (!(await exists(stateFile("subscriptions.json"))))
      await writeFreshState(new Date());
  });
}

// ---------------------------------------------------------------------------
// Customers, products, subscriptions
// ---------------------------------------------------------------------------

export async function listCustomers(): Promise<Customer[]> {
  await ensureState();
  return readJson<Customer[]>(stateFile("customers.json"));
}

export async function getCustomer(id: string): Promise<Customer | undefined> {
  return (await listCustomers()).find((c) => c.id === id);
}

export async function listProducts(): Promise<Product[]> {
  await ensureState();
  return readJson<Product[]>(stateFile("products.json"));
}

export async function listSubscriptions(): Promise<Subscription[]> {
  await ensureState();
  return readJson<Subscription[]>(stateFile("subscriptions.json"));
}

export async function getSubscription(
  id: string,
): Promise<Subscription | undefined> {
  return (await listSubscriptions()).find((s) => s.id === id);
}

/** Read-modify-write one subscription inside the write queue. */
export async function updateSubscription(
  id: string,
  change: (subscription: Subscription) => Subscription,
): Promise<Subscription> {
  const updated = await transactSubscription(id, async (current) => {
    const next = change(current);
    return { next, result: next };
  });
  if (!updated) throw new Error(`Unknown subscription ${id}.`);
  return updated;
}

/**
 * Runs `decide` against the current subscription while holding the write
 * queue, so whatever it checks still holds when its change is written. It
 * returns the subscription to store (or none, to write nothing) and a result.
 * Resolves to null when the subscription does not exist.
 *
 * `decide` may read through this module (reads never enter the queue), but
 * must not write, or the queue deadlocks.
 */
export async function transactSubscription<T>(
  id: string,
  decide: (
    subscription: Subscription,
  ) => Promise<{ next?: Subscription; result: T }>,
): Promise<T | null> {
  await ensureState();
  return serialised(async () => {
    const all = await readJson<Subscription[]>(stateFile("subscriptions.json"));
    const index = all.findIndex((s) => s.id === id);
    if (index === -1) return null;
    const { next, result } = await decide(structuredClone(all[index]));
    if (next) {
      all[index] = next;
      await writeAtomic(stateFile("subscriptions.json"), json(all));
    }
    return result;
  });
}

// ---------------------------------------------------------------------------
// Workflows
// ---------------------------------------------------------------------------

export class InvalidWorkflowError extends Error {
  constructor(readonly diagnostics: Diagnostic[]) {
    super("The workflow has errors.");
  }
}

export interface BrokenWorkflowFile {
  file: string;
  diagnostics: Diagnostic[];
}

/**
 * Every stored workflow the catalogue accepts, plus the files it rejects.
 * One bad file never takes down the others or the portal.
 */
export async function loadWorkflows(): Promise<{
  workflows: Workflow[];
  broken: BrokenWorkflowFile[];
}> {
  await ensureState();
  const names = (await readdir(workflowsDir()))
    .filter((n) => n.endsWith(".json"))
    .sort();
  const workflows: Workflow[] = [];
  const broken: BrokenWorkflowFile[] = [];
  for (const file of names) {
    let doc: unknown;
    try {
      doc = await readJson<unknown>(join(workflowsDir(), file));
    } catch (error) {
      broken.push({
        file,
        diagnostics: [
          {
            severity: "error",
            code: "schema",
            message: `Not valid JSON: ${(error as Error).message}`,
          },
        ],
      });
      continue;
    }
    const result = checkWorkflow(doc, subscriptionCatalogue);
    if (result.ok) workflows.push(result.workflow);
    else broken.push({ file, diagnostics: result.diagnostics });
  }
  // Published first, then by name.
  workflows.sort(
    (a, b) =>
      Number(b.status === "published") - Number(a.status === "published") ||
      a.name.localeCompare(b.name),
  );
  return { workflows, broken };
}

/** Every id with a stored file, including files that fail to load. */
export async function storedWorkflowIds(): Promise<Set<string>> {
  await ensureState();
  return new Set(
    (await readdir(workflowsDir()))
      .filter((n) => n.endsWith(".json"))
      .map((n) => n.slice(0, -".json".length)),
  );
}

export async function listWorkflows(): Promise<Workflow[]> {
  return (await loadWorkflows()).workflows;
}

const SLUG = new RegExp(SLUG_PATTERN);

/** One workflow, read from its own file (`saveWorkflow` names files by id). */
export async function getWorkflow(id: string): Promise<Workflow | undefined> {
  if (!SLUG.test(id)) return undefined;
  await ensureState();
  let doc: unknown;
  try {
    doc = await readJson<unknown>(join(workflowsDir(), `${id}.json`));
  } catch {
    return undefined;
  }
  const result = checkWorkflow(doc, subscriptionCatalogue);
  return result.ok && result.workflow.id === id ? result.workflow : undefined;
}

export async function getPublishedWorkflow(
  trigger: string,
): Promise<Workflow | undefined> {
  return (await listWorkflows()).find(
    (w) => w.trigger === trigger && w.status === "published",
  );
}

/**
 * Validates and stores a workflow. Errors throw `InvalidWorkflowError`;
 * warnings are allowed through. Saving never changes what is live: the
 * stored status wins (a new workflow starts as a draft), and only
 * `publishWorkflow` publishes.
 */
export async function saveWorkflow(doc: unknown): Promise<Workflow> {
  const result = checkWorkflow(doc, subscriptionCatalogue);
  if (!result.ok) throw new InvalidWorkflowError(result.diagnostics);
  const incoming = result.workflow;
  await ensureState();
  return serialised(async () => {
    const stored = await getWorkflow(incoming.id);
    const workflow: Workflow = {
      ...incoming,
      status: stored?.status ?? "draft",
    };
    await writeAtomic(
      join(workflowsDir(), `${workflow.id}.json`),
      serializeWorkflow(workflow),
    );
    return workflow;
  });
}

/** Publishes one workflow and returns every other one on its trigger to draft. */
export async function publishWorkflow(id: string): Promise<void> {
  await ensureState();
  await serialised(async () => {
    const all = await listWorkflows();
    const target = all.find((w) => w.id === id);
    if (!target) throw new Error(`Unknown workflow ${id}.`);
    for (const workflow of all) {
      if (workflow.trigger !== target.trigger) continue;
      const status = workflow.id === id ? "published" : "draft";
      if (workflow.status === status) continue;
      await writeAtomic(
        join(workflowsDir(), `${workflow.id}.json`),
        serializeWorkflow({ ...workflow, status }),
      );
    }
  });
}

export class WorkflowInUseError extends Error {}

/**
 * Deletes a draft. The published workflow cannot be deleted: the portal
 * would have nothing to run. Reset data brings deleted seeds back.
 */
export async function deleteWorkflow(id: string): Promise<void> {
  await ensureState();
  await serialised(async () => {
    const workflow = await getWorkflow(id);
    if (!workflow) throw new Error(`Unknown workflow ${id}.`);
    if (workflow.status === "published") {
      throw new WorkflowInUseError(
        "The published workflow cannot be deleted. Publish another one first.",
      );
    }
    await rm(join(workflowsDir(), `${workflow.id}.json`));
  });
}
