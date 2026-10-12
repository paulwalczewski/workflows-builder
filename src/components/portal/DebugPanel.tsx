"use client";

import { Chip, Tabs } from "@heroui/react";
import {
  type CapabilityDecision,
  type Effect,
  OPERATOR_LABELS,
} from "@wb/workflow-engine";
import { capabilityLabel, factLabel, limitLabel } from "@/catalogue/catalogue";
import {
  formatDateTime,
  formatExpected,
  formatFact,
  subscriptionTitle,
} from "@/catalogue/format";
import type { CapabilityView } from "@/catalogue/guards";
import { ResetDataButton } from "./ResetDataButton";
import { SimulateNow } from "./SimulateNow";
import type { PortalRun } from "./types";

interface Props {
  runs: PortalRun[];
  selected: string;
  onSelect: (subscriptionId: string) => void;
  now: string;
  simulated: boolean;
}

/**
 * The "why" side panel: for each subscription on the page, the run that
 * produced what the customer sees. Same data as the runtime log line.
 */
export function DebugPanel({
  runs,
  selected,
  onSelect,
  now,
  simulated,
}: Props) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-col gap-3 rounded-2xl bg-surface-secondary p-3">
        <SimulateNow now={now} simulated={simulated} />
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted">
            Every run is appended to <code>logs/runtime.jsonl</code>.
          </span>
          <ResetDataButton />
        </div>
      </div>

      {runs.length === 0 ? (
        <p className="text-muted">This customer has no subscriptions.</p>
      ) : (
        <Tabs
          selectedKey={selected}
          onSelectionChange={(key) => onSelect(String(key))}
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label="Subscription runs">
              {runs.map((run) => (
                <Tabs.Tab key={run.subscription.id} id={run.subscription.id}>
                  {run.subscription.id}
                  <Tabs.Indicator />
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>
          {runs.map((run) => (
            <Tabs.Panel key={run.subscription.id} id={run.subscription.id}>
              <RunDetails run={run} />
            </Tabs.Panel>
          ))}
        </Tabs>
      )}
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
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

function RunDetails({ run }: { run: PortalRun }) {
  const { subscription, workflow, input, result, view } = run;
  const currency = subscription.currencyCode;
  const itemTitle = (id: string | null) =>
    id === null
      ? "subscription"
      : (subscription.items.find((i) => i.id === id)?.title ?? id);
  const ruleName = (ruleIndex: number) =>
    `#${ruleIndex + 1} ${workflow.rules[ruleIndex]?.name ?? ""}`;

  return (
    <div className="flex flex-col gap-5 pt-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted">Subscription</dt>
        <dd>{subscriptionTitle(subscription)}</dd>
        <dt className="text-muted">Workflow</dt>
        <dd>
          {workflow.name}{" "}
          <span className="text-muted">({workflow.id}, published)</span>
        </dd>
        <dt className="text-muted">Evaluated at</dt>
        <dd>{formatDateTime(run.now)}</dd>
        <dt className="text-muted">Run id</dt>
        <dd className="break-all font-mono text-xs">{run.runId}</dd>
      </dl>

      <Section title="Facts">
        <table className="w-full">
          <tbody>
            {Object.entries(input.facts).map(([fact, value]) => (
              <tr
                key={fact}
                className="border-b border-separator last:border-0"
              >
                <td className="py-1 pr-3 text-muted">{factLabel(fact)}</td>
                <td className="py-1 text-right font-medium">
                  {formatFact(fact, value, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {input.children.map((child) => (
          <p key={child.id} className="text-muted">
            {itemTitle(child.id)}:{" "}
            {Object.entries(child.facts)
              .map(([f, v]) => `${factLabel(f)} ${formatFact(f, v, currency)}`)
              .join(", ")}
          </p>
        ))}
      </Section>

      <Section title="Rules, top to bottom">
        <ol className="flex flex-col gap-3">
          {result.trace.map((rt) => {
            const rule = workflow.rules[rt.ruleIndex];
            const anyMatch = rt.evaluations.some((e) => e.matched);
            return (
              <li
                key={rt.ruleId}
                className="flex flex-col gap-1 rounded-xl border border-separator p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    #{rt.ruleIndex + 1} {rt.name}
                  </span>
                  <Chip
                    size="sm"
                    variant="soft"
                    color={anyMatch ? "success" : "default"}
                  >
                    {anyMatch ? "matched" : "did not match"}
                  </Chip>
                </div>
                {rt.scope === "child" && (
                  <span className="text-xs text-muted">
                    Runs once per item.
                  </span>
                )}
                {rt.evaluations.map((ev) => (
                  <div
                    key={ev.targetId ?? "subject"}
                    className="flex flex-col gap-0.5"
                  >
                    {rt.scope === "child" && (
                      <span className="text-xs">
                        {itemTitle(ev.targetId)}:{" "}
                        {ev.matched ? "matched" : "no match"}
                      </span>
                    )}
                    {ev.conditions.length === 0 ? (
                      <span className="text-xs text-muted">
                        No conditions, always matches.
                      </span>
                    ) : (
                      ev.conditions.map((c, i) => (
                        <span
                          // biome-ignore lint/suspicious/noArrayIndexKey: conditions have no id and never reorder here
                          key={i}
                          className={`text-xs ${c.pass ? "text-success" : "text-muted"}`}
                        >
                          {c.pass ? "✓" : "✗"} {factLabel(c.fact)}{" "}
                          {OPERATOR_LABELS[c.op]}{" "}
                          {formatExpected(c.fact, c.expected, currency)} (is{" "}
                          {formatFact(c.fact, c.actual ?? null, currency)})
                        </span>
                      ))
                    )}
                  </div>
                ))}
                {rule && (
                  <span className="text-xs text-muted">
                    Then: {rule.then.map(describeEffect).join("; ")}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </Section>

      <Section title="What the customer can do">
        <DecisionList
          views={Object.values(view.capabilities)}
          ruleName={ruleName}
        />
        {subscription.items.map((item) => (
          <div key={item.id} className="flex flex-col gap-1">
            <span className="font-medium">{item.title}</span>
            <DecisionList
              views={Object.values(view.items[item.id] ?? {})}
              ruleName={ruleName}
            />
          </div>
        ))}
      </Section>

      <Section title="Limits">
        <ul className="flex flex-col gap-1">
          <LimitLine
            label={limitLabel("subscription.maxItems")}
            decision={result.subject.limits["subscription.maxItems"]}
            ruleName={ruleName}
          />
          {subscription.items.map((item) => (
            <LimitLine
              key={item.id}
              label={`${limitLabel("item.maxQuantity")}, ${item.title}`}
              decision={result.children[item.id]?.limits["item.maxQuantity"]}
              ruleName={ruleName}
            />
          ))}
        </ul>
      </Section>

      <Section title="Recent actions">
        {run.recent.length === 0 ? (
          <p className="text-muted">None yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {run.recent.map((a) => (
              <li key={`${a.runId}-${a.at}`} className="flex flex-col">
                <span>
                  <Chip
                    size="sm"
                    variant="soft"
                    color={a.outcome === "performed" ? "success" : "danger"}
                  >
                    {a.outcome}
                  </Chip>{" "}
                  {capabilityLabel(a.capability)}
                  {a.itemId ? `, ${itemTitle(a.itemId)}` : ""}
                </span>
                <span className="text-xs text-muted">
                  {formatDateTime(a.at)}
                  {a.reason ? `. ${a.reason}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

const availabilityColor = {
  enabled: "success",
  disabled: "warning",
  hidden: "default",
} as const;

function DecisionList({
  views,
  ruleName,
}: {
  views: CapabilityView[];
  ruleName: (ruleIndex: number) => string;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {views.map((v) => (
        <li key={v.capability} className="flex flex-col gap-0.5">
          <div className="flex items-center justify-between gap-2">
            <span>{capabilityLabel(v.capability)}</span>
            <Chip
              size="sm"
              variant="soft"
              color={availabilityColor[v.availability]}
            >
              {v.availability}
            </Chip>
          </div>
          <span className="text-xs text-muted">{explain(v, ruleName)}</span>
          {v.decision.overridden.length > 0 && (
            <span className="text-xs text-muted">
              Overrode:{" "}
              {v.decision.overridden
                .map(
                  (o) =>
                    `${ruleName(o.ruleIndex)} (${o.allowed ? "allow" : "deny"})`,
                )
                .join(", ")}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function explain(
  view: CapabilityView,
  ruleName: (ruleIndex: number) => string,
): string {
  const decided = (d: CapabilityDecision) =>
    d.decidedBy
      ? `${d.allowed ? "Allowed" : "Denied"} by rule ${ruleName(d.decidedBy.ruleIndex)}`
      : "No rule mentions it, so it is denied by default";
  switch (view.source) {
    case "default":
      return `${decided(view.decision)}. Hidden.`;
    case "rule":
      return view.availability === "enabled"
        ? `${decided(view.decision)}.`
        : `${decided(view.decision)}: "${view.reason}"`;
    case "guard":
      return `${decided(view.decision)}, but blocked by a product guard: "${view.reason}"`;
    case "limit":
      return `${decided(view.decision)}, but a limit is reached: "${view.reason}"`;
  }
}

function LimitLine({
  label,
  decision,
  ruleName,
}: {
  label: string;
  decision:
    | { value: number | null; decidedBy: { ruleIndex: number } | null }
    | undefined;
  ruleName: (ruleIndex: number) => string;
}) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="text-muted">{label}</span>
      <span>
        {decision?.value ?? "no limit"}
        {decision?.decidedBy && (
          <span className="text-xs text-muted">
            {" "}
            from {ruleName(decision.decidedBy.ruleIndex)}
          </span>
        )}
      </span>
    </li>
  );
}

function describeEffect(effect: Effect): string {
  switch (effect.type) {
    case "capability.allow":
      return `allow ${effect.capabilities.join(", ")}`;
    case "capability.deny":
      return `deny ${effect.capabilities.join(", ")}`;
    case "limit.set":
      return `set ${effect.limit} to ${effect.value}`;
  }
}
