/** @jest-environment node */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildCatalogueSchema } from "../schema/catalogue-schema";
import { workflowSchema } from "../schema/workflow-schema";
import { canonicalWorkflow, serializeWorkflow } from "../serialize";
import type { Workflow } from "../types";
import {
  checkWorkflow,
  validateAgainstCatalogue,
  validateWorkflowShape,
} from "../validate";
import { allow, catalogue, deny, limit, rule, workflow } from "./fixtures";

const schemaFile = join(__dirname, "..", "schema", "workflow.schema.json");

describe("emitted JSON Schema", () => {
  it("matches the TypeScript source (run with UPDATE_SCHEMAS=1 to rewrite)", () => {
    const expected = `${JSON.stringify(workflowSchema, null, 2)}\n`;
    if (process.env.UPDATE_SCHEMAS) writeFileSync(schemaFile, expected);
    expect(readFileSync(schemaFile, "utf8")).toBe(expected);
  });
});

const valid = workflow([
  rule(
    [{ fact: "box.age", op: "between", value: [1, 3] }],
    [deny("Young", "box.close")],
    {
      id: "young",
    },
  ),
  rule(
    [{ fact: "box.tier", op: "in", value: ["pro"] }],
    [allow("box.*"), limit("box.maxLines", 6)],
    {
      id: "pro",
    },
  ),
]);

describe("generic shape", () => {
  it("accepts a valid workflow", () => {
    expect(validateWorkflowShape(valid)).toEqual([]);
  });

  it.each([
    ["missing rules", { ...valid, rules: undefined }],
    ["unknown top-level key", { ...valid, colour: "red" }],
    ["bad capability syntax", workflow([rule([], [allow("Box Close")])])],
    [
      "deny without reason",
      workflow([
        rule([], [{ type: "capability.deny", capabilities: ["*"] } as never]),
      ]),
    ],
    ["negative limit", workflow([rule([], [limit("box.maxLines", -1)])])],
    [
      "unknown operator",
      workflow([
        rule([{ fact: "box.age", op: "near", value: 1 } as never], []),
      ]),
    ],
  ])("rejects %s", (_, doc) => {
    const diagnostics = validateWorkflowShape(doc);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(
      diagnostics.every((d) => d.code === "schema" && d.severity === "error"),
    ).toBe(true);
  });

  it("points schema errors at the rule", () => {
    const [first] = validateWorkflowShape(
      workflow([rule([], []), rule([], [allow("Bad")])]),
    );
    expect(first).toMatchObject({
      ruleIndex: 1,
      path: "/rules/1/then/0/capabilities/0",
    });
  });
});

describe("readable schema errors", () => {
  it("reports one error for an empty deny reason, on the effect, in plain words", () => {
    const diagnostics = validateWorkflowShape(
      workflow([rule([], [allow("box.close"), deny("", "box.pause")])]),
    );
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "schema",
        ruleIndex: 0,
        effectIndex: 1,
        message: "Write the reason the customer will see.",
      }),
    ]);
  });

  it("explains an effect with no capabilities", () => {
    const [d] = validateWorkflowShape(workflow([rule([], [allow()])]));
    expect(d).toMatchObject({
      effectIndex: 0,
      message: "Choose at least one capability.",
    });
  });

  it("still flags an effect of unknown type once", () => {
    const diagnostics = validateWorkflowShape(
      workflow([rule([], [{ type: "capability.maybe" } as never])]),
    );
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(new Set(diagnostics.map((d) => d.path)).size).toBe(
      diagnostics.length,
    );
  });
});

describe("catalogue schema", () => {
  it("accepts what the catalogue allows", () => {
    expect(validateAgainstCatalogue(valid, catalogue)).toEqual([]);
  });

  it.each([
    ["unknown trigger", { ...valid, trigger: "other" }],
    [
      "unknown fact",
      workflow([rule([{ fact: "box.colour", op: "eq", value: 1 }], [])]),
    ],
    [
      "operator for the wrong type",
      workflow([rule([{ fact: "box.tier", op: "gte", value: 1 }], [])]),
    ],
    [
      "unknown enum option",
      workflow([rule([{ fact: "box.tier", op: "in", value: ["gold"] }], [])]),
    ],
    ["unknown capability", workflow([rule([], [allow("box.explode")])])],
    ["unknown limit", workflow([rule([], [limit("box.maxCats", 1)])])],
  ])("rejects %s", (_, doc) => {
    expect(validateAgainstCatalogue(doc, catalogue).length).toBeGreaterThan(0);
  });

  it("lists only offered effects", () => {
    const schema = buildCatalogueSchema({
      ...catalogue,
      effects: [{ type: "capability.allow", label: "Allow" }],
    }) as { definitions: { effect: { oneOf: unknown[] } } };
    expect(schema.definitions.effect.oneOf).toHaveLength(1);
  });
});

describe("checkWorkflow", () => {
  it("returns the typed workflow and no errors for a valid document", () => {
    const result = checkWorkflow(JSON.parse(JSON.stringify(valid)), catalogue);
    expect(result.ok).toBe(true);
    expect(result.workflow?.id).toBe("test");
  });

  it("stops at shape errors before running semantic checks", () => {
    const result = checkWorkflow({ hello: "world" }, catalogue);
    expect(result).toMatchObject({ ok: false, workflow: null });
    expect(result.diagnostics.every((d) => d.code === "schema")).toBe(true);
  });

  it("stays ok with warnings", () => {
    const result = checkWorkflow(workflow([rule([], [])]), catalogue);
    expect(result.ok).toBe(true);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["no-effects"]);
  });
});

describe("serialization", () => {
  it("round-trips byte for byte", () => {
    const text = serializeWorkflow(valid);
    expect(serializeWorkflow(JSON.parse(text) as Workflow)).toBe(text);
    expect(text.endsWith("}\n")).toBe(true);
  });

  it("puts keys in canonical order regardless of input order", () => {
    const shuffled = JSON.parse(
      JSON.stringify({
        rules: valid.rules,
        trigger: valid.trigger,
        status: "draft",
        name: "Test",
        id: "test",
        schemaVersion: 1,
      }),
    ) as Workflow;
    expect(serializeWorkflow(shuffled)).toBe(serializeWorkflow(valid));
    expect(Object.keys(canonicalWorkflow(shuffled))).toEqual([
      "schemaVersion",
      "id",
      "name",
      "status",
      "trigger",
      "rules",
    ]);
  });
});
