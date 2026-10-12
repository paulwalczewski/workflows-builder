# Subscription Workflows

A merchant authors workflows that decide, per subscription and per item, at the moment the customer looks, what that customer may do and within which limits.

## Language

### Subscriptions

**Customer**:
The person who holds one or more subscriptions. Has a tier.
_Avoid_: User, account, subscriber (in code)

**Tier**:
The customer's service level, `standard` or `pro`.
_Avoid_: Plan

**Subscription**:
A recurring order of physical items for one customer, billed on a fixed policy.

**Subscription Item**:
One product line inside a subscription, with a quantity and a per-cycle price.
_Avoid_: Line item

**Product**:
Something a customer can add to a subscription as a new item.

**Cycle**:
One completed billing period of a subscription. "First cycle" means the cycle count is at most 1.

**Monthly Spend**:
The sum of a subscription's item prices, normalised to one month by its billing policy, in the subscription's own currency.

### Workflows

**Merchant**:
The business that sells subscriptions and authors workflows.

**Catalogue**:
What the host product supplies to the builder and runtime: its triggers, facts, effects, capabilities and limits.

**Workflow**:
An ordered list of rules, read top to bottom, bound to one trigger, stored as a JSON document.
_Avoid_: Flow, graph, policy

**Published Workflow**:
The single workflow currently live for a trigger. All others are drafts.

**Trigger**:
The moment the host runs a workflow, such as a customer opening a subscription.

**Rule**:
One entry in a workflow: a set of conditions and the effects that apply when they hold.

**Item-scoped Rule**:
A rule whose conditions read item facts. It is evaluated once per item and may only affect item capabilities and item limits.

**Baseline Rule**:
An unconditional rule at the bottom of a workflow that states the fallback outcome.

**Fact**:
A typed value the host computes about the subscription, its customer or an item, which conditions compare against.

**Condition**:
A comparison of one fact against a value.

**Effect**:
What a matching rule does: allow capabilities, deny capabilities with a reason, or set a limit.

**Capability**:
A scoped string naming one thing a customer may do, such as `subscription.cancel` or `item.updateQuantity`. Belongs either to the subscription or to an item.
_Avoid_: Permission, action, ability

**Limit**:
A named number a workflow sets, such as `items.max`, which the host enforces.

**Evaluation**:
One run of a workflow for one subscription at one moment, yielding capabilities, limits and a trace.
_Avoid_: Execution, check

**Trace**:
The record of an evaluation: facts seen, which rules matched, which rule decided each capability and limit, and which effects were overridden.
_Avoid_: Debug info

**Preview**:
An evaluation of an unsaved workflow against a chosen customer, shown live in the builder. Never enforced and never logged.

**Guard**:
A fixed rule of the host product, applied after the workflow, that blocks a capability the current state makes impossible (such as resuming a subscription that is not paused).

**Shadowed Effect**:
An effect that can never take effect because a rule above already decides the same capability or limit whenever this one matches.
