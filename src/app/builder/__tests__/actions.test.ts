/** @jest-environment node */
import { withTempData } from "@/server/__tests__/helpers";
import { getWorkflow, listWorkflows, resetState } from "@/server/store";
import {
  createWorkflowAction,
  deleteWorkflowAction,
  duplicateWorkflowAction,
  publishWorkflowAction,
  saveWorkflowAction,
} from "../actions";

jest.mock("next/cache", () => ({ refresh: jest.fn() }));

withTempData();
beforeEach(() => resetState(new Date("2026-10-12T09:00:00.000Z")));

describe("builder actions", () => {
  it("creates a draft that starts with a Baseline rule", async () => {
    const id = await createWorkflowAction();
    expect(await getWorkflow(id)).toMatchObject({
      id: "new-workflow",
      status: "draft",
      rules: [{ id: "baseline" }],
    });
    expect(await createWorkflowAction()).toBe("new-workflow-2");
  });

  it("duplicates as a draft, even from the published workflow", async () => {
    const id = await duplicateWorkflowAction("standard");
    expect(await getWorkflow(id as string)).toMatchObject({
      id: "standard-copy",
      name: "Standard (copy)",
      status: "draft",
    });
    expect(await duplicateWorkflowAction("nope")).toBeNull();
  });

  it("deletes drafts and refuses to delete the published workflow", async () => {
    expect(await deleteWorkflowAction("starter")).toEqual({
      ok: false,
      reason:
        "The published workflow cannot be deleted. Publish another one first.",
    });
    expect(await deleteWorkflowAction("standard")).toEqual({ ok: true });
    expect((await listWorkflows()).map((w) => w.id)).toEqual(["starter"]);
  });

  it("returns save errors instead of throwing, and publishes on request", async () => {
    const standard = await getWorkflow("standard");
    const outcome = await saveWorkflowAction({
      ...standard,
      rules: [{ id: "Bad Id" }],
    });
    expect(outcome.ok).toBe(false);
    await publishWorkflowAction("standard");
    expect((await getWorkflow("standard"))?.status).toBe("published");
    expect((await getWorkflow("starter"))?.status).toBe("draft");
  });
});
