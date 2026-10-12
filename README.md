# Subscription Workflows

A proof of concept: merchants author ordered rule lists (workflows) that decide what each customer can do with their physical-goods subscriptions, and a customer portal offers only what the published workflow allows, showing why.

- `CONTEXT.md`: the vocabulary (Customer, Subscription, Workflow, Rule, Capability, Limit, Guard, Trace...).
- `DECISIONS.md`: what was decided and why. `docs/adr/0001-per-capability-first-applicable.md`: how rules combine.
- `PLAN.md`: the implementation plan and acceptance criteria.

## Run it

```bash
pnpm install
pnpm dev          # http://localhost:3000 (or the next free port)
pnpm test         # engine, host, server actions, builder UI
pnpm lint
pnpm typecheck
```

State lives in JSON files. `data/seed/` is committed and never written. `data/state/` is created from it on first use and can be restored with **Reset fixtures** (portal list or debug panel). Every evaluation and every action attempt is appended to `logs/runtime.jsonl`.

## How it fits together

| Part | Where | Knows about subscriptions? |
|---|---|---|
| Engine: JSON Schema, evaluator, diagnostics | `packages/workflow-engine` | No. Speaks of a *subject* and its *children*. |
| Builder: React editor with live preview | `packages/workflow-builder` | No. Everything comes from the catalogue it is given. |
| Catalogue, facts, guards | `src/catalogue` | Yes. The host's half of the contract. |
| Store, runtime, logging, actions | `src/server` | Yes. |
| Portal and builder pages | `src/app` | Yes. |

A lint rule stops the packages importing anything from the host app.

**Workflow format.** `packages/workflow-engine/src/schema/workflow.schema.json` is the generic schema. `data/schema/subscriptions.workflow.schema.json` is the same schema narrowed to this product's catalogue (facts, operators, capabilities, limits); seed workflows point at it with `$schema`, so editors validate them too. Workflows are stored in canonical form, so an untouched save rewrites identical bytes.

**Rules combine per capability, top rule wins.** For each capability and limit, the highest matching rule that mentions it decides. Anything no rule decides is denied. Lower rules that also matched are recorded as overridden. The builder warns about rules that are shadowed (a rule above with no conditions or the same conditions always decides first) and about possible conflicts (a rule above answers differently and wins when both match). Capabilities a rule reaches only through a wildcard ("Everything", "All item capabilities") never raise a possible-conflict warning: broad rules overlap everything by design.

**Simulated time** (`?now=` and the debug panel's day buttons) is sent with every portal action and the server honours it, so a hand-crafted request could pick its own time. That is deliberate for the demo; a real deployment would take the clock from the server only.

**Money** is always integer minor units (cents), including in workflows: `monthlySpend gte 20000` means EUR 200. The builder shows and edits euros.

## Demo script

Two workflows are seeded. **Starter** (published, the default) has two rules: first-cycle customers contact support to cancel, everyone else can manage freely. **Standard** (draft) carries every example from the brief: the failed-payment lockdown, the two-day renewal lock, "3 cycles and EUR 200 a month can cancel", Pro perks and premium items.

1. Open `/portal/anna` and `/portal/ben`. Same published workflow (Starter), different answers: Anna can cancel, Ben's Cancel is disabled with "In your first cycle, please contact support to cancel." Open the debug panel to see which rule decided.
2. `tail -n 4 logs/runtime.jsonl`: both runs, same `workflowId`, different decisions.
3. Go to `/builder`, open **Standard** and preview as Carla, Dan or Eve: lockdown, renewal lock, Pro perks. Edit a rule and watch the preview and JSON change. Then open its menu on the list (or the editor's **Publish**) to publish it.
4. Back in the portal under Standard: `/portal/carla` can only update the payment method (do it, and everything unlocks); `/portal/dan` has item changes locked a day before renewal; on `/portal/anna`, open the debug panel and press **+7 days**, then **+1 day** three times to watch her pantry lock two days before it renews.
5. **Reset fixtures** (portal list, builder list or debug panel) to start over.
