"use client";

import { Button, Chip } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Customer, Product } from "@/domain/types";
import { DebugPanel } from "./DebugPanel";
import { SubscriptionCard } from "./SubscriptionCard";
import type { PortalRun } from "./types";

interface Props {
  customer: Customer;
  runs: PortalRun[];
  products: Product[];
  now: string;
  simulated: boolean;
}

export function PortalView({
  customer,
  runs,
  products,
  now,
  simulated,
}: Props) {
  const router = useRouter();
  const [panelOpen, setPanelOpen] = useState(false);
  const [selected, setSelected] = useState(runs[0]?.subscription.id ?? "");
  const [showSupport, setShowSupport] = useState(false);

  const explain = (subscriptionId: string) => {
    setSelected(subscriptionId);
    setPanelOpen(true);
  };

  const goBack = () => {
    // Opened directly (no history in this tab): fall back to the customer list.
    if (window.history.length > 1) router.back();
    else router.push("/portal");
  };

  return (
    <div
      className={`flex w-full flex-col gap-6 ${panelOpen ? "" : "mx-auto max-w-3xl"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            aria-label="Back"
            onPress={goBack}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 3 5 8l5 5" />
            </svg>
          </Button>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {customer.displayName}
              </h1>
              {customer.tier === "pro" && (
                <Chip color="accent" variant="soft">
                  Pro
                </Chip>
              )}
            </div>
            <p className="text-sm text-muted">
              You only see what you can do right now.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant={panelOpen ? "primary" : "secondary"}
          aria-expanded={panelOpen}
          aria-controls="debug-panel"
          onPress={() => setPanelOpen((open) => !open)}
        >
          {panelOpen ? "Hide debug panel" : "Show debug panel"}
        </Button>
      </div>

      {simulated && !panelOpen && (
        <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
          Time is simulated for this page. Open the debug panel to change it.
        </p>
      )}

      <div
        className={
          panelOpen
            ? "grid items-start justify-center gap-6 lg:grid-cols-[minmax(0,48rem)_420px]"
            : "grid gap-6"
        }
      >
        <div className="flex min-w-0 flex-col gap-6">
          {runs.map((run) => (
            <SubscriptionCard
              key={run.subscription.id}
              run={run}
              products={products}
              simulatedNow={simulated ? now : null}
              onExplain={() => explain(run.subscription.id)}
            />
          ))}

          <section
            aria-label="Support"
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-separator px-4 py-3 text-sm"
          >
            <span className="text-muted">
              {showSupport
                ? "Our team answers at support@example.com within one working day."
                : "Something you cannot do here?"}
            </span>
            <Button
              size="sm"
              variant="secondary"
              onPress={() => setShowSupport((v) => !v)}
            >
              {showSupport ? "Close" : "Contact support"}
            </Button>
          </section>
        </div>
        {panelOpen && (
          <aside
            id="debug-panel"
            aria-label="Debug panel"
            className="min-w-0 rounded-3xl border border-separator bg-surface p-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto"
          >
            <DebugPanel
              runs={runs}
              selected={selected}
              onSelect={setSelected}
              now={now}
              simulated={simulated}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
