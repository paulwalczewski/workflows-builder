/** @jest-environment node */
import { access } from "node:fs/promises";
import { withTempData } from "@/server/__tests__/helpers";
import { readLog } from "@/server/logger";
import { runAndLog } from "@/server/run";
import {
  getSubscription,
  resetState,
  updateSubscription,
} from "@/server/store";
import { resetData } from "../actions";

jest.mock("next/cache", () => ({ refresh: jest.fn() }));

withTempData();
const now = new Date("2026-10-12T09:00:00.000Z");
beforeEach(() => resetState(now));

describe("resetData", () => {
  it("restores the seed and clears the runtime log", async () => {
    await updateSubscription("anna-pantry", (s) => ({
      ...s,
      status: "paused",
    }));
    await runAndLog("anna-pantry", now);
    expect((await readLog()).length).toBeGreaterThan(0);

    await resetData();

    expect((await getSubscription("anna-pantry"))?.status).toBe("active");
    expect(await readLog()).toEqual([]);
    await expect(access(process.env.LOG_FILE as string)).rejects.toThrow();
  });
});
