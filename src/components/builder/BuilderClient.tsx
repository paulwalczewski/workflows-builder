"use client";

import { Button, Chip } from "@heroui/react";
import { type PreviewSubject, WorkflowBuilder } from "@wb/workflow-builder";
import {
  checkWorkflow,
  type Diagnostic,
  serializeWorkflow,
  type Workflow,
} from "@wb/workflow-engine";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  publishWorkflowAction,
  saveWorkflowAction,
} from "@/app/builder/actions";
import { subscriptionCatalogue } from "@/catalogue/catalogue";
import {
  type CustomerPreviewData,
  resolveCustomerTargets,
} from "@/catalogue/preview";
import { Notice } from "@/components/Notice";
import { downloadWorkflow } from "./download";

interface Props {
  saved: Workflow;
  subjects: PreviewSubject<CustomerPreviewData>[];
  now: string;
}

/**
 * The host side of the builder: owns the draft, saves it through a server
 * action that runs the same checks as the runtime, and publishes it.
 */
export function BuilderClient({ saved, subjects, now }: Props) {
  const [draft, setDraft] = useState(saved);
  const [lastSaved, setLastSaved] = useState(saved);
  const [serverErrors, setServerErrors] = useState<Diagnostic[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const savedText = useMemo(() => serializeWorkflow(lastSaved), [lastSaved]);
  const dirty = useMemo(
    () => serializeWorkflow(draft) !== savedText,
    [draft, savedText],
  );
  const check = useMemo(
    () => checkWorkflow(draft, subscriptionCatalogue),
    [draft],
  );

  /** Saves the draft; resolves to whether the server accepted it. */
  const persist = async () => {
    const outcome = await saveWorkflowAction(draft);
    if (outcome.ok) {
      setLastSaved(outcome.workflow);
      setDraft(outcome.workflow);
      setServerErrors(null);
      setMessage("Saved.");
    } else {
      setServerErrors(outcome.diagnostics);
      setMessage(null);
    }
    return outcome.ok;
  };

  const save = () =>
    startTransition(async () => {
      await persist();
    });

  const publish = () =>
    startTransition(async () => {
      if (dirty && !(await persist())) return;
      await publishWorkflowAction(draft.id);
      setLastSaved((w) => ({ ...w, status: "published" }));
      setDraft((w) => ({ ...w, status: "published" }));
      setMessage("Published. The customer portal now runs this workflow.");
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="sticky top-14 z-30 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-separator bg-background/90 px-4 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/builder" className="text-sm text-muted hover:underline">
            Workflows
          </Link>
          <span className="text-muted">/</span>
          <h1 className="truncate text-lg font-semibold">{draft.name}</h1>
          <Chip
            size="sm"
            variant="soft"
            color={lastSaved.status === "published" ? "success" : "default"}
          >
            {lastSaved.status === "published" ? "Published" : "Draft"}
          </Chip>
          {dirty && (
            <Chip size="sm" variant="soft" color="warning">
              Unsaved changes
            </Chip>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            isDisabled={!dirty || pending}
            onPress={() => {
              setDraft(lastSaved);
              setServerErrors(null);
            }}
          >
            Discard changes
          </Button>
          <Button variant="ghost" onPress={() => downloadWorkflow(draft)}>
            Export JSON
          </Button>
          <Button
            variant="secondary"
            isPending={pending}
            isDisabled={!dirty || !check.ok}
            onPress={save}
          >
            Save
          </Button>
          {(lastSaved.status !== "published" || dirty) && (
            <Button
              variant="primary"
              isDisabled={pending || !check.ok}
              onPress={publish}
            >
              {dirty ? "Save and publish" : "Publish"}
            </Button>
          )}
        </div>
      </div>

      {message && !dirty && <Notice status="success">{message}</Notice>}
      {serverErrors && (
        <Notice status="danger" title="The server refused to save">
          <ul className="list-disc pl-4">
            {serverErrors.map((d) => (
              <li key={`${d.code}-${d.ruleIndex}-${d.message}`}>{d.message}</li>
            ))}
          </ul>
        </Notice>
      )}

      <WorkflowBuilder
        value={draft}
        onChange={(next) => {
          setDraft(next);
          setMessage(null);
        }}
        catalogue={subscriptionCatalogue}
        previewSubjects={subjects}
        resolveFacts={resolveCustomerTargets}
        initialNow={now}
      />
    </div>
  );
}
