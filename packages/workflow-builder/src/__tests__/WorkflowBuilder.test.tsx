import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  type Catalogue,
  checkWorkflow,
  type Workflow,
} from "@wb/workflow-engine";
import { useState } from "react";
import type { PreviewSubject, PreviewTarget } from "../types";
import { WorkflowBuilder } from "../WorkflowBuilder";

/** A catalogue from a different product, to prove the builder is generic. */
const catalogue: Catalogue = {
  triggers: [{ id: "box.opened", label: "Box opened" }],
  facts: [
    {
      id: "box.age",
      label: "Box age",
      scope: "subject",
      type: "number",
      unit: "weeks",
    },
    {
      id: "box.tier",
      label: "Tier",
      scope: "subject",
      type: "enum",
      options: [
        { value: "basic", label: "Basic" },
        { value: "pro", label: "Pro" },
      ],
    },
  ],
  capabilities: [
    { id: "box.close", label: "Close box", subject: "subject" },
    { id: "box.pause", label: "Pause box", subject: "subject" },
  ],
  limits: [],
  effects: [
    { type: "capability.allow", label: "Allow" },
    { type: "capability.deny", label: "Deny" },
  ],
  terms: { subject: "box", child: "line" },
};

const start: Workflow = {
  schemaVersion: 1,
  id: "boxes",
  name: "Boxes",
  status: "draft",
  trigger: "box.opened",
  rules: [
    {
      id: "veterans",
      name: "Veterans can close",
      when: {
        match: "all",
        conditions: [{ fact: "box.age", op: "gte", value: 3 }],
      },
      then: [{ type: "capability.allow", capabilities: ["box.close"] }],
    },
  ],
};

type Data = { age: number; tier: string };
const subjects: PreviewSubject<Data>[] = [
  { id: "old", label: "Old box", data: { age: 10, tier: "basic" } },
  { id: "new", label: "New box", data: { age: 1, tier: "pro" } },
];
const resolveFacts = (data: Data): PreviewTarget[] => [
  {
    id: "box",
    label: "The box",
    input: {
      facts: { "box.age": data.age, "box.tier": data.tier },
      children: [],
    },
    childLabels: {},
  },
];

let latest: Workflow = start;
function Harness() {
  const [value, setValue] = useState(start);
  latest = value;
  return (
    <WorkflowBuilder
      value={value}
      onChange={setValue}
      catalogue={catalogue}
      previewSubjects={subjects}
      resolveFacts={resolveFacts}
      initialNow="2026-10-12T09:00:00.000Z"
    />
  );
}

beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

const preview = () =>
  screen.getByRole("complementary", { name: "Preview and JSON" });
const decision = (label: string) =>
  within(preview()).getByText(label).closest("li") as HTMLElement;

describe("WorkflowBuilder", () => {
  it("previews the draft live and changes with the chosen subject", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(
      within(decision("Close box")).getByText("allowed"),
    ).toBeInTheDocument();
    expect(screen.getByText("matches")).toBeInTheDocument();

    await user.click(
      within(preview()).getByRole("button", { name: /Old box/ }),
    );
    await user.click(await screen.findByRole("option", { name: "New box" }));

    await waitFor(() =>
      expect(
        within(decision("Close box")).getByText("not decided"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("does not match")).toBeInTheDocument();
  });

  it("builds a rule from scratch and emits JSON the engine accepts", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Add rule" }));
    const card = document.getElementById("rule-card-rule") as HTMLElement;
    const name = within(card).getByRole("textbox", { name: "Rule name" });
    await user.clear(name);
    await user.type(name, "Nobody pauses");
    await user.click(within(card).getByRole("button", { name: "Add effect" }));
    await user.click(within(card).getByRole("button", { name: /Allow/ }));
    await user.click(await screen.findByRole("option", { name: "Deny" }));
    await user.click(within(card).getByRole("row", { name: "Pause box" }));
    await user.type(
      within(card).getByRole("textbox", {
        name: "Reason shown to the customer",
      }),
      "Not today.",
    );

    await waitFor(() =>
      expect(latest.rules[1]).toEqual({
        id: "rule",
        name: "Nobody pauses",
        when: { match: "all", conditions: [] },
        then: [
          {
            type: "capability.deny",
            capabilities: ["box.pause"],
            reason: "Not today.",
          },
        ],
      }),
    );
    const result = checkWorkflow(JSON.parse(JSON.stringify(latest)), catalogue);
    expect(result.ok).toBe(true);

    await user.click(within(preview()).getByRole("tab", { name: "JSON" }));
    expect(screen.getByTestId("workflow-json").textContent).toContain(
      '"Not today."',
    );

    await user.click(within(preview()).getByRole("tab", { name: "Preview" }));
    expect(
      within(decision("Pause box")).getByText("denied"),
    ).toBeInTheDocument();
  });

  it("warns when a rule is shadowed by an unconditional rule above", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Add rule" }));
    const card = document.getElementById("rule-card-rule") as HTMLElement;
    await user.click(within(card).getByRole("button", { name: "Add effect" }));
    await user.click(within(card).getByRole("row", { name: "Close box" }));
    await user.click(
      within(card).getByRole("button", { name: "Move rule up" }),
    );

    const veterans = document.getElementById(
      "rule-card-veterans",
    ) as HTMLElement;
    expect(
      within(veterans).getByText(/Never takes effect for "box.close"/),
    ).toBeInTheDocument();
  });

  it("keeps the last valid preview while the draft has errors", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Add rule" }));
    const card = document.getElementById("rule-card-rule") as HTMLElement;
    await user.click(within(card).getByRole("button", { name: "Add effect" }));
    // An allow effect with no capabilities is a schema error.
    expect(
      await within(preview()).findByText(
        "The draft has errors. Showing the last valid version.",
      ),
    ).toBeInTheDocument();
    expect(
      within(decision("Close box")).getByText("allowed"),
    ).toBeInTheDocument();
  });
});
