# Decisions

- Choosing ordered list of rules as workflow representation (not a graph e.g in react flow) - matches business mentioned business logic (combinations of conditions and outcomes), end result will be easier for users to navigate through;
- Runtime shape - one shot evaluation, should match main requirements for checks of what user can do with their subscription. The engine is pure and isomorphic. The server is the authority: it evaluates on portal render and again inside every action before mutating. The browser evaluates only for live previews in the builder;
- We use JSON files for persistance.storage, not real db;
- Effects are limited to three kinds (`capability.allow`, `capability.deny` with a reason, `limit.set`). The capability list is capped at ~8;
- Capability model - based on strings with scope included (e.g item.add, subscription.cancel). Format `scope.action` in lowerCamel, checked by regex. Wildcards (`item.*`, `*`) only in effects, never in results;
- Workflow has to be describable (savable + readable) in JSON schemas;
- Fixtures has to be created - for spinning up Users, Base Workflows (~2); There should be option to reset state back to fixtures;
- UI: clean nextjs routes, root page which shows links to both portals (customers subscriptions and workflows builder); navbar with clean button links to customer portal (with subscriptions management demos) and merchant portal (with workflow builder);

## Rule semantics

- Rules combine per capability, top rule wins (XACML first-applicable, scoped per capability and per limit). See `docs/adr/0001-per-capability-first-applicable.md`.
- Default is deny. Seeded workflows end with a visible, unconditional Baseline rule.
- Within one rule, an exact capability beats `scope.*`, which beats `*`. Two effects in one rule that give opposite answers at the same specificity are a validation error.
- Limits: top matching rule wins per limit key. The engine only reports limits; the host enforces them.
- Conditions: one group per rule, `all` or `any`, no nesting. A rule with no conditions always matches. A comparison against a missing (null) fact is false.
- Conditions compare typed facts supplied by the host. The builder owns the generic operators per type (number: `eq/neq/gt/gte/lt/lte/between`, enum: `in/notIn`, boolean: `is`).
- Item-scoped rules (any condition reads an item fact) run once per item and may only affect item capabilities and item limits. Other rules run once; their item effects apply to every item.
- Host guards run after the workflow and block state-impossible capabilities (resume only when paused, reactivate only when canceled, etc). Merchants cannot grant past a guard. Guard blocks are recorded in the trace.
- One trigger per workflow (`subscription.opened`). Each workflow is `draft` or `published`; exactly one published per trigger.
- Builder diagnostics: errors block saving (schema, unknown ids, item-scoped rule touching a subscription capability, same-rule contradiction). Warnings never block (shadowed effect, possible conflict with a rule above).

## Builder

- The builder is a separate package and knows nothing about subscriptions. The host passes a serialisable catalogue (triggers, facts, capabilities, limits, offered effects), preview subjects and a pure `resolveFacts(data, now)` function.
- The engine interprets the three effect kinds. The catalogue decides which are offered and with what labels. Custom effect kinds would need an engine extension point (deferred).
- Live preview: a "Preview as" customer dropdown and a "simulate now" input at the top. Shows each subscription's and item's capabilities and limits with the deciding rule, plus matched or not-matched badges and per-condition results on rule cards. Previews run in the browser and are not logged.

## Domain changes to the provided types

- `Customer.tier: "standard" | "pro"` added.
- `Product { id, title, unitPrice }` added, so `item.add` has something to add.
- `SubscriptionItem.productId` added. `totalPrice` is derived server-side as `unitPrice * quantity` on every change.
- `Subscription.paymentMethod { brand, last4 }` added, so `payment.update` has something to change. Updating it on a `failed` subscription sets status to `active` (simulated successful retry).
- Derived facts, not stored: `subscription.monthlySpend` (sum of item `totalPrice`, normalised to a month from `billingPolicy`: week x52/12, day x365/12, year /12, same currency, no FX) and `subscription.daysUntilRenewal`.
- "First cycle" means `currentCycle <= 1`.

## Persistence and logs

- `data/seed/*.json` is committed and read only. `data/state/*.json` is gitignored and created from the seed on first run or on Reset. Seed dates are relative (`nextBillingInDays`) and resolved to ISO at reset time.
- `logs/runtime.jsonl` (gitignored): one line per portal evaluation and per action attempt, with the full trace. The portal debug panel (collapsed by default) shows the trace of the current render and its `runId`.
- `now` is always an input to evaluation. The portal and builder accept a simulated `now` (`?now=` in the portal).

# Deferred

- Stateful workflows (add complexity and may be required for other business cases);
- Workflow version history / workflow rollback;
- Auth;
- Complex rule combinations: start with simple AND/OR logic instead of a fully flexible expression language;
- Custom effect kinds supplied by the host;
- Logical implication analysis for shadow detection (we only detect unconditional and identical-condition shadows);
