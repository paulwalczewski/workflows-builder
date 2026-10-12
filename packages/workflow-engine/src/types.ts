import type { FromSchema } from "json-schema-to-ts";
import type { OPERATORS, workflowSchema } from "./schema/workflow-schema";

// ---------------------------------------------------------------------------
// Workflow document. Derived from the JSON Schema so the schema stays the
// single source of truth; the named aliases below are views into it.
// ---------------------------------------------------------------------------

export type Workflow = FromSchema<typeof workflowSchema>;
export type Rule = Workflow["rules"][number];
export type When = Rule["when"];
export type Condition = When["conditions"][number];
export type Effect = Rule["then"][number];
export type EffectType = Effect["type"];
export type AllowEffect = Extract<Effect, { type: "capability.allow" }>;
export type DenyEffect = Extract<Effect, { type: "capability.deny" }>;
export type LimitEffect = Extract<Effect, { type: "limit.set" }>;
export type Operator = (typeof OPERATORS)[number];
export type ConditionValue = Condition["value"];
export type WorkflowStatus = Workflow["status"];

// ---------------------------------------------------------------------------
// Catalogue. Supplied by the host product; plain serialisable data.
// The engine speaks of a "subject" (what the workflow runs for) and its
// "children" (things inside it). A subscription host maps subscription to
// subject and item to child.
// ---------------------------------------------------------------------------

export type Scope = "subject" | "child";
export type FactType = "number" | "enum" | "boolean";

export interface TriggerDef {
  id: string;
  label: string;
}

export interface FactDef {
  id: string;
  label: string;
  scope: Scope;
  type: FactType;
  /** Allowed values for `enum` facts. */
  options?: { value: string; label: string }[];
  /** Display hint, e.g. "per month" or "days". */
  unit?: string;
  /**
   * Display divisor for number facts. Values are stored and compared as-is;
   * the builder shows and edits `value / scale`. Money facts in minor units
   * use 100, so a merchant types 200 and the workflow stores 20000.
   */
  scale?: number;
  description?: string;
}

export interface CapabilityDef {
  id: string;
  label: string;
  subject: Scope;
  description?: string;
}

export interface LimitDef {
  id: string;
  label: string;
  subject: Scope;
  description?: string;
}

export interface EffectDef {
  type: EffectType;
  label: string;
}

export interface Catalogue {
  triggers: TriggerDef[];
  facts: FactDef[];
  capabilities: CapabilityDef[];
  limits: LimitDef[];
  /** Which of the engine's effect kinds this host offers, with its own labels. */
  effects: EffectDef[];
  /** What this host calls a subject and a child, for messages. */
  terms?: { subject: string; child: string };
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export type FactValue = number | string | boolean | null;
export type FactValues = Record<string, FactValue>;

export interface EvaluationInput {
  facts: FactValues;
  children: { id: string; facts: FactValues }[];
}

/** Points at one effect inside one rule. */
export interface EffectRef {
  ruleId: string;
  ruleIndex: number;
  effectIndex: number;
}

export interface OverriddenCapability extends EffectRef {
  allowed: boolean;
  reason?: string;
}

export interface CapabilityDecision {
  capability: string;
  allowed: boolean;
  reason?: string;
  /** null when no rule mentioned the capability (default deny). */
  decidedBy: EffectRef | null;
  /** Effects from lower matching rules that wanted a say but came too late. */
  overridden: OverriddenCapability[];
}

export interface OverriddenLimit extends EffectRef {
  value: number;
}

export interface LimitDecision {
  limit: string;
  /** null when no rule set the limit. */
  value: number | null;
  decidedBy: EffectRef | null;
  overridden: OverriddenLimit[];
}

export interface TargetResult {
  capabilities: Record<string, CapabilityDecision>;
  limits: Record<string, LimitDecision>;
}

export interface ConditionTrace {
  fact: string;
  op: Operator;
  expected: ConditionValue;
  actual: FactValue | undefined;
  pass: boolean;
}

export interface RuleEvaluationTrace {
  /** null for the subject, otherwise the child id. */
  targetId: string | null;
  matched: boolean;
  conditions: ConditionTrace[];
}

export interface RuleTrace {
  ruleId: string;
  ruleIndex: number;
  name: string;
  scope: Scope;
  evaluations: RuleEvaluationTrace[];
}

export interface EvaluationResult {
  workflowId: string;
  subject: TargetResult;
  children: Record<string, TargetResult>;
  trace: RuleTrace[];
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export type Severity = "error" | "warning";

export type DiagnosticCode =
  | "schema"
  | "unknown-trigger"
  | "duplicate-rule-id"
  | "unknown-fact"
  | "operator-mismatch"
  | "value-mismatch"
  | "unknown-capability"
  | "unknown-limit"
  | "effect-not-offered"
  | "child-rule-subject-target"
  | "in-rule-contradiction"
  | "no-effects"
  | "shadowed"
  | "possible-conflict";

export interface Diagnostic {
  severity: Severity;
  code: DiagnosticCode;
  message: string;
  ruleId?: string;
  ruleIndex?: number;
  effectIndex?: number;
  conditionIndex?: number;
  /** JSON pointer-ish path for schema errors, e.g. "/rules/2/then/0". */
  path?: string;
}
