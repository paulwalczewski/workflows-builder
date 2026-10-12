<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Build loop with qa-critic

Work through `PLAN.md` one phase at a time. Each phase runs this loop until the `qa-critic` agent returns PASS:

1. Implement the phase. Run `pnpm lint`, `pnpm typecheck` and `pnpm test` yourself until they are green.
2. Keep `pnpm dev` running in the background and note its URL.
3. Dispatch `qa-critic` with the round number, the phase(s) in scope, a summary of what changed, the URL, and the previous round's findings. Round 1 of the build starts the agent; every later round continues the same agent with SendMessage, so it remembers its finding ids.
4. Fix every open finding, then go back to step 1 for the next round. Suggestions are optional.
5. On PASS, commit the phase locally and move to the next one.

When the same finding stays open for 3 rounds, or you disagree that it is a defect, stop and ask the user. After the last phase, run one final round with all phases in scope; the build is done when that round passes. Committing locally is part of the loop; pushing waits for the user.
