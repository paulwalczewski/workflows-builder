/**
 * The generic workflow schema: structure only, no knowledge of any catalogue.
 * `workflow.schema.json` next to this file is emitted from it (see emit-schema test).
 */

/** `scope.action` in lowerCamel, optionally ending in `.*`, or a bare `*`. */
export const CAPABILITY_PATTERN =
  "^(\\*|[a-z][a-zA-Z0-9]*(\\.[a-z][a-zA-Z0-9]*)*(\\.\\*)?)$";
/** A concrete `scope.name` id, no wildcards. Used for capabilities, limits and facts. */
export const SCOPED_ID_PATTERN = "^[a-z][a-zA-Z0-9]*(\\.[a-z][a-zA-Z0-9]*)+$";
export const SLUG_PATTERN = "^[a-z0-9][a-z0-9-]*$";

export const OPERATORS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "in",
  "notIn",
  "is",
] as const;

export const workflowSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://workflows.local/workflow.schema.json",
  title: "Workflow",
  description:
    "An ordered list of rules, read top to bottom. For each capability and limit, the highest matching rule that mentions it decides.",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "id", "name", "status", "trigger", "rules"],
  properties: {
    $schema: { type: "string" },
    schemaVersion: { const: 1 },
    id: { type: "string", pattern: SLUG_PATTERN },
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    status: { enum: ["draft", "published"] },
    trigger: { type: "string", minLength: 1 },
    updatedAt: { type: "string" },
    rules: { type: "array", items: { $ref: "#/definitions/rule" } },
  },
  definitions: {
    rule: {
      type: "object",
      additionalProperties: false,
      required: ["id", "name", "when", "then"],
      properties: {
        id: { type: "string", pattern: SLUG_PATTERN },
        name: { type: "string", minLength: 1 },
        description: { type: "string" },
        when: { $ref: "#/definitions/when" },
        then: { type: "array", items: { $ref: "#/definitions/effect" } },
      },
    },
    when: {
      type: "object",
      additionalProperties: false,
      required: ["match", "conditions"],
      properties: {
        match: { enum: ["all", "any"] },
        conditions: {
          type: "array",
          items: { $ref: "#/definitions/condition" },
        },
      },
    },
    condition: {
      type: "object",
      additionalProperties: false,
      required: ["fact", "op", "value"],
      properties: {
        fact: { type: "string", pattern: SCOPED_ID_PATTERN },
        op: { enum: OPERATORS },
        value: {
          anyOf: [
            { type: "number" },
            { type: "string" },
            { type: "boolean" },
            {
              type: "array",
              items: { anyOf: [{ type: "number" }, { type: "string" }] },
            },
          ],
        },
      },
    },
    capabilityList: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { type: "string", pattern: CAPABILITY_PATTERN },
    },
    effect: {
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "capabilities"],
          properties: {
            type: { const: "capability.allow" },
            capabilities: { $ref: "#/definitions/capabilityList" },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "capabilities", "reason"],
          properties: {
            type: { const: "capability.deny" },
            capabilities: { $ref: "#/definitions/capabilityList" },
            reason: { type: "string", minLength: 1 },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "limit", "value"],
          properties: {
            type: { const: "limit.set" },
            limit: { type: "string", pattern: SCOPED_ID_PATTERN },
            value: { type: "integer", minimum: 0 },
          },
        },
      ],
    },
  },
} as const;
