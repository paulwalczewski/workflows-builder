# Subscription Workflows POC

A proof of concept: merchants author ordered rule lists (workflows) that decide what each customer can do with their physical-goods subscriptions, and a customer portal offers only what the published workflow allows, showing why.

## Run it

```bash
pnpm install
pnpm dev          # http://localhost:3000 (or the next free port)
```

Optional checks:

```bash
pnpm test         # engine, host, server actions, builder UI
pnpm lint
pnpm typecheck
```

State lives in JSON files. `data/seed/` is committed and never written. `data/state/` is created from it on first use and can be restored with **Reset data** (portal list, builder list or debug panel), which also clears the log. Every evaluation and every action attempt is appended to `logs/runtime.jsonl`.

## How it fits together

| Part | Where |
|---|---|
| Engine: JSON Schema, evaluator, diagnostics | `packages/workflow-engine` |
| Builder: React editor with live preview | `packages/workflow-builder` |
| Catalogue, facts, guards | `src/catalogue` |
| Store, runtime, logging, actions | `src/server` |
| Portal and builder pages | `src/app` |
