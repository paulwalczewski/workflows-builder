/** @jest-environment node */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildCatalogueSchema,
  checkWorkflow,
  serializeWorkflow,
  type Workflow,
} from "@wb/workflow-engine";
import { subscriptionCatalogue } from "@/catalogue/catalogue";
import { readLog } from "../logger";
import { runAndLog } from "../run";
import {
  deleteWorkflow,
  getPublishedWorkflow,
  getSubscription,
  getWorkflow,
  InvalidWorkflowError,
  listWorkflows,
  loadWorkflows,
  publishWorkflow,
  resetState,
  saveWorkflow,
  updateSubscription,
  WorkflowInUseError,
} from "../store";
import { withTempData } from "./helpers";

const now = new Date("2026-10-12T09:00:00.000Z");
const temp = withTempData();
beforeEach(() => resetState(now));

describe("reset", () => {
  it("resolves relative seed dates and derives item titles and prices", async () => {
    const dan = await getSubscription("dan-box");
    expect(dan?.nextBillingDate).toBe("2026-10-13T09:00:00.000Z");
    expect(dan?.items[0]).toEqual({
      id: "dan-box-coffee",
      productId: "house-coffee",
      title: "House Coffee Blend",
      quantity: 3,
      totalPrice: 3600,
    });
    expect((await getSubscription("dan-snacks"))?.nextBillingDate).toBeNull();
  });

  it("restores changed state", async () => {
    await updateSubscription("anna-pantry", (s) => ({
      ...s,
      status: "canceled",
    }));
    expect((await getSubscription("anna-pantry"))?.status).toBe("canceled");
    await resetState(now);
    expect((await getSubscription("anna-pantry"))?.status).toBe("active");
  });
});

describe("seed workflows", () => {
  it.each([
    "starter",
    "standard",
  ])("%s passes every check and is stored canonically", async (id) => {
    const path = join(process.cwd(), "data", "seed", "workflows", `${id}.json`);
    const text = await readFile(path, "utf8");
    const result = checkWorkflow(JSON.parse(text), subscriptionCatalogue);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual(
      [],
    );
    expect(serializeWorkflow(result.workflow as Workflow)).toBe(text);
  });

  it("seeds Starter as the published default and Standard as a draft", async () => {
    expect((await listWorkflows()).map((w) => [w.id, w.status])).toEqual([
      ["starter", "published"],
      ["standard", "draft"],
    ]);
  });

  it("warns when an unconditional rule shadows Pro's pause allowance", async () => {
    const standard = (await getWorkflow("standard")) as Workflow;
    const noPause = {
      id: "no-pause",
      name: "No pausing",
      when: { match: "all" as const, conditions: [] },
      then: [
        {
          type: "capability.deny" as const,
          capabilities: ["subscription.pause"],
          reason: "Not now.",
        },
      ],
    };
    const result = checkWorkflow(
      { ...standard, rules: [noPause, ...standard.rules] },
      subscriptionCatalogue,
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        code: "shadowed",
        ruleId: "pro-perks",
      }),
    );
  });
});

describe("workflows", () => {
  it("publishes one workflow per trigger", async () => {
    expect((await getPublishedWorkflow("subscription.opened"))?.id).toBe(
      "starter",
    );
    await publishWorkflow("standard");
    const statuses = Object.fromEntries(
      (await listWorkflows()).map((w) => [w.id, w.status]),
    );
    expect(statuses).toEqual({
      standard: "published",
      starter: "draft",
    });
  });

  it("never publishes on save: the stored status wins, new workflows are drafts", async () => {
    const standard = (await getWorkflow("standard")) as Workflow;
    await saveWorkflow({ ...standard, status: "published" });
    await saveWorkflow({ ...standard, id: "copy", status: "published" });
    const statuses = Object.fromEntries(
      (await listWorkflows()).map((w) => [w.id, w.status]),
    );
    expect(statuses).toEqual({
      copy: "draft",
      standard: "draft",
      starter: "published",
    });
  });

  it("skips a broken workflow file and reports it", async () => {
    await writeFile(
      join(temp.dir(), "state", "workflows", "broken.json"),
      "{ nope",
    );
    await writeFile(
      join(temp.dir(), "state", "workflows", "wrong.json"),
      JSON.stringify({ hello: "world" }),
    );
    const { workflows, broken } = await loadWorkflows();
    expect(workflows.map((w) => w.id)).toEqual(["starter", "standard"]);
    expect(broken.map((b) => b.file)).toEqual(["broken.json", "wrong.json"]);
    expect((await getPublishedWorkflow("subscription.opened"))?.id).toBe(
      "starter",
    );
  });

  it("deletes drafts but never the published workflow", async () => {
    await expect(deleteWorkflow("starter")).rejects.toBeInstanceOf(
      WorkflowInUseError,
    );
    await deleteWorkflow("standard");
    expect((await listWorkflows()).map((w) => w.id)).toEqual(["starter"]);
    await resetState(now);
    expect((await listWorkflows()).map((w) => w.id)).toEqual([
      "starter",
      "standard",
    ]);
  });

  it("refuses to save a workflow with errors and keeps the stored one", async () => {
    const standard = (await getWorkflow("standard")) as Workflow;
    const broken = { ...standard, trigger: "nope" };
    await expect(saveWorkflow(broken)).rejects.toBeInstanceOf(
      InvalidWorkflowError,
    );
    expect((await getWorkflow("standard"))?.trigger).toBe(
      "subscription.opened",
    );
  });

  it("saves an untouched workflow byte for byte", async () => {
    const path = join(temp.dir(), "state", "workflows", "standard.json");
    const before = await readFile(path, "utf8");
    await saveWorkflow(JSON.parse(before));
    expect(await readFile(path, "utf8")).toBe(before);
  });

  it("feeds an edited workflow straight into the next run (round trip)", async () => {
    const standard = (await getWorkflow("standard")) as Workflow;
    const edited: Workflow = {
      ...standard,
      rules: [
        {
          id: "everyone-cancels",
          name: "Everyone can cancel",
          when: { match: "all", conditions: [] },
          then: [
            { type: "capability.allow", capabilities: ["subscription.cancel"] },
          ],
        },
        ...standard.rules,
      ],
    };
    await saveWorkflow(JSON.parse(JSON.stringify(edited)));
    await publishWorkflow("standard");
    const run = await runAndLog("ben-coffee", now);
    expect(run.view.capabilities["subscription.cancel"]).toMatchObject({
      availability: "enabled",
      decision: { decidedBy: { ruleId: "everyone-cancels" } },
    });
  });
});

describe("runtime log", () => {
  it("writes one evaluation line per run with the trace", async () => {
    const run = await runAndLog("anna-pantry", now);
    const [entry] = await readLog();
    expect(entry).toMatchObject({
      kind: "evaluation",
      runId: run.runId,
      workflowId: "starter",
      customerId: "anna",
      subscriptionId: "anna-pantry",
      now: now.toISOString(),
    });
    expect(entry.kind === "evaluation" && entry.result.trace).toHaveLength(2);
  });
});

describe("catalogue JSON Schema", () => {
  const schemaFile = join(
    process.cwd(),
    "data",
    "schema",
    "subscriptions.workflow.schema.json",
  );

  it("matches the catalogue (run with UPDATE_SCHEMAS=1 to rewrite)", async () => {
    const expected = `${JSON.stringify(
      buildCatalogueSchema(
        subscriptionCatalogue,
        "https://workflows.local/subscriptions.workflow.schema.json",
      ),
      null,
      2,
    )}\n`;
    if (process.env.UPDATE_SCHEMAS) await writeFile(schemaFile, expected);
    expect(await readFile(schemaFile, "utf8")).toBe(expected);
  });
});
