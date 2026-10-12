import type {
  Condition,
  ConditionTrace,
  FactType,
  FactValues,
  Operator,
  When,
} from "./types";

/** The operators the builder offers for each fact type. */
export const OPERATORS_BY_TYPE: Record<FactType, readonly Operator[]> = {
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "between"],
  enum: ["in", "notIn"],
  boolean: ["is"],
};

export const OPERATOR_LABELS: Record<Operator, string> = {
  eq: "is",
  neq: "is not",
  gt: "is more than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  between: "is between",
  in: "is one of",
  notIn: "is none of",
  is: "is",
};

/** A comparison against a missing fact is always false, whatever the operator. */
export function testCondition(condition: Condition, actual: unknown): boolean {
  if (actual === null || actual === undefined) return false;
  const { op, value } = condition;
  switch (op) {
    case "eq":
      return actual === value;
    case "neq":
      return actual !== value;
    case "gt":
      return (
        typeof actual === "number" &&
        typeof value === "number" &&
        actual > value
      );
    case "gte":
      return (
        typeof actual === "number" &&
        typeof value === "number" &&
        actual >= value
      );
    case "lt":
      return (
        typeof actual === "number" &&
        typeof value === "number" &&
        actual < value
      );
    case "lte":
      return (
        typeof actual === "number" &&
        typeof value === "number" &&
        actual <= value
      );
    case "between": {
      if (typeof actual !== "number" || !Array.isArray(value)) return false;
      const [min, max] = value;
      return (
        typeof min === "number" &&
        typeof max === "number" &&
        actual >= min &&
        actual <= max
      );
    }
    case "in":
      return Array.isArray(value) && value.some((v) => v === actual);
    case "notIn":
      return Array.isArray(value) && !value.some((v) => v === actual);
    case "is":
      return actual === value;
  }
}

export function testWhen(
  when: When,
  facts: FactValues,
): { matched: boolean; conditions: ConditionTrace[] } {
  const conditions = when.conditions.map((condition) => {
    const actual = facts[condition.fact];
    return {
      fact: condition.fact,
      op: condition.op,
      expected: condition.value,
      actual,
      pass: testCondition(condition, actual),
    };
  });
  if (conditions.length === 0) return { matched: true, conditions };
  const matched =
    when.match === "all"
      ? conditions.every((c) => c.pass)
      : conditions.some((c) => c.pass);
  return { matched, conditions };
}
