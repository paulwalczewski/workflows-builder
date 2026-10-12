"use client";

import { Button } from "@heroui/react";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { formatDateTime } from "@/catalogue/format";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Moves the page's "now" so time-based rules (the renewal lock) can be shown
 * live. The time travels in the URL as `?now=`, and server actions receive
 * it too, so what you see is what the server enforces.
 */
export function SimulateNow({
  now,
  simulated,
}: {
  now: string;
  simulated: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const go = (iso: string | null) =>
    startTransition(() =>
      router.push(
        iso ? `${pathname}?now=${encodeURIComponent(iso)}` : pathname,
      ),
    );
  const shift = (days: number) =>
    go(new Date(Date.parse(now) + days * DAY).toISOString());

  return (
    <div className="flex flex-col gap-2">
      <span>
        <span className="text-muted">Now: </span>
        <span className="font-medium">{formatDateTime(now)}</span>
        {simulated && <span className="text-muted"> (simulated)</span>}
      </span>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          isDisabled={pending}
          onPress={() => shift(-1)}
        >
          −1 day
        </Button>
        <Button
          size="sm"
          variant="secondary"
          isDisabled={pending}
          onPress={() => shift(1)}
        >
          +1 day
        </Button>
        <Button
          size="sm"
          variant="secondary"
          isDisabled={pending}
          onPress={() => shift(7)}
        >
          +7 days
        </Button>
        {simulated && (
          <Button
            size="sm"
            variant="ghost"
            isDisabled={pending}
            onPress={() => go(null)}
          >
            Back to real time
          </Button>
        )}
      </div>
    </div>
  );
}
