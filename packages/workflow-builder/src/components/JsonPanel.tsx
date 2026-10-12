"use client";

import { Button } from "@heroui/react";
import { serializeWorkflow, type Workflow } from "@wb/workflow-engine";
import { useState } from "react";

/** The exact JSON the runtime will load, live as the merchant edits. */
export function JsonPanel({ workflow }: { workflow: Workflow }) {
  const text = serializeWorkflow(workflow);
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">
          Canonical JSON, validated against the workflow JSON Schema.
        </span>
        <Button
          size="sm"
          variant="secondary"
          onPress={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre
        data-testid="workflow-json"
        className="max-h-[70vh] overflow-auto rounded-xl bg-surface-secondary p-3 font-mono text-xs leading-relaxed"
      >
        {text}
      </pre>
    </div>
  );
}
