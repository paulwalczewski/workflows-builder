"use client";

import { Alert, Button, Card, Chip, Dropdown, Label } from "@heroui/react";
import type { Workflow } from "@wb/workflow-engine";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createWorkflowAction,
  deleteWorkflowAction,
  duplicateWorkflowAction,
  publishWorkflowAction,
} from "@/app/builder/actions";
import { ResetFixturesButton } from "@/components/portal/ResetFixturesButton";
import type { BrokenWorkflowFile } from "@/server/store";
import { downloadWorkflow } from "./download";

interface Props {
  workflows: Workflow[];
  broken: BrokenWorkflowFile[];
}

export function WorkflowList({ workflows, broken }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = (id: string | null) => {
    if (id) router.push(`/builder/${id}`);
  };

  const onMenu = (workflow: Workflow, key: string) => {
    setError(null);
    switch (key) {
      case "open":
        open(workflow.id);
        break;
      case "publish":
        startTransition(() => publishWorkflowAction(workflow.id));
        break;
      case "duplicate":
        startTransition(async () =>
          open(await duplicateWorkflowAction(workflow.id)),
        );
        break;
      case "export":
        downloadWorkflow(workflow);
        break;
      case "delete":
        setConfirmDelete(workflow.id);
        break;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="primary"
          isPending={pending}
          onPress={() =>
            startTransition(async () => open(await createWorkflowAction()))
          }
        >
          New workflow
        </Button>
        <ResetFixturesButton size="md" />
      </div>

      {error && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <ul className="grid gap-4 md:grid-cols-2">
        {workflows.map((workflow) => {
          const published = workflow.status === "published";
          return (
            <li key={workflow.id}>
              <Card className="relative h-full transition-shadow focus-within:ring-2 focus-within:ring-focus hover:shadow-md">
                <Card.Header>
                  <div className="flex items-start justify-between gap-2">
                    <Card.Title>
                      {/* Stretched link: the whole card opens the workflow. */}
                      <Link
                        href={`/builder/${workflow.id}`}
                        className="outline-none after:absolute after:inset-0 after:rounded-3xl after:content-['']"
                      >
                        {workflow.name}
                      </Link>
                    </Card.Title>
                    <div className="relative z-10 flex items-center gap-2">
                      <Chip
                        size="sm"
                        variant="soft"
                        color={published ? "success" : "default"}
                      >
                        {published ? "Published" : "Draft"}
                      </Chip>
                      <Dropdown>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="ghost"
                          aria-label={`Options for ${workflow.name}`}
                          isDisabled={pending}
                        >
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 16 16"
                            className="size-4"
                            fill="currentColor"
                          >
                            <circle cx="3" cy="8" r="1.5" />
                            <circle cx="8" cy="8" r="1.5" />
                            <circle cx="13" cy="8" r="1.5" />
                          </svg>
                        </Button>
                        <Dropdown.Popover placement="bottom end">
                          <Dropdown.Menu
                            disabledKeys={
                              published ? ["publish", "delete"] : []
                            }
                            onAction={(key) => onMenu(workflow, String(key))}
                          >
                            <Dropdown.Item id="open" textValue="Open">
                              <Label>Open</Label>
                            </Dropdown.Item>
                            <Dropdown.Item id="publish" textValue="Publish">
                              <Label>
                                {published ? "Already published" : "Publish"}
                              </Label>
                            </Dropdown.Item>
                            <Dropdown.Item id="duplicate" textValue="Duplicate">
                              <Label>Duplicate</Label>
                            </Dropdown.Item>
                            <Dropdown.Item id="export" textValue="Export JSON">
                              <Label>Export JSON</Label>
                            </Dropdown.Item>
                            <Dropdown.Item
                              id="delete"
                              textValue="Delete"
                              variant="danger"
                            >
                              <Label>
                                {published
                                  ? "Delete (publish another first)"
                                  : "Delete"}
                              </Label>
                            </Dropdown.Item>
                          </Dropdown.Menu>
                        </Dropdown.Popover>
                      </Dropdown>
                    </div>
                  </div>
                  <Card.Description>
                    {workflow.description ?? "No description."}
                  </Card.Description>
                </Card.Header>
                <Card.Content className="text-sm text-muted">
                  {workflow.rules.length === 1
                    ? "1 rule"
                    : `${workflow.rules.length} rules`}
                </Card.Content>
                {confirmDelete === workflow.id && (
                  <Card.Footer className="relative z-10 flex flex-wrap items-center gap-2 rounded-2xl bg-danger-soft p-3">
                    <span className="text-sm text-danger-soft-foreground">
                      Delete "{workflow.name}"? Reset fixtures brings back
                      seeded workflows only.
                    </span>
                    <Button
                      size="sm"
                      variant="danger"
                      isPending={pending}
                      onPress={() =>
                        startTransition(async () => {
                          const outcome = await deleteWorkflowAction(
                            workflow.id,
                          );
                          setConfirmDelete(null);
                          if (!outcome.ok) setError(outcome.reason);
                        })
                      }
                    >
                      Delete
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() => setConfirmDelete(null)}
                    >
                      Keep
                    </Button>
                  </Card.Footer>
                )}
              </Card>
            </li>
          );
        })}
      </ul>

      {broken.length > 0 && (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              Some stored workflow files could not be loaded
            </Alert.Title>
            <Alert.Description>
              <ul className="list-disc pl-4">
                {broken.map((b) => (
                  <li key={b.file}>
                    <code>{b.file}</code>: {b.diagnostics[0]?.message}
                  </li>
                ))}
              </ul>
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}
    </div>
  );
}
