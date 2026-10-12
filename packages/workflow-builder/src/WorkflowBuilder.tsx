"use client";

import {
  Button,
  Card,
  Input,
  Label,
  ListBox,
  Select,
  Tabs,
  TextArea,
  TextField,
} from "@heroui/react";
import { type FactDef, formatFactValue, withUnit } from "@wb/workflow-engine";
import { useState } from "react";
import { JsonPanel } from "./components/JsonPanel";
import { PreviewPanel } from "./components/PreviewPanel";
import { RuleCard } from "./components/RuleCard";
import {
  addRule,
  duplicateRule,
  moveRule,
  removeRule,
  replaceRule,
} from "./model";
import type { WorkflowBuilderProps } from "./types";
import { usePreview } from "./usePreview";

const DAY = 24 * 60 * 60 * 1000;
const SHIFTS = [
  [-1, "−1 day"],
  [1, "+1 day"],
  [7, "+7 days"],
] as const;

/**
 * A catalogue-driven editor for an ordered rule list, with a live preview of
 * what one chosen subject could do. Knows nothing about the host product:
 * facts, capabilities, limits and effects all come from `catalogue`.
 */
export function WorkflowBuilder<Data>({
  value,
  onChange,
  catalogue,
  previewSubjects,
  resolveFacts,
  initialNow,
}: WorkflowBuilderProps<Data>) {
  const [subjectId, setSubjectId] = useState(previewSubjects[0]?.id);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [startNow] = useState(() => initialNow ?? new Date().toISOString());
  const [now, setNow] = useState(startNow);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [tab, setTab] = useState("preview");

  const preview = usePreview({
    workflow: value,
    catalogue,
    subjects: previewSubjects,
    resolveFacts,
    subjectId,
    targetId,
    now,
  });
  const { check, targets, target, result, evaluated, stale } = preview;

  const formatValue = (fact: FactDef | undefined, v: unknown) =>
    target?.formatFact && fact
      ? target.formatFact(fact.id, v as never)
      : formatFactValue(fact, v as never);

  const showRule = (ruleId: string) => {
    setHighlight(ruleId);
    document
      .getElementById(`rule-card-${ruleId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => setHighlight(null), 1600);
  };

  const workflowLevel = check.diagnostics.filter(
    (d) => d.ruleIndex === undefined,
  );
  const errorCount = check.diagnostics.filter(
    (d) => d.severity === "error",
  ).length;
  const warningCount = check.diagnostics.filter(
    (d) => d.severity === "warning",
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <Card.Content className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <div className="flex flex-col gap-3">
            <TextField
              value={value.name}
              onChange={(name) => onChange({ ...value, name })}
            >
              <Label>Workflow name</Label>
              <Input />
            </TextField>
            <TextField
              value={value.description ?? ""}
              onChange={(description) =>
                onChange(
                  description
                    ? { ...value, description }
                    : (({ description: _, ...rest }) => rest)(value),
                )
              }
            >
              <Label>Description</Label>
              <TextArea rows={2} />
            </TextField>
          </div>
          <div className="flex flex-col gap-3">
            <Select
              value={value.trigger}
              onChange={(trigger) =>
                onChange({ ...value, trigger: String(trigger) })
              }
            >
              <Label>Runs when</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {catalogue.triggers.map((t) => (
                    <ListBox.Item key={t.id} id={t.id} textValue={t.label}>
                      {t.label}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
            <p className="text-sm text-muted">
              Rules are read top to bottom. For each capability and limit, the
              highest matching rule that mentions it decides. Anything no rule
              decides is denied.
            </p>
            <p className="text-sm" aria-live="polite">
              {errorCount === 0
                ? "No errors"
                : withUnit(String(errorCount), errorCount, "errors")}
              {", "}
              {warningCount === 0
                ? "no warnings"
                : withUnit(String(warningCount), warningCount, "warnings")}
            </p>
          </div>
        </Card.Content>
      </Card>

      {workflowLevel.length > 0 && (
        <ul className="flex flex-col gap-1">
          {workflowLevel.map((d) => (
            <li
              key={`${d.code}-${d.message}`}
              className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground"
            >
              {d.message}
            </li>
          ))}
        </ul>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-4">
          {value.rules.length === 0 && (
            <p className="text-muted">
              No rules yet, so everything is denied. Add a rule to get started.
            </p>
          )}
          {value.rules.map((rule, index) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              index={index}
              count={value.rules.length}
              catalogue={catalogue}
              diagnostics={check.diagnostics.filter(
                (d) => d.ruleIndex === index,
              )}
              trace={
                stale
                  ? undefined
                  : result?.trace.find((t) => t.ruleIndex === index)
              }
              childLabels={target?.childLabels ?? {}}
              formatValue={formatValue}
              highlighted={highlight === rule.id}
              onChange={(next) => onChange(replaceRule(value, index, next))}
              onMove={(to) => onChange(moveRule(value, index, to))}
              onDuplicate={() => onChange(duplicateRule(value, index))}
              onRemove={() => onChange(removeRule(value, index))}
            />
          ))}
          <div>
            <Button
              variant="secondary"
              onPress={() => onChange(addRule(value))}
            >
              Add rule
            </Button>
          </div>
        </div>

        <aside
          aria-label="Preview and JSON"
          className="flex min-w-0 flex-col gap-4 rounded-3xl border border-separator bg-surface p-4 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto"
        >
          <div className="flex flex-col gap-3">
            <Select
              value={subjectId ?? null}
              onChange={(id) => {
                setSubjectId(String(id));
                setTargetId(null);
              }}
            >
              <Label>Preview as</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {previewSubjects.map((s) => (
                    <ListBox.Item key={s.id} id={s.id} textValue={s.label}>
                      {s.label}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
            {targets.length > 1 && (
              <Select
                value={target?.id ?? null}
                onChange={(id) => setTargetId(String(id))}
              >
                <Label>Which one</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {targets.map((t) => (
                      <ListBox.Item key={t.id} id={t.id} textValue={t.label}>
                        {t.label}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            )}
            <div className="flex flex-col gap-1 text-sm">
              <span>
                <span className="text-muted">Preview time: </span>
                {new Date(now).toUTCString()}
              </span>
              <div className="flex flex-wrap gap-2">
                {SHIFTS.map(([days, label]) => (
                  <Button
                    key={days}
                    size="sm"
                    variant="secondary"
                    onPress={() =>
                      setNow(
                        new Date(Date.parse(now) + days * DAY).toISOString(),
                      )
                    }
                  >
                    {label}
                  </Button>
                ))}
                {now !== startNow && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => setNow(startNow)}
                  >
                    Reset time
                  </Button>
                )}
              </div>
            </div>
          </div>

          <Tabs
            selectedKey={tab}
            onSelectionChange={(key) => setTab(String(key))}
          >
            <Tabs.ListContainer>
              <Tabs.List aria-label="Preview or JSON">
                <Tabs.Tab id="preview">
                  Preview
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab id="json">
                  JSON
                  <Tabs.Indicator />
                </Tabs.Tab>
              </Tabs.List>
            </Tabs.ListContainer>
            <Tabs.Panel id="preview" className="pt-3">
              <PreviewPanel
                catalogue={catalogue}
                result={result}
                workflow={evaluated}
                target={target}
                stale={stale}
                onShowRule={showRule}
              />
            </Tabs.Panel>
            <Tabs.Panel id="json" className="pt-3">
              <JsonPanel workflow={value} />
            </Tabs.Panel>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}
