import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import { analyze } from "./analyze";
import { buildCatalogueSchema } from "./schema/catalogue-schema";
import { workflowSchema } from "./schema/workflow-schema";
import type { Catalogue, Diagnostic, Workflow } from "./types";

const ajv = new Ajv({ allErrors: true, strict: false });
const validateShape = ajv.compile<Workflow>(workflowSchema);
const catalogueValidators = new WeakMap<Catalogue, ValidateFunction>();

function catalogueValidator(catalogue: Catalogue): ValidateFunction {
  let validator = catalogueValidators.get(catalogue);
  if (!validator) {
    // A fresh Ajv per catalogue avoids $id clashes between catalogues.
    validator = new Ajv({ allErrors: true, strict: false }).compile(
      buildCatalogueSchema(catalogue),
    );
    catalogueValidators.set(catalogue, validator);
  }
  return validator;
}

/** Structural check against the generic schema. */
export function validateWorkflowShape(doc: unknown): Diagnostic[] {
  return validateShape(doc) ? [] : toDiagnostics(validateShape.errors);
}

/** Check against the schema narrowed to one catalogue. */
export function validateAgainstCatalogue(
  doc: unknown,
  catalogue: Catalogue,
): Diagnostic[] {
  const validator = catalogueValidator(catalogue);
  return validator(doc) ? [] : toDiagnostics(validator.errors);
}

export interface CheckResult {
  /** True when there are no errors. Warnings never block. */
  ok: boolean;
  /** The document typed as a workflow, when its shape is valid. */
  workflow: Workflow | null;
  diagnostics: Diagnostic[];
}

/**
 * Everything the builder runs before saving and the runtime runs before
 * loading: generic shape, then catalogue semantics and rule-order analysis,
 * then the catalogue schema as a final gate.
 */
export function checkWorkflow(doc: unknown, catalogue: Catalogue): CheckResult {
  const shape = validateWorkflowShape(doc);
  if (shape.length > 0)
    return { ok: false, workflow: null, diagnostics: shape };

  const workflow = doc as Workflow;
  const diagnostics = analyze(workflow, catalogue);
  if (!diagnostics.some((d) => d.severity === "error")) {
    diagnostics.push(...validateAgainstCatalogue(doc, catalogue));
  }
  return {
    ok: !diagnostics.some((d) => d.severity === "error"),
    workflow,
    diagnostics,
  };
}

function toDiagnostics(errors: ErrorObject[] | null | undefined): Diagnostic[] {
  const seen = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  for (const error of errors ?? []) {
    // oneOf/anyOf report one error per branch; the first is enough per location.
    if (seen.has(error.instancePath)) continue;
    seen.add(error.instancePath);
    const match = /^\/rules\/(\d+)/.exec(error.instancePath);
    diagnostics.push({
      severity: "error",
      code: "schema",
      message: `${error.instancePath || "workflow"} ${error.message ?? "is invalid"}`,
      path: error.instancePath,
      ...(match && { ruleIndex: Number(match[1]) }),
    });
  }
  return diagnostics;
}
