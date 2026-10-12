"use client";

import {
  Button,
  Input,
  Label,
  ListBox,
  NumberField,
  Select,
  Tag,
  TagGroup,
  TextField,
} from "@heroui/react";
import {
  type Catalogue,
  capabilityIds,
  capabilityPatterns,
  type Effect,
  expandPattern,
  limitIds,
  type Scope,
} from "@wb/workflow-engine";
import { capabilityLabel, defaultEffect, limitLabel } from "../model";
import { selectionToStrings } from "./selection";

interface Props {
  effect: Effect;
  catalogue: Catalogue;
  /** Per-child rules may only reach per-child capabilities and limits. */
  scope: Scope;
  problem?: string;
  onChange: (effect: Effect) => void;
  onRemove: () => void;
}

export function EffectRow({
  effect,
  catalogue,
  scope,
  problem,
  onChange,
  onRemove,
}: Props) {
  const childCaps = capabilityIds(catalogue, "child");
  // "Everything" is offered only to deny effects: paired with an allow in the
  // same rule it says "only these" (a lockdown). Allowing everything has no
  // sensible business use, so the builder does not offer it. A stored
  // workflow that already uses it still shows it.
  const patterns = capabilityPatterns(catalogue).filter(
    (p) =>
      (scope === "subject" || expandPattern(p, childCaps).length > 0) &&
      (p !== "*" ||
        effect.type === "capability.deny" ||
        (effect.type === "capability.allow" &&
          effect.capabilities.includes("*"))),
  );
  const limits =
    scope === "subject"
      ? catalogue.limits.map((l) => l.id)
      : limitIds(catalogue, "child");

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface-secondary p-2">
      <div className="flex flex-wrap items-start gap-2">
        <Select
          className="w-48"
          value={effect.type}
          onChange={(value) =>
            onChange(defaultEffect(value as Effect["type"], catalogue))
          }
        >
          <Label className="sr-only">Effect</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {catalogue.effects.map((e) => (
                <ListBox.Item key={e.type} id={e.type} textValue={e.label}>
                  {e.label}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        {effect.type === "limit.set" ? (
          <>
            <Select
              className="w-56"
              value={effect.limit || null}
              onChange={(value) =>
                onChange({ ...effect, limit: String(value) })
              }
            >
              <Label className="sr-only">Limit</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {limits.map((id) => (
                    <ListBox.Item
                      key={id}
                      id={id}
                      textValue={limitLabel(catalogue, id)}
                    >
                      {limitLabel(catalogue, id)}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
            <NumberField
              className="w-28"
              aria-label="Limit value"
              minValue={0}
              value={effect.value}
              onChange={(n) =>
                onChange({ ...effect, value: Math.max(0, Math.round(n ?? 0)) })
              }
            >
              <NumberField.Group>
                <NumberField.DecrementButton />
                <NumberField.Input />
                <NumberField.IncrementButton />
              </NumberField.Group>
            </NumberField>
          </>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <TagGroup
              aria-label="Capabilities"
              selectionMode="multiple"
              selectedKeys={new Set(effect.capabilities)}
              onSelectionChange={(keys) =>
                onChange({
                  ...effect,
                  capabilities: selectionToStrings(keys, patterns),
                })
              }
            >
              <TagGroup.List>
                {patterns.map((p) => (
                  <Tag key={p} id={p} textValue={capabilityLabel(catalogue, p)}>
                    {capabilityLabel(catalogue, p)}
                  </Tag>
                ))}
              </TagGroup.List>
            </TagGroup>
            {effect.type === "capability.deny" && (
              <p className="text-xs text-muted">
                Tip: "Everything" plus an Allow in the same rule means "only
                these". Named capabilities win over "Everything".
              </p>
            )}
            {effect.type === "capability.deny" && (
              <TextField
                value={effect.reason}
                onChange={(reason) => onChange({ ...effect, reason })}
              >
                <Label className="text-xs text-muted">
                  Reason shown to the customer
                </Label>
                <Input placeholder="e.g. Please contact support to cancel." />
              </TextField>
            )}
          </div>
        )}

        <Button
          size="sm"
          variant="ghost"
          aria-label="Remove effect"
          onPress={onRemove}
        >
          Remove
        </Button>
      </div>
      {problem && <p className="text-xs text-danger">{problem}</p>}
    </div>
  );
}
