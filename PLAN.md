# Implementation plan: subscription workflows POC

Vocabulary: `CONTEXT.md`. Rationale: `DECISIONS.md`, `docs/adr/`.

## Acceptance

1. Anna and Ben open the same portal, the same published "Standard" workflow runs for both, Anna can cancel and Ben sees "contact support". The reason is visible in the UI (disabled button + reason, debug panel trace) and in `logs/runtime.jsonl`.
2. A workflow edited in the builder is saved as JSON, validated by the same schema the runtime loads, and changes portal behaviour once published (round trip).
3. The builder shows live capabilities for a chosen fixture customer while rules are edited.
4. The builder package imports nothing from the host app.

## Layout

```
packages/
  workflow-engine/          @wb/workflow-engine (pure TS, isomorphic)
    src/schema/workflow.schema.json
    src/schema/catalogue-schema.ts   builds the catalogue-specific schema
    src/types.ts                     FromSchema<> types + Catalogue, Result, Trace
    src/validate.ts                  Ajv, both schema layers
    src/evaluate.ts                  evaluate()
    src/analyze.ts                   diagnostics (errors + warnings)
    src/capabilities.ts              wildcard expansion, specificity
  workflow-builder/         @wb/workflow-builder (React client components, HeroUI peer)
    src/WorkflowBuilder.tsx
    src/rules/  conditions/  effects/  preview/  json/
src/
  domain/                   types.ts, money.ts (monthly normalisation)
  catalogue/                catalogue.ts (data), facts.ts (resolveFacts), guards.ts  (pure, isomorphic)
  server/                   store.ts (state files, reset), logger.ts, run.ts (evaluate + guards + log), actions.ts
  app/
    layout.tsx              navbar: Customer portal | Workflow builder
    page.tsx                links to both
    portal/page.tsx         customer picker
    portal/[customerId]/page.tsx   subscriptions + collapsed debug panel
    builder/page.tsx        workflow list (new, duplicate, publish, import)
    builder/[workflowId]/page.tsx  + BuilderClient.tsx ("use client" wrapper passing resolveFacts)
data/seed/                  customers.json, products.json, subscriptions.json, workflows/*.json
data/state/                 gitignored
logs/                       gitignored
```

## Core contracts

```ts
// Workflow document (stored JSON, validated by workflow.schema.json)
{
  schemaVersion: 1, id, name, status: "draft" | "published",
  trigger: "subscription.opened", updatedAt,
  rules: [{
    id, name,
    when: { match: "all" | "any", conditions: [{ fact, op, value }] },
    then: [
      { type: "capability.allow", capabilities: string[] },
      { type: "capability.deny", capabilities: string[], reason: string },
      { type: "limit.set", limit: string, value: number }
    ]
  }]
}

// Catalogue (host supplied, serialisable)
{
  triggers: [{ id, label }],
  facts: [{ id, label, scope: "subject" | "child", type: "number" | "enum" | "boolean", options?, unit? }],
  capabilities: [{ id, label, subject: "subject" | "child" }],
  limits: [{ id, label, subject: "subject" | "child" }],
  effects: [{ type, label }]          // which of the three kinds are offered
}

// Engine
evaluate({ workflow, catalogue, input: { facts, children: [{ id, facts }] } }): {
  subject:  { capabilities: Record<cap, Decision>, limits: Record<limit, LimitDecision> },
  children: Record<childId, { capabilities, limits }>,
  trace: { rules: [{ ruleId, perTarget: [{ targetId, matched, conditions: [{ fact, op, value, actual, pass }] }] }] }
}
Decision = { allowed: boolean, reason?: string, decidedBy: ruleId | "default", overridden: [{ ruleId, effectIndex }] }
analyze(workflow, catalogue): Diagnostic[]   // { severity, ruleId, effectIndex?, code, message }
```

Engine terms are generic (`subject`/`child`). The host maps subscription to subject and item to child. `now` never reaches the engine: `resolveFacts(data, now)` turns it into facts like `daysUntilRenewal`, which keeps `evaluate` free of clocks.

## Phases

### 0. Scaffolding
- `pnpm-workspace.yaml`: add `packages: ["packages/*"]`. Packages export `src/index.ts` directly (no build step). Add to `transpilePackages` and the Jest `moduleNameMapper`.
- Deps: `ajv`, `json-schema-to-ts` (engine).
- Biome override for `packages/**`: `noRestrictedImports` bans `@/*` and relative paths out of the package.
- `.gitignore`: `data/state/`, `logs/`.
- Layout with HeroUI navbar, root page, empty route stubs.
- Read `node_modules/next/dist/docs` before writing pages. Relevant here: `cacheComponents: true` is on, so file reads and `new Date()` in server components need `<Suspense>` or `await connection()`/`io()`; `params`/`searchParams` are Promises; mutations use Server Actions + `refresh()`.

### 1. Engine (test first)
- `workflow.schema.json` + catalogue schema builder; `validate()` returns typed errors.
- `evaluate()`: per target (subject, then each child), walk rules top to bottom; non-child rules evaluated once, child-scoped rules per child; for each effect expand wildcards against the catalogue (child-scoped rules only reach child capabilities), apply in-rule specificity, first decider wins per (target, capability|limit), later ones recorded as `overridden`.
- `analyze()`: schema + id errors, child-scoped rule touching subject capability, same-rule contradiction; warnings for shadowed effects (rule above unconditional or identical conditions) and possible conflicts (rule above, opposite verdict, same capability).
- Tests: each combining rule, wildcard specificity, `any`/`all`/empty, null facts, child scoping, every diagnostic code, round trip `parse -> serialize` is stable (canonical key order).

### 2. Host domain
- `domain/types.ts`: provided types + `Customer.tier`, `Product`, `SubscriptionItem.productId`, `Subscription.paymentMethod`.
- `catalogue/catalogue.ts`:
  - Facts: `customer.tier`, `subscription.status`, `subscription.currentCycle`, `subscription.monthlySpend`, `subscription.daysUntilRenewal`, `subscription.itemCount`, `subscription.billingInterval`, `item.quantity`, `item.totalPrice`.
  - Capabilities: `subscription.cancel`, `subscription.pause`, `subscription.resume`, `subscription.reactivate`, `item.add` (subject), `item.remove`, `item.updateQuantity` (child), `payment.update`. "Contact support" is always shown and not a capability.
  - Limits: `subscription.maxItems`, `item.maxQuantity`.
- `catalogue/facts.ts`: `resolveFacts(customer, subscription, now)`. Tests for monthly normalisation and days until renewal.
- `catalogue/guards.ts`: pause only when active, resume only when paused, reactivate only when canceled, cancel not when canceled, item edits not when canceled, remove not the last item. Applied after `evaluate`, written into the decision as `blockedBy: "guard"`.
- `server/store.ts`: read/write `data/state`, `resetState()` from seed (resolve `nextBillingInDays`), `DATA_DIR` env for tests.
- `server/logger.ts`: append JSONL `{ kind: "evaluation" | "action", runId, at, now, workflowId, customerId, subscriptionId, facts, result, trace, action?, outcome? }`.
- `server/run.ts`: `runForSubscription(subscriptionId, now)` = load published workflow, resolve facts, evaluate, guards, log, return.
- Seeds (all EUR):

| Customer | Setup | Expected under Standard |
|---|---|---|
| Anna | sub A: 5 cycles, EUR 220/mo; sub B: 4 cycles, EUR 60/mo | A: can cancel. B: "contact support" (baseline) |
| Ben | 1 cycle | "contact support" (first cycle rule) |
| Carla | status `failed` | only `payment.update`; everything else disabled with reason |
| Dan | renewal in 1 day | item edits disabled with lock reason |
| Eve | tier pro, one item at EUR 60 | pause allowed, maxItems 6, that item cannot be removed |

- Standard (published), top to bottom:
  1. Payment failed: `subscription.status in [failed]` then allow `payment.update`, deny `*` ("Your last payment failed. Update your payment method to continue.")
  2. Renewal lock: `daysUntilRenewal lte 2` then deny `item.*` ("Item changes are locked in the 2 days before renewal.")
  3. Loyal can cancel: `currentCycle gte 3` and `monthlySpend gte 200` then allow `subscription.cancel`
  4. First cycle: `currentCycle lte 1` then deny `subscription.cancel` ("In your first cycle, please contact support to cancel.")
  5. Pro perks: `customer.tier in [pro]` then allow `subscription.pause`, set `subscription.maxItems` 6
  6. Premium items stay (item-scoped): `item.totalPrice gt 50` then deny `item.remove` ("Premium items can only be removed by support.")
  7. Baseline: deny `subscription.cancel` ("Contact support to cancel."), allow `subscription.resume`, `subscription.reactivate`, `item.*`, `payment.update`, set `subscription.maxItems` 4, `item.maxQuantity` 5
- Holiday freeze (draft): freeze rule (`daysUntilRenewal lte 7`, deny `item.*`) and no-pause rule on top, then the Standard rules.
- Scenario tests: Standard x every seed customer gives the table above. Holiday freeze changes Anna's item edits.

### 3. Customer portal
- `/portal`: customer cards (name, tier, subscription count).
- `/portal/[customerId]?now=`: per subscription a card with status, cycle, next billing, monthly spend, items (quantity stepper, remove), add item (product select), and the subscription actions.
  - Allowed: enabled.
  - Denied with reason: disabled + reason.
  - Denied by default: hidden.
  - Limit reached or guard: disabled + generated reason.
- Server action `performAction({ subscriptionId, capability, itemId?, payload, now })`: re-run evaluation, check decision + limits + guard, mutate, recompute `totalPrice`, write, log `action` with outcome, `refresh()`. Denied attempts return the reason and are logged too.
- Debug panel (collapsed by default, side drawer): `runId`, workflow name, facts table, rule list with matched badges and per-condition actual vs expected, per-capability decider + overridden effects, guard blocks, limits. Includes a "simulate now" input and a "Reset fixtures" button.
- Tests: action denies when not allowed (temp `DATA_DIR`), action succeeds and log line is written.

### 4. Builder package
- `<WorkflowBuilder value onChange catalogue previewSubjects resolveFacts />`, controlled, no persistence of its own.
- Header: name, trigger select, "Preview as" dropdown, "simulate now" input.
- Rule cards: name, all/any toggle, condition rows (fact select, operator by fact type, value input by type), effect rows (kind select, capability multiselect with wildcards, reason, limit + value), up/down/duplicate/delete, diagnostics inline, matched badge + per-condition pass/fail for the preview subject.
- Preview panel: per subject target and child, capabilities (allowed / denied + reason / undecided) and limits, each naming its deciding rule (click scrolls to card). Invalid draft: keep last valid result dimmed, list errors.
- JSON panel: live, read-only, copy button.
- Tests (RTL): build a rule from scratch, emitted JSON passes `validate`, preview updates on subject switch, diagnostics render for a shadowed rule.

### 5. Builder host pages
- `/builder`: list with status chip, New (starts with a Baseline rule), Duplicate, Publish (unpublishes the current one), Import `.json` (validated), Export.
- `/builder/[workflowId]`: `BuilderClient` wraps the package with the catalogue, customers from state as preview subjects, `resolveFacts`. Save button runs `validate` + `analyze` on the server (server action) before writing; errors block, warnings do not.
- Round-trip test: load Standard, save untouched, file unchanged; edit in builder, save, `runForSubscription` reflects it.

### 6. Docs
- README: setup, `pnpm dev`, demo script (Anna vs Ben, Carla, Dan with `?now=`, publish Holiday freeze, builder preview), where logs live.
- Keep `DECISIONS.md` and `CONTEXT.md` current.

## Demo script
1. `/portal/anna`: subscription A can cancel; open the debug panel to see rule 3 decided it.
2. `/portal/ben`: cancel disabled, "In your first cycle..."; rule 4 decided it, rule 7's deny is listed as overridden.
3. `tail logs/runtime.jsonl`: both runs, same `workflowId`, different decisions.
4. `/builder/holiday-freeze`: preview as Anna, item edits flip to denied as the freeze rule is edited; publish; reload Anna's portal.
