/** @jest-environment node */
import { analyze } from "../analyze";
import type { Condition, Diagnostic } from "../types";
import { allow, catalogue, deny, limit, rule, workflow } from "./fixtures";

const codes = (diagnostics: Diagnostic[]) =>
  diagnostics.map((d) => `${d.severity}:${d.code}@${d.ruleIndex ?? "-"}`);

const check = (...rules: Parameters<typeof workflow>[0]) =>
  analyze(workflow(rules), catalogue);

describe("catalogue errors", () => {
  it("accepts a clean workflow", () => {
    expect(
      check(
        rule([{ fact: "box.age", op: "gte", value: 3 }], [allow("box.close")]),
        rule(
          [{ fact: "line.price", op: "gt", value: 50 }],
          [deny("Stays", "line.remove")],
        ),
        rule([], [allow("line.*"), limit("box.maxLines", 4)]),
      ).filter((d) => d.severity === "error"),
    ).toEqual([]);
  });

  it("flags an unknown trigger and duplicate rule ids", () => {
    const r = rule([], [allow("box.close")]);
    const diagnostics = analyze(
      workflow([r, { ...r }], { trigger: "nope" }),
      catalogue,
    );
    expect(codes(diagnostics)).toEqual(
      expect.arrayContaining([
        "error:unknown-trigger@-",
        "error:duplicate-rule-id@1",
      ]),
    );
  });

  it.each<[string, Condition, string]>([
    [
      "unknown fact",
      { fact: "box.colour", op: "eq", value: 1 },
      "unknown-fact",
    ],
    [
      "operator for the wrong type",
      { fact: "box.tier", op: "gte", value: 1 },
      "operator-mismatch",
    ],
    [
      "number fact with a string",
      { fact: "box.age", op: "gte", value: "3" },
      "value-mismatch",
    ],
    [
      "between upside down",
      { fact: "box.age", op: "between", value: [5, 1] },
      "value-mismatch",
    ],
    [
      "enum value not in options",
      { fact: "box.tier", op: "in", value: ["gold"] },
      "value-mismatch",
    ],
    [
      "enum with empty list",
      { fact: "box.tier", op: "in", value: [] },
      "value-mismatch",
    ],
    [
      "boolean with a number",
      { fact: "box.flagged", op: "is", value: 1 },
      "value-mismatch",
    ],
  ])("flags %s", (_, condition, code) => {
    const diagnostics = check(rule([condition], [allow("box.close")]));
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code,
        ruleIndex: 0,
        conditionIndex: 0,
      }),
    );
  });

  it("flags unknown capabilities and limits", () => {
    expect(
      codes(check(rule([], [allow("box.explode"), limit("box.maxCats", 1)]))),
    ).toEqual(["error:unknown-capability@0", "error:unknown-limit@0"]);
  });

  it("flags effects the catalogue does not offer", () => {
    const narrow = {
      ...catalogue,
      effects: catalogue.effects.filter((e) => e.type !== "limit.set"),
    };
    const diagnostics = analyze(
      workflow([rule([], [limit("box.maxLines", 1)])]),
      narrow,
    );
    expect(codes(diagnostics)).toContain("error:effect-not-offered@0");
  });

  it("names children with the catalogue's own term", () => {
    const named = { ...catalogue, terms: { subject: "box", child: "line" } };
    const [diagnostic] = analyze(
      workflow([
        rule(
          [{ fact: "line.price", op: "gt", value: 1 }],
          [allow("box.close")],
        ),
      ]),
      named,
    );
    expect(diagnostic.message).toBe(
      '"box.close" reaches no per-line capability, but this rule runs once per line because it reads a line fact.',
    );
  });

  it("flags a per-child rule that reaches only subject capabilities or limits", () => {
    const perLine = [{ fact: "line.price", op: "gt" as const, value: 1 }];
    expect(codes(check(rule(perLine, [allow("box.close")])))).toContain(
      "error:child-rule-subject-target@0",
    );
    expect(codes(check(rule(perLine, [limit("box.maxLines", 1)])))).toContain(
      "error:child-rule-subject-target@0",
    );
    expect(codes(check(rule(perLine, [allow("*"), allow("line.*")])))).toEqual(
      [],
    );
  });

  it("flags opposite answers at the same specificity inside one rule", () => {
    expect(
      codes(check(rule([], [allow("box.close"), deny("x", "box.close")]))),
    ).toContain("error:in-rule-contradiction@0");
    expect(codes(check(rule([], [allow("*"), deny("x", "*")])))).toContain(
      "error:in-rule-contradiction@0",
    );
    expect(
      codes(check(rule([], [deny("x", "*"), allow("box.close")]))),
    ).toEqual([]);
    expect(
      codes(
        check(rule([], [limit("box.maxLines", 1), limit("box.maxLines", 2)])),
      ),
    ).toContain("error:in-rule-contradiction@0");
  });

  it("warns about a rule with no effects", () => {
    expect(codes(check(rule([], [])))).toEqual(["warning:no-effects@0"]);
  });
});

describe("rule order", () => {
  it("warns that a rule below an unconditional rule is shadowed for the same capability", () => {
    const diagnostics = check(
      rule([], [deny("Closed", "box.close")], { name: "Lock" }),
      rule(
        [{ fact: "box.age", op: "gte", value: 3 }],
        [allow("box.close", "box.pause")],
      ),
    );
    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: "warning",
        code: "shadowed",
        ruleIndex: 1,
        effectIndex: 0,
        message: expect.stringContaining('rule 1 "Lock"'),
      }),
    ]);
  });

  it("warns when a rule above has identical conditions", () => {
    const when = [{ fact: "box.age", op: "gte" as const, value: 3 }];
    expect(
      codes(
        check(
          rule(when, [limit("box.maxLines", 3)]),
          rule(when, [limit("box.maxLines", 3)]),
        ),
      ),
    ).toEqual(["warning:shadowed@1"]);
  });

  it("notes a possible conflict when a conditional rule above answers differently", () => {
    const diagnostics = check(
      rule(
        [{ fact: "box.age", op: "lte", value: 1 }],
        [deny("New", "box.close")],
      ),
      rule(
        [{ fact: "box.tier", op: "in", value: ["pro"] }],
        [allow("box.close")],
      ),
    );
    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: "warning",
        code: "possible-conflict",
        ruleIndex: 1,
      }),
    ]);
  });

  it("ignores rules that can never match together", () => {
    expect(
      check(
        rule([{ fact: "box.age", op: "gte", value: 3 }], [allow("box.close")]),
        rule(
          [{ fact: "box.age", op: "lte", value: 1 }],
          [deny("New", "box.close")],
        ),
        rule(
          [{ fact: "box.age", op: "between", value: [1, 2] }],
          [deny("Hmm", "box.close")],
        ),
        rule(
          [{ fact: "box.tier", op: "in", value: ["basic"] }],
          [allow("box.pause")],
        ),
        rule(
          [{ fact: "box.tier", op: "in", value: ["pro"] }],
          [deny("Pro", "box.pause")],
        ),
      ),
    ).toEqual([]);
    // Touching ranges still overlap: age 3 matches both.
    expect(
      codes(
        check(
          rule(
            [{ fact: "box.age", op: "gte", value: 3 }],
            [allow("box.close")],
          ),
          rule(
            [{ fact: "box.age", op: "lte", value: 3 }],
            [deny("x", "box.close")],
          ),
        ),
      ),
    ).toEqual(["warning:possible-conflict@1"]);
  });

  it("treats identical conditions in a different order as identical", () => {
    const a = { fact: "box.age", op: "gte" as const, value: 3 };
    const b = { fact: "box.tier", op: "in" as const, value: ["pro", "basic"] };
    const reordered = JSON.parse(
      JSON.stringify([
        { value: ["basic", "pro"], op: "in", fact: "box.tier" },
        a,
      ]),
    );
    expect(
      codes(
        check(
          rule([a, b], [allow("box.close")]),
          rule(reordered, [allow("box.close")]),
        ),
      ),
    ).toEqual(["warning:shadowed@1"]);
  });

  it("stays quiet when the rule above agrees", () => {
    expect(
      check(
        rule(
          [{ fact: "box.age", op: "lte", value: 1 }],
          [deny("New", "box.close")],
        ),
        rule([], [deny("Contact support", "box.close")]),
      ),
    ).toEqual([]);
  });

  it("sees a per-child rule above a baseline as a possible conflict when both name the capability", () => {
    const diagnostics = check(
      rule(
        [{ fact: "line.price", op: "gt", value: 50 }],
        [deny("Stays", "line.remove")],
      ),
      rule([], [allow("line.remove")]),
    );
    expect(codes(diagnostics)).toEqual(["warning:possible-conflict@1"]);
    expect(diagnostics[0].message).toContain('"line.remove"');
  });

  it("stays quiet about capabilities reached only through a wildcard", () => {
    // A lockdown ("deny everything") above, a broad Baseline below: both
    // overlap everything by design.
    expect(
      check(
        rule(
          [{ fact: "box.flagged", op: "is", value: true }],
          [allow("box.pause"), deny("Locked", "*")],
        ),
        rule(
          [{ fact: "line.price", op: "gt", value: 50 }],
          [deny("Stays", "line.remove")],
        ),
        rule([], [allow("line.*", "box.close")]),
      ),
    ).toEqual([]);
  });

  it("compares limits by value", () => {
    expect(
      codes(
        check(
          rule(
            [{ fact: "box.tier", op: "in", value: ["pro"] }],
            [limit("box.maxLines", 6)],
          ),
          rule([], [limit("box.maxLines", 4)]),
        ),
      ),
    ).toEqual(["warning:possible-conflict@1"]);
  });
});
