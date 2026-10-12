"use client";

import {
  Button,
  Label,
  ListBox,
  NumberField,
  Select,
  Tag,
  TagGroup,
} from "@heroui/react";
import {
  type Catalogue,
  type Condition,
  type ConditionTrace,
  type FactDef,
  factDef,
  OPERATOR_LABELS,
  OPERATORS_BY_TYPE,
  type Operator,
} from "@wb/workflow-engine";
import {
  changeOperator,
  defaultCondition,
  fromDisplay,
  toDisplay,
} from "../model";
import { selectionToStrings } from "./selection";

interface Props {
  condition: Condition;
  catalogue: Catalogue;
  /** One trace per target the rule ran for (one for the subject, one per child). */
  traces: { label: string; trace: ConditionTrace }[];
  formatValue: (fact: FactDef | undefined, value: unknown) => string;
  problem?: string;
  onChange: (condition: Condition) => void;
  onRemove: () => void;
}

export function ConditionRow({
  condition,
  catalogue,
  traces,
  formatValue,
  problem,
  onChange,
  onRemove,
}: Props) {
  const fact = factDef(catalogue, condition.fact);
  const childTerm = catalogue.terms?.child ?? "child";
  const operators = fact ? OPERATORS_BY_TYPE[fact.type] : [];

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface-secondary p-2">
      <div className="flex flex-wrap items-end gap-2">
        <Select
          className="w-56"
          value={condition.fact}
          onChange={(value) => {
            const next = factDef(catalogue, String(value));
            if (next) onChange(defaultCondition(next));
          }}
        >
          <Label className="sr-only">Fact</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {catalogue.facts.map((f) => (
                <ListBox.Item key={f.id} id={f.id} textValue={f.label}>
                  {f.label}
                  {f.scope === "child" ? ` (per ${childTerm})` : ""}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        {fact && (
          <Select
            className="w-40"
            value={condition.op}
            onChange={(value) =>
              onChange(changeOperator(condition, fact, value as Operator))
            }
          >
            <Label className="sr-only">Comparison</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {operators.map((op) => (
                  <ListBox.Item
                    key={op}
                    id={op}
                    textValue={OPERATOR_LABELS[op]}
                  >
                    {OPERATOR_LABELS[op]}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        )}

        {fact && (
          <ValueEditor
            fact={fact}
            condition={condition}
            onChange={(value) => onChange({ ...condition, value })}
          />
        )}

        <Button
          size="sm"
          variant="ghost"
          aria-label="Remove condition"
          onPress={onRemove}
        >
          Remove
        </Button>
      </div>
      {problem && <p className="text-xs text-danger">{problem}</p>}
      {traces.length > 0 && (
        <p className="text-xs text-muted">
          {traces.map(({ label, trace }, i) => (
            <span
              key={label}
              className={trace.pass ? "text-success" : undefined}
            >
              {i > 0 ? " · " : ""}
              {trace.pass ? "✓" : "✗"} {traces.length > 1 ? `${label}: ` : ""}
              {formatValue(fact, trace.actual)}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

function ValueEditor({
  fact,
  condition,
  onChange,
}: {
  fact: FactDef;
  condition: Condition;
  onChange: (value: Condition["value"]) => void;
}) {
  const scale = fact.scale ?? 1;
  const decimals = scale > 1 ? Math.round(Math.log10(scale)) : 0;
  const number = (label: string, value: number, set: (n: number) => void) => (
    <NumberField
      className="w-32"
      aria-label={label}
      value={toDisplay(value, scale)}
      formatOptions={{ maximumFractionDigits: decimals }}
      onChange={(n) =>
        set(fromDisplay(Number.isFinite(n) ? (n as number) : 0, scale))
      }
    >
      <NumberField.Group>
        <NumberField.Input />
      </NumberField.Group>
    </NumberField>
  );

  if (fact.type === "number") {
    if (condition.op === "between") {
      const [lo, hi] = Array.isArray(condition.value)
        ? (condition.value as number[])
        : [0, 0];
      return (
        <div className="flex items-center gap-2">
          {number("From", lo, (n) => onChange([n, hi]))}
          <span className="text-sm text-muted">and</span>
          {number("To", hi, (n) => onChange([lo, n]))}
          {fact.unit && <span className="text-xs text-muted">{fact.unit}</span>}
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
        {number(
          "Value",
          typeof condition.value === "number" ? condition.value : 0,
          onChange,
        )}
        {fact.unit && <span className="text-xs text-muted">{fact.unit}</span>}
      </div>
    );
  }

  if (fact.type === "boolean") {
    return (
      <Select
        className="w-28"
        value={condition.value === true ? "true" : "false"}
        onChange={(value) => onChange(value === "true")}
      >
        <Label className="sr-only">Value</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id="true" textValue="yes">
              yes
              <ListBox.ItemIndicator />
            </ListBox.Item>
            <ListBox.Item id="false" textValue="no">
              no
              <ListBox.ItemIndicator />
            </ListBox.Item>
          </ListBox>
        </Select.Popover>
      </Select>
    );
  }

  const selected = Array.isArray(condition.value)
    ? (condition.value as string[])
    : [];
  return (
    <TagGroup
      aria-label={`${fact.label} values`}
      selectionMode="multiple"
      selectedKeys={new Set(selected)}
      onSelectionChange={(keys) =>
        onChange(
          selectionToStrings(keys, fact.options?.map((o) => o.value) ?? []),
        )
      }
    >
      <TagGroup.List>
        {(fact.options ?? []).map((o) => (
          <Tag key={o.value} id={o.value}>
            {o.label}
          </Tag>
        ))}
      </TagGroup.List>
    </TagGroup>
  );
}
