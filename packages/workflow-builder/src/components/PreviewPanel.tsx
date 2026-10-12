"use client";

import { Button, Chip } from "@heroui/react";
import {
  type CapabilityDecision,
  type Catalogue,
  capabilityLabel,
  type EffectRef,
  type EvaluationResult,
  type LimitDecision,
  limitLabel,
  type Workflow,
} from "@wb/workflow-engine";
import type { PreviewTarget } from "../types";

interface Props {
  catalogue: Catalogue;
  result: EvaluationResult | null;
  workflow: Workflow | null;
  target: PreviewTarget | undefined;
  stale: boolean;
  onShowRule: (ruleId: string) => void;
}

/** What the previewed target could do under the current draft, and why. */
export function PreviewPanel({
  catalogue,
  result,
  workflow,
  target,
  stale,
  onShowRule,
}: Props) {
  if (!target) {
    return <p className="text-sm text-muted">Nothing to preview against.</p>;
  }
  if (!result || !workflow) {
    return (
      <p className="text-sm text-muted">
        Fix the errors in the workflow to see a preview.
      </p>
    );
  }
  const childTerm = catalogue.terms?.child ?? "child";
  const ruleRef = (decidedBy: EffectRef | null) =>
    decidedBy ? (
      <Button
        size="sm"
        variant="ghost"
        className="h-auto min-h-0 px-1 py-0 text-xs"
        onPress={() => onShowRule(decidedBy.ruleId)}
      >
        #{decidedBy.ruleIndex + 1} {workflow.rules[decidedBy.ruleIndex]?.name}
      </Button>
    ) : (
      <span className="text-xs text-muted">no rule (denied by default)</span>
    );

  return (
    <div
      className={`flex flex-col gap-4 text-sm transition-opacity ${stale ? "opacity-50" : ""}`}
      aria-busy={stale}
    >
      {stale && (
        <p className="rounded-lg bg-warning-soft px-2 py-1 text-xs text-warning-soft-foreground">
          The draft has errors. Showing the last valid version.
        </p>
      )}
      <Section title={target.label}>
        <Decisions
          catalogue={catalogue}
          decisions={Object.values(result.subject.capabilities)}
          ruleRef={ruleRef}
        />
        <Limits
          catalogue={catalogue}
          limits={Object.values(result.subject.limits)}
          ruleRef={ruleRef}
        />
      </Section>
      {Object.entries(result.children).map(([childId, child]) => (
        <Section
          key={childId}
          title={`${target.childLabels[childId] ?? childId} (${childTerm})`}
        >
          <Decisions
            catalogue={catalogue}
            decisions={Object.values(child.capabilities)}
            ruleRef={ruleRef}
          />
          <Limits
            catalogue={catalogue}
            limits={Object.values(child.limits)}
            ruleRef={ruleRef}
          />
        </Section>
      ))}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-medium">{title}</h3>
      {children}
    </section>
  );
}

function Decisions({
  catalogue,
  decisions,
  ruleRef,
}: {
  catalogue: Catalogue;
  decisions: CapabilityDecision[];
  ruleRef: (d: EffectRef | null) => React.ReactNode;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {decisions.map((d) => (
        <li key={d.capability} className="flex flex-col gap-0.5">
          <div className="flex items-center justify-between gap-2">
            <span>{capabilityLabel(catalogue, d.capability)}</span>
            <Chip
              size="sm"
              variant="soft"
              color={d.allowed ? "success" : d.decidedBy ? "danger" : "default"}
            >
              {d.allowed ? "allowed" : d.decidedBy ? "denied" : "not decided"}
            </Chip>
          </div>
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted">
            {ruleRef(d.decidedBy)}
            {d.reason && <span>"{d.reason}"</span>}
          </div>
          {d.overridden.length > 0 && (
            <span className="text-xs text-muted">
              Also matched, too late:{" "}
              {d.overridden.map((o) => `#${o.ruleIndex + 1}`).join(", ")}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Limits({
  catalogue,
  limits,
  ruleRef,
}: {
  catalogue: Catalogue;
  limits: LimitDecision[];
  ruleRef: (d: EffectRef | null) => React.ReactNode;
}) {
  if (limits.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 border-t border-separator pt-2">
      {limits.map((l) => (
        <li
          key={l.limit}
          className="flex flex-wrap items-center justify-between gap-2"
        >
          <span className="text-muted">{limitLabel(catalogue, l.limit)}</span>
          <span className="flex items-center gap-1">
            <span className="font-medium">{l.value ?? "no limit"}</span>
            {l.decidedBy && ruleRef(l.decidedBy)}
          </span>
        </li>
      ))}
    </ul>
  );
}
