"use client";

import { Button } from "@heroui/react";
import { useTransition } from "react";
import { resetFixtures } from "@/app/portal/actions";

export function ResetFixturesButton({ size = "sm" }: { size?: "sm" | "md" }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      size={size}
      isPending={pending}
      onPress={() => startTransition(() => resetFixtures())}
    >
      Reset fixtures
    </Button>
  );
}
