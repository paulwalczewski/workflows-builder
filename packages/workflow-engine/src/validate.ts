import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import { analyze } from "./analyze";
import { buildCatalogueSchema } from "./schema/catalogue-schema";
import { workflowSchema } from "./schema/workflow-schema";
import type { Catalogue, Diagnostic, Workflow } from "./types";

const options = {
  allErrors: true,
  discriminator: true,
  strict: false,
  verbose: true,
} as const;
const ajv = new Ajv(options);
const validateShape = ajv.compile<Workflow>(workflowSchema);
const catalogueValidators = new WeakMap<Catalogue, ValidateFunction>();

function catalogueValidator(catalogue: Catalogue): ValidateFunction {
  let validator = catalogueValidators.get(catalogue);
  if (!validator) {
    // A fresh Ajv per catalogue avoids $id clashes between catalogues.
    validator = new Ajv(options).compile(buildCatalogueSchema(catalogue));
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

/**
 * `ok` is true when there are no errors (warnings never block). `workflow` is
 * the document typed as a workflow, present whenever its shape is valid.
 */
export type CheckResult =
  | { ok: true; workflow: Workflow; diagnostics: Diagnostic[] }
  | { ok: false; workflow: Workflow | null; diagnostics: Diagnostic[] };

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
  return diagnostics.some((d) => d.severity === "error")
    ? { ok: false, workflow, diagnostics }
    : { ok: true, workflow, diagnostics };
}

/** Turns Ajv errors into one readable error per location. */
function toDiagnostics(errors: ErrorObject[] | null | undefined): Diagnostic[] {
  const seen = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  for (const error of errors ?? []) {
    if (seen.has(error.instancePath)) continue;
    seen.add(error.instancePath);
    const rule = /^\/rules\/(\d+)/.exec(error.instancePath);
    const effect = /^\/rules\/\d+\/then\/(\d+)/.exec(error.instancePath);
    const condition = /^\/rules\/\d+\/when\/conditions\/(\d+)/.exec(
      error.instancePath,
    );
    diagnostics.push({
      severity: "error",
      code: "schema",
      message: describe(error),
      path: error.instancePath,
      ...(rule && { ruleIndex: Number(rule[1]) }),
      ...(effect && { effectIndex: Number(effect[1]) }),
      ...(condition && { conditionIndex: Number(condition[1]) }),
    });
  }
  return diagnostics;
}

/** A sentence a merchant can act on, for the schema errors they can cause. */
function describe(error: ErrorObject): string {
  const path = error.instancePath;
  const field = path.split("/").at(-1);
  if (error.keyword === "minLength" && field === "reason") {
    return "Write the reason the customer will see.";
  }
  if (error.keyword === "minLength" && field === "name") {
    return path === "/name"
      ? "Give the workflow a name."
      : "Give the rule a name.";
  }
  if (error.keyword === "minItems" && field === "capabilities") {
    return "Choose at least one capability.";
  }
  if (error.keyword === "pattern" && /\/capabilities\/\d+$/.test(path)) {
    return `"${String(error.data)}" is not a valid capability name.`;
  }
  if (error.keyword === "pattern" && field === "id") {
    return "Ids use lowercase letters, numbers and dashes.";
  }
  if (error.keyword === "minimum" && field === "value") {
    return "A limit cannot be negative.";
  }
  if (error.keyword === "type" && field === "value") {
    return "Enter a whole number.";
  }
  return `${where(path)} ${error.message ?? "is invalid"}.`;
}

function where(path: string): string {
  const parts: string[] = [];
  const rule = /^\/rules\/(\d+)/.exec(path);
  if (rule) parts.push(`Rule ${Number(rule[1]) + 1}`);
  const effect = /\/then\/(\d+)/.exec(path);
  if (effect) parts.push(`effect ${Number(effect[1]) + 1}`);
  const condition = /\/conditions\/(\d+)/.exec(path);
  if (condition) parts.push(`condition ${Number(condition[1]) + 1}`);
  const tail = path.replace(
    /^\/rules\/\d+(\/(then|when\/conditions)\/\d+)?/,
    "",
  );
  if (tail) parts.push(`(${tail.slice(1).replaceAll("/", ".")})`);
  return parts.length > 0 ? parts.join(", ") : "The workflow";
}
