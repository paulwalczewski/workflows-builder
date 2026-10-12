import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Points the store and logger at a throwaway copy of `data/seed` for the
 * duration of a test file.
 */
export function withTempData() {
  let dir = "";
  const original = { data: process.env.DATA_DIR, log: process.env.LOG_FILE };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "workflows-"));
    await cp(join(process.cwd(), "data", "seed"), join(dir, "seed"), {
      recursive: true,
    });
    process.env.DATA_DIR = dir;
    process.env.LOG_FILE = join(dir, "runtime.jsonl");
  });

  afterEach(async () => {
    // Assigning undefined to process.env stores the string "undefined".
    if (original.data === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = original.data;
    if (original.log === undefined) delete process.env.LOG_FILE;
    else process.env.LOG_FILE = original.log;
    await rm(dir, { recursive: true, force: true });
  });

  return { dir: () => dir };
}
