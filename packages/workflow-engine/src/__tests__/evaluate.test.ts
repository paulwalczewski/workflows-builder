/** @jest-environment node */
import { evaluate } from "../evaluate";
import {
  allow,
  catalogue,
  deny,
  input,
  limit,
  rule,
  workflow,
} from "./fixtures";

const run = (
  rules: Parameters<typeof workflow>[0],
  facts?: Parameters<typeof input>[0],
  children?: Parameters<typeof input>[1],
) =>
  evaluate({
    workflow: workflow(rules),
    catalogue,
    input: input(facts, children),
  });

describe("default", () => {
  it("denies every capability and leaves limits unset when no rule decides", () => {
    const result = run([], {}, [{ id: "l1", facts: {} }]);
    for (const cap of ["box.close", "box.pause", "line.add"]) {
      expect(result.subject.capabilities[cap]).toEqual({
        capability: cap,
        allowed: false,
        decidedBy: null,
        overridden: [],
      });
    }
    expect(Object.keys(result.children.l1.capabilities).sort()).toEqual([
      "line.edit",
      "line.remove",
    ]);
    expect(result.subject.limits["box.maxLines"].value).toBeNull();
    expect(result.children.l1.limits["line.maxQuantity"].value).toBeNull();
  });

  it("only reports subject capabilities on the subject and child capabilities on children", () => {
    const result = run([], {}, [{ id: "l1", facts: {} }]);
    expect(result.subject.capabilities["line.remove"]).toBeUndefined();
    expect(result.children.l1.capabilities["box.close"]).toBeUndefined();
  });
});

describe("per capability, top rule wins", () => {
  it("lets the higher rule decide and records the lower one as overridden", () => {
    const top = rule([], [allow("box.close")]);
    const below = rule([], [deny("No", "box.close")]);
    const decision = run([top, below]).subject.capabilities["box.close"];
    expect(decision.allowed).toBe(true);
    expect(decision.decidedBy).toEqual({
      ruleId: top.id,
      ruleIndex: 0,
      effectIndex: 0,
    });
    expect(decision.overridden).toEqual([
      {
        ruleId: below.id,
        ruleIndex: 1,
        effectIndex: 0,
        allowed: false,
        reason: "No",
      },
    ]);
  });

  it("does not let a matching rule silence lower rules about other capabilities", () => {
    const result = run(
      [rule([], [deny("Locked", "line.edit")]), rule([], [allow("box.close")])],
      {},
      [{ id: "l1", facts: {} }],
    );
    expect(result.subject.capabilities["box.close"].allowed).toBe(true);
    expect(result.children.l1.capabilities["line.edit"].allowed).toBe(false);
    expect(result.children.l1.capabilities["line.edit"].reason).toBe("Locked");
  });

  it("skips rules whose conditions do not hold", () => {
    const result = run(
      [
        rule([{ fact: "box.age", op: "gte", value: 3 }], [allow("box.close")]),
        rule([], [deny("Contact support", "box.close")]),
      ],
      { "box.age": 1 },
    );
    expect(result.subject.capabilities["box.close"]).toMatchObject({
      allowed: false,
      reason: "Contact support",
      decidedBy: { ruleIndex: 1 },
      overridden: [],
    });
  });
});

describe("wildcards", () => {
  it("expands * to every capability and scope.* to that scope", () => {
    const result = run([rule([], [allow("box.*")])]);
    expect(result.subject.capabilities["box.close"].allowed).toBe(true);
    expect(result.subject.capabilities["box.pause"].allowed).toBe(true);
    expect(result.subject.capabilities["line.add"].allowed).toBe(false);

    const all = run([rule([], [allow("*")])], {}, [{ id: "l1", facts: {} }]);
    expect(all.subject.capabilities["line.add"].allowed).toBe(true);
    expect(all.children.l1.capabilities["line.remove"].allowed).toBe(true);
  });

  it("prefers exact over scope.* over * inside one rule", () => {
    const lockdown = rule(
      [],
      [deny("Payment failed", "*"), allow("box.pause")],
    );
    const result = run([lockdown], {}, [{ id: "l1", facts: {} }]);
    expect(result.subject.capabilities["box.pause"]).toMatchObject({
      allowed: true,
      decidedBy: { effectIndex: 1 },
    });
    expect(result.subject.capabilities["box.close"]).toMatchObject({
      allowed: false,
      reason: "Payment failed",
      decidedBy: { effectIndex: 0 },
    });
    expect(result.children.l1.capabilities["line.edit"].allowed).toBe(false);

    const scoped = run([rule([], [allow("*"), deny("No boxes", "box.*")])]);
    expect(scoped.subject.capabilities["box.close"].allowed).toBe(false);
    expect(scoped.subject.capabilities["line.add"].allowed).toBe(true);
  });

  it("lets deny win a same-specificity tie inside one rule", () => {
    const result = run([
      rule([], [allow("box.close"), deny("Tie", "box.close")]),
    ]);
    expect(result.subject.capabilities["box.close"]).toMatchObject({
      allowed: false,
      reason: "Tie",
    });
  });
});

describe("conditions", () => {
  const age = (op: string, value: unknown) =>
    rule([{ fact: "box.age", op, value } as never], [allow("box.close")]);
  const allowedAt = (r: ReturnType<typeof age>, ageValue: number | null) =>
    run([r], { "box.age": ageValue }).subject.capabilities["box.close"].allowed;

  it.each([
    ["eq", 3, 3, true],
    ["eq", 3, 4, false],
    ["neq", 3, 4, true],
    ["gt", 3, 3, false],
    ["gte", 3, 3, true],
    ["lt", 3, 2, true],
    ["lte", 3, 4, false],
    ["between", [2, 4], 4, true],
    ["between", [2, 4], 5, false],
  ])("number %s %p against %p is %p", (op, value, actual, expected) => {
    expect(allowedAt(age(op, value), actual as number)).toBe(expected);
  });

  it("treats a comparison against a missing fact as false, for every operator", () => {
    for (const op of ["eq", "neq", "gt", "lte", "between"]) {
      expect(allowedAt(age(op, op === "between" ? [0, 9] : 1), null)).toBe(
        false,
      );
    }
    const notIn = rule(
      [{ fact: "box.tier", op: "notIn", value: ["pro"] }],
      [allow("box.close")],
    );
    expect(run([notIn], {}).subject.capabilities["box.close"].allowed).toBe(
      false,
    );
  });

  it("compares enums with in / notIn and booleans with is", () => {
    const pro = rule(
      [{ fact: "box.tier", op: "in", value: ["pro"] }],
      [allow("box.pause")],
    );
    expect(
      run([pro], { "box.tier": "pro" }).subject.capabilities["box.pause"]
        .allowed,
    ).toBe(true);
    expect(
      run([pro], { "box.tier": "basic" }).subject.capabilities["box.pause"]
        .allowed,
    ).toBe(false);

    const notPro = rule(
      [{ fact: "box.tier", op: "notIn", value: ["pro"] }],
      [allow("box.pause")],
    );
    expect(
      run([notPro], { "box.tier": "basic" }).subject.capabilities["box.pause"]
        .allowed,
    ).toBe(true);

    const flagged = rule(
      [{ fact: "box.flagged", op: "is", value: true }],
      [allow("box.pause")],
    );
    expect(
      run([flagged], { "box.flagged": true }).subject.capabilities["box.pause"]
        .allowed,
    ).toBe(true);
    expect(
      run([flagged], { "box.flagged": false }).subject.capabilities["box.pause"]
        .allowed,
    ).toBe(false);
  });

  it("combines with all / any, and an empty group always matches", () => {
    const conditions = [
      { fact: "box.age", op: "gte" as const, value: 3 },
      { fact: "box.tier", op: "in" as const, value: ["pro"] },
    ];
    const all = rule(conditions, [allow("box.close")]);
    const any = rule(conditions, [allow("box.close")], {
      when: { match: "any", conditions },
    });
    const facts = { "box.age": 5, "box.tier": "basic" };
    expect(run([all], facts).subject.capabilities["box.close"].allowed).toBe(
      false,
    );
    expect(run([any], facts).subject.capabilities["box.close"].allowed).toBe(
      true,
    );

    const emptyAny = rule([], [allow("box.close")], {
      when: { match: "any", conditions: [] },
    });
    expect(run([emptyAny]).subject.capabilities["box.close"].allowed).toBe(
      true,
    );
  });
});

describe("child-scoped rules", () => {
  const children = [
    { id: "cheap", facts: { "line.price": 10 } },
    { id: "premium", facts: { "line.price": 60 } },
  ];

  it("run once per child and only affect the children that match", () => {
    const result = run(
      [
        rule(
          [{ fact: "line.price", op: "gt", value: 50 }],
          [deny("Premium stays", "line.remove")],
        ),
        rule([], [allow("line.*")]),
      ],
      {},
      children,
    );
    expect(result.children.cheap.capabilities["line.remove"].allowed).toBe(
      true,
    );
    expect(result.children.premium.capabilities["line.remove"]).toMatchObject({
      allowed: false,
      reason: "Premium stays",
    });
    expect(result.children.premium.capabilities["line.edit"].allowed).toBe(
      true,
    );
  });

  it("can mix subject facts into their conditions", () => {
    const result = run(
      [
        rule(
          [
            { fact: "box.tier", op: "in", value: ["basic"] },
            { fact: "line.price", op: "gt", value: 50 },
          ],
          [deny("Basic cannot remove premium", "line.remove")],
        ),
      ],
      { "box.tier": "pro" },
      children,
    );
    expect(
      result.children.premium.capabilities["line.remove"].reason,
    ).toBeUndefined();
  });

  it("never reach subject capabilities or subject limits", () => {
    const result = run(
      [
        rule(
          [{ fact: "line.price", op: "gt", value: 0 }],
          [allow("*"), limit("box.maxLines", 3)],
        ),
      ],
      {},
      children,
    );
    expect(result.subject.capabilities["box.close"].allowed).toBe(false);
    expect(result.subject.capabilities["line.add"].allowed).toBe(false);
    expect(result.subject.limits["box.maxLines"].value).toBeNull();
    expect(result.children.cheap.capabilities["line.edit"].allowed).toBe(true);
  });

  it("are not applied to the subject when there are no children", () => {
    const result = run([
      rule([{ fact: "line.price", op: "gt", value: 0 }], [allow("*")]),
    ]);
    expect(result.subject.capabilities["box.close"].allowed).toBe(false);
    expect(result.children).toEqual({});
  });
});

describe("limits", () => {
  it("take the top matching rule's value and record the rest as overridden", () => {
    const result = run(
      [
        rule(
          [{ fact: "box.tier", op: "in", value: ["pro"] }],
          [limit("box.maxLines", 6)],
        ),
        rule([], [limit("box.maxLines", 4), limit("line.maxQuantity", 5)]),
      ],
      { "box.tier": "pro" },
      [{ id: "l1", facts: {} }],
    );
    expect(result.subject.limits["box.maxLines"]).toMatchObject({
      value: 6,
      decidedBy: { ruleIndex: 0, effectIndex: 0 },
      overridden: [{ ruleIndex: 1, effectIndex: 0, value: 4 }],
    });
    expect(result.children.l1.limits["line.maxQuantity"]).toMatchObject({
      value: 5,
      decidedBy: { ruleIndex: 1, effectIndex: 1 },
    });
  });
});

describe("trace", () => {
  it("records every rule, every target, and each condition's actual value", () => {
    const subjectRule = rule(
      [{ fact: "box.age", op: "gte", value: 3 }],
      [allow("box.close")],
    );
    const childRule = rule(
      [{ fact: "line.price", op: "gt", value: 50 }],
      [deny("x", "line.remove")],
    );
    const result = run([subjectRule, childRule], { "box.age": 1 }, [
      { id: "l1", facts: { "line.price": 60 } },
    ]);
    expect(result.trace).toEqual([
      {
        ruleId: subjectRule.id,
        ruleIndex: 0,
        name: subjectRule.name,
        scope: "subject",
        evaluations: [
          {
            targetId: null,
            matched: false,
            conditions: [
              {
                fact: "box.age",
                op: "gte",
                expected: 3,
                actual: 1,
                pass: false,
              },
            ],
          },
        ],
      },
      {
        ruleId: childRule.id,
        ruleIndex: 1,
        name: childRule.name,
        scope: "child",
        evaluations: [
          {
            targetId: "l1",
            matched: true,
            conditions: [
              {
                fact: "line.price",
                op: "gt",
                expected: 50,
                actual: 60,
                pass: true,
              },
            ],
          },
        ],
      },
    ]);
  });
});

describe("purity", () => {
  it("is deterministic and leaves its inputs untouched", () => {
    const wf = workflow([rule([], [deny("x", "*"), allow("box.close")])]);
    const facts = input({ "box.age": 4 }, [
      { id: "l1", facts: { "line.price": 1 } },
    ]);
    const frozen = JSON.stringify({ wf, facts, catalogue });
    const a = evaluate({ workflow: wf, catalogue, input: facts });
    const b = evaluate({ workflow: wf, catalogue, input: facts });
    expect(a).toEqual(b);
    expect(JSON.stringify({ wf, facts, catalogue })).toBe(frozen);
    expect(a.workflowId).toBe("test");
  });
});
