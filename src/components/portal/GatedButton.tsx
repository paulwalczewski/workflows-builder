"use client";

import { Button, Tooltip } from "@heroui/react";
import type { CapabilityView } from "@/catalogue/guards";

type ButtonProps = React.ComponentProps<typeof Button>;

interface Props extends Omit<ButtonProps, "isDisabled" | "children"> {
  /** What the workflow, guards and limits say about this capability. */
  view: CapabilityView | undefined;
  children: React.ReactNode;
  /** Extra local reason to disable (e.g. a request in flight). */
  busy?: boolean;
  /** A reason that only applies in the UI, e.g. "Up to 5 per item." */
  localReason?: string | null;
}

/**
 * A button for one capability. Hidden capabilities render nothing; disabled
 * ones keep their place in the row and explain why in a tooltip, which a
 * focusable wrapper opens on hover or keyboard focus.
 */
export function GatedButton({
  view,
  children,
  busy = false,
  localReason = null,
  ...buttonProps
}: Props) {
  if (!view || view.availability === "hidden") return null;
  const reason =
    view.availability === "disabled"
      ? (view.reason ?? "Not available right now.")
      : localReason;

  if (!reason) {
    return (
      <Button {...buttonProps} isDisabled={busy}>
        {children}
      </Button>
    );
  }
  const label =
    typeof buttonProps["aria-label"] === "string"
      ? buttonProps["aria-label"]
      : typeof children === "string"
        ? children
        : "Unavailable";
  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger aria-label={`${label}, unavailable: ${reason}`}>
        <Button {...buttonProps} isDisabled>
          {children}
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content showArrow className="max-w-64">
        <Tooltip.Arrow />
        {reason}
      </Tooltip.Content>
    </Tooltip>
  );
}
