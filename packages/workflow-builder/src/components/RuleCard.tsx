"use client";

import {
  Button,
  Card,
  Chip,
  Input,
  Label,
  ListBox,
  Select,
  TextField,
} from "@heroui/react";
import {
  type Catalogue,
  type Diagnostic,
  type FactDef,
  type Rule,
  type RuleTrace,
  ruleScope,
} from "@wb/workflow-engine";
import { defaultCondition, defaultEffect, removeAt, replaceAt } from "../model";
import { ConditionRow } from "./ConditionRow";
import { EffectRow } from "./EffectRow";

interface Props {
  rule: Rule;
  index: number;
  count: number;
  catalogue: Catalogue;
  diagnostics: Diagnostic[];
  /** How this rule fared in the current preview, if any. */
  trace: RuleTrace | undefined;
  childLabels: Record<string, string>;
  formatValue: (fact: FactDef | undefined, value: unknown) => string;
  highlighted: boolean;
  onChange: (rule: Rule) => void;
  onMove: (to: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

export function RuleCard({
  rule,
  index,
  count,
  catalogue,
  diagnostics,
  trace,
  childLabels,
  formatValue,
  highlighted,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
}: Props) {
  const scope = ruleScope(rule, catalogue);
  const childTerm = catalogue.terms?.child ?? "child";
  const general = diagnostics.filter(
    (d) => d.conditionIndex === undefined && d.effectIndex === undefined,
  );
  const atCondition = (i: number) =>
    diagnostics.find((d) => d.conditionIndex === i)?.message;
  const atEffect = (i: number) =>
    diagnostics
      .filter((d) => d.effectIndex === i)
      .map((d) => d.message)
      .join(" ") || undefined;

  const matches = trace?.evaluations.filter((e) => e.matched).length ?? 0;
  const runs = trace?.evaluations.length ?? 0;
  const label = (targetId: string | null) =>
    targetId === null ? "this" : (childLabels[targetId] ?? targetId);
  const setConditions = (conditions: Rule["when"]["conditions"]) =>
    onChange({ ...rule, when: { ...rule.when, conditions } });

  return (
    <Card
      id={`rule-card-${rule.id}`}
      className={`scroll-mt-24 transition-shadow ${highlighted ? "ring-2 ring-accent" : ""}`}
    >
      <Card.Header className="gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-muted">#{index + 1}</span>
          <TextField
            className="min-w-48 flex-1"
            aria-label="Rule name"
            value={rule.name}
            onChange={(name) => onChange({ ...rule, name })}
          >
            <Input className="font-medium" />
          </TextField>
          {trace && (
            <Chip
              size="sm"
              variant="soft"
              color={matches > 0 ? "success" : "default"}
            >
              {scope === "child"
                ? `matches ${matches} of ${runs} ${childTerm}s`
                : matches > 0
                  ? "matches"
                  : "does not match"}
            </Chip>
          )}
          <div className="flex gap-1">
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label="Move rule up"
              isDisabled={index === 0}
              onPress={() => onMove(index - 1)}
            >
              ↑
            </Button>
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label="Move rule down"
              isDisabled={index === count - 1}
              onPress={() => onMove(index + 1)}
            >
              ↓
            </Button>
            <Button size="sm" variant="ghost" onPress={onDuplicate}>
              Duplicate
            </Button>
            <Button size="sm" variant="ghost" onPress={onRemove}>
              Delete
            </Button>
          </div>
        </div>
        {scope === "child" && (
          <p className="text-xs text-muted">
            Reads a per-{childTerm} fact, so it runs once per {childTerm} and
            can only change per-{childTerm} capabilities and limits.
          </p>
        )}
        {general.length > 0 && (
          <ul className="flex flex-col gap-1">
            {general.map((d) => (
              <li
                key={`${d.code}-${d.message}`}
                className={`rounded-lg px-2 py-1 text-xs ${d.severity === "error" ? "bg-danger-soft text-danger-soft-foreground" : "bg-warning-soft text-warning-soft-foreground"}`}
              >
                {d.severity === "error" ? "Error: " : "Warning: "}
                {d.message}
              </li>
            ))}
          </ul>
        )}
      </Card.Header>

      <Card.Content className="flex flex-col gap-4">
        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">When</span>
            {rule.when.conditions.length > 1 ? (
              <Select
                className="w-28"
                value={rule.when.match}
                onChange={(value) =>
                  onChange({
                    ...rule,
                    when: { ...rule.when, match: value as "all" | "any" },
                  })
                }
              >
                <Label className="sr-only">Match</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item id="all" textValue="all">
                      all
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item id="any" textValue="any">
                      any
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
            ) : null}
            <span className="text-muted">
              {rule.when.conditions.length === 0
                ? "always (no conditions)"
                : rule.when.conditions.length > 1
                  ? "of these hold"
                  : "this holds"}
            </span>
          </div>
          {rule.when.conditions.map((condition, i) => (
            <ConditionRow
              // biome-ignore lint/suspicious/noArrayIndexKey: conditions have no id; position is their identity
              key={i}
              condition={condition}
              catalogue={catalogue}
              problem={atCondition(i)}
              formatValue={formatValue}
              traces={(trace?.evaluations ?? [])
                .map((e) => ({
                  label: label(e.targetId),
                  trace: e.conditions[i],
                }))
                .filter((t) => t.trace !== undefined)}
              onChange={(next) =>
                setConditions(replaceAt(rule.when.conditions, i, next))
              }
              onRemove={() => setConditions(removeAt(rule.when.conditions, i))}
            />
          ))}
          <div>
            <Button
              size="sm"
              variant="secondary"
              isDisabled={catalogue.facts.length === 0}
              onPress={() =>
                setConditions([
                  ...rule.when.conditions,
                  defaultCondition(catalogue.facts[0]),
                ])
              }
            >
              Add condition
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <span className="text-sm font-medium">Then</span>
          {rule.then.map((effect, i) => (
            <EffectRow
              // biome-ignore lint/suspicious/noArrayIndexKey: effects have no id; position is their identity
              key={i}
              effect={effect}
              catalogue={catalogue}
              scope={scope}
              problem={atEffect(i)}
              onChange={(next) =>
                onChange({
                  ...rule,
                  then: replaceAt(rule.then, i, next),
                })
              }
              onRemove={() =>
                onChange({ ...rule, then: removeAt(rule.then, i) })
              }
            />
          ))}
          <div>
            <Button
              size="sm"
              variant="secondary"
              isDisabled={catalogue.effects.length === 0}
              onPress={() =>
                onChange({
                  ...rule,
                  then: [
                    ...rule.then,
                    defaultEffect(catalogue.effects[0].type, catalogue),
                  ],
                })
              }
            >
              Add effect
            </Button>
          </div>
        </section>
      </Card.Content>
    </Card>
  );
}
