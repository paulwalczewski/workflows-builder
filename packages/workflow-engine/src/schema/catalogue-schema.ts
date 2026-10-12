import { capabilityPatterns } from "../capabilities";
import { OPERATORS_BY_TYPE } from "../conditions";
import type { Catalogue, FactDef } from "../types";
import { workflowSchema } from "./workflow-schema";

type JsonSchema = Record<string, unknown>;

/**
 * The generic workflow schema narrowed to one catalogue: only its triggers,
 * facts (with operators and value types matching each fact's type),
 * capability patterns, limits and offered effects validate.
 *
 * Rules that depend on rule order or scope (shadowing, child-scoped rules
 * touching subject capabilities) are beyond JSON Schema; `analyze` covers them.
 */
export function buildCatalogueSchema(
  catalogue: Catalogue,
  id = "https://workflows.local/catalogue.workflow.schema.json",
): JsonSchema {
  const schema = structuredClone(workflowSchema) as unknown as {
    $id: string;
    properties: Record<string, JsonSchema>;
    definitions: Record<string, JsonSchema>;
  };
  schema.$id = id;

  schema.properties.trigger = { enum: catalogue.triggers.map((t) => t.id) };

  const branches = catalogue.facts.flatMap(conditionBranches);
  // A catalogue without facts accepts no conditions at all.
  schema.definitions.condition =
    branches.length > 0 ? { anyOf: branches } : { not: {} };

  schema.definitions.capabilityList = {
    type: "array",
    minItems: 1,
    uniqueItems: true,
    items: { enum: capabilityPatterns(catalogue) },
  };

  const offered = new Set<string>(catalogue.effects.map((e) => e.type));
  const effect = schema.definitions.effect as { oneOf: JsonSchema[] };
  effect.oneOf = effect.oneOf
    .filter((branch) => offered.has(effectType(branch)))
    .map((branch) => {
      if (effectType(branch) !== "limit.set") return branch;
      const properties = {
        ...(branch.properties as Record<string, JsonSchema>),
      };
      properties.limit = { enum: catalogue.limits.map((l) => l.id) };
      return { ...branch, properties };
    });

  return schema as unknown as JsonSchema;
}

function effectType(branch: JsonSchema): string {
  const properties = branch.properties as { type: { const: string } };
  return properties.type.const;
}

function conditionBranches(fact: FactDef): JsonSchema[] {
  const branch = (ops: readonly string[], value: JsonSchema): JsonSchema => ({
    type: "object",
    additionalProperties: false,
    required: ["fact", "op", "value"],
    properties: { fact: { const: fact.id }, op: { enum: [...ops] }, value },
  });

  const ops = OPERATORS_BY_TYPE[fact.type];
  switch (fact.type) {
    case "number":
      return [
        branch(
          ops.filter((op) => op !== "between"),
          { type: "number" },
        ),
        branch(["between"], {
          type: "array",
          items: { type: "number" },
          minItems: 2,
          maxItems: 2,
        }),
      ];
    case "enum":
      return [
        branch(ops, {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: { enum: (fact.options ?? []).map((o) => o.value) },
        }),
      ];
    case "boolean":
      return [branch(ops, { type: "boolean" })];
  }
}
