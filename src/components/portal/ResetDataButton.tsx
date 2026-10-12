"use client";

import { Button, Tooltip } from "@heroui/react";
import { useTransition } from "react";
import { resetData } from "@/app/portal/actions";

const RESET_DATA_HINT =
  "Restores customers, subscriptions and workflows to the base fixtures and clears the runtime log.";

export function ResetDataButton({ size = "sm" }: { size?: "sm" | "md" }) {
  const [pending, startTransition] = useTransition();
  return (
    <Tooltip delay={300}>
      <Button
        variant="secondary"
        size={size}
        isPending={pending}
        onPress={() => startTransition(() => resetData())}
      >
        Reset data
      </Button>
      <Tooltip.Content showArrow className="max-w-64">
        <Tooltip.Arrow />
        {RESET_DATA_HINT}
      </Tooltip.Content>
    </Tooltip>
  );
}
