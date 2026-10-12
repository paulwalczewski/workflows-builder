/** @jest-environment node */
import type { Catalogue, Workflow } from "@wb/workflow-engine";
import {
  addRule,
  changeOperator,
  defaultCondition,
  duplicateRule,
  formatFactValue,
  fromDisplay,
  moveRule,
  removeRule,
  toDisplay,
  uniqueRuleId,
} from "../model";

const catalogue: Catalogue = {
  triggers: [{ id: "t", label: "T" }],
  facts: [
    {
      id: "a.spend",
      label: "Spend",
      scope: "subject",
      type: "number",
      scale: 100,
      unit: "EUR",
    },
    {
      id: "a.tier",
      label: "Tier",
      scope: "subject",
      type: "enum",
      options: [
        { value: "basic", label: "Basic" },
        { value: "pro", label: "Pro" },
      ],
    },
    { id: "a.flag", label: "Flag", scope: "subject", type: "boolean" },
  ],
  capabilities: [],
  limits: [],
  effects: [],
};

const empty: Workflow = {
  schemaVersion: 1,
  id: "w",
  name: "W",
  status: "draft",
  trigger: "t",
  rules: [],
};

describe("rules", () => {
  it("adds rules with unique slug ids", () => {
    const two = addRule(addRule(empty));
    expect(two.rules.map((r) => r.id)).toEqual(["rule", "rule-2"]);
    expect(uniqueRuleId(two, "Loyal Customers!")).toBe("loyal-customers");
  });

  it("moves, duplicates and removes without touching the original", () => {
    const three = addRule(addRule(addRule(empty)));
    const moved = moveRule(three, 2, 0);
    expect(moved.rules.map((r) => r.id)).toEqual(["rule-3", "rule", "rule-2"]);
    expect(three.rules.map((r) => r.id)).toEqual(["rule", "rule-2", "rule-3"]);
    expect(moveRule(three, 0, -1)).toBe(three);

    const copied = duplicateRule(three, 0);
    expect(copied.rules[1]).toMatchObject({
      id: "rule-copy",
      name: "New rule (copy)",
    });
    expect(removeRule(copied, 1).rules).toEqual(three.rules);
  });
});

describe("conditions", () => {
  it("starts each fact type with a valid value", () => {
    expect(defaultCondition(catalogue.facts[0])).toEqual({
      fact: "a.spend",
      op: "eq",
      value: 0,
    });
    expect(defaultCondition(catalogue.facts[1])).toEqual({
      fact: "a.tier",
      op: "in",
      value: ["basic"],
    });
    expect(defaultCondition(catalogue.facts[2])).toEqual({
      fact: "a.flag",
      op: "is",
      value: true,
    });
  });

  it("resets the value only when switching to or from a range", () => {
    const spend = catalogue.facts[0];
    const gte = { fact: "a.spend", op: "gte" as const, value: 20000 };
    expect(changeOperator(gte, spend, "lt")).toEqual({ ...gte, op: "lt" });
    expect(changeOperator(gte, spend, "between")).toEqual({
      fact: "a.spend",
      op: "between",
      value: [0, 1000],
    });
  });
});

describe("display", () => {
  it("scales stored integers for merchants and back", () => {
    expect(toDisplay(20000, 100)).toBe(200);
    expect(fromDisplay(199.99, 100)).toBe(19999);
    expect(formatFactValue(catalogue.facts[0], 22200)).toBe("222 EUR");
    expect(formatFactValue(catalogue.facts[1], "pro")).toBe("Pro");
    expect(formatFactValue(catalogue.facts[0], null)).toBe("not set");
  });
});
