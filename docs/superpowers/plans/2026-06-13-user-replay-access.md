# User Replay Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add backend replay read access scoped to the authenticated match participants.

**Architecture:** Reuse the existing completed-match Postgres persistence module for read-side queries. Wire an optional replay repository into the match HTTP server and expose list/detail routes that authenticate with the existing dev auth provider.

**Tech Stack:** TypeScript, Node HTTP server, Vitest, Postgres SQL through `optcg-db`.

---

### Task 1: Repository Read API

**Files:**

- Modify: `packages/match-server/src/postgres-completed-match.ts`
- Test: `packages/match-server/src/postgres-completed-match.test.ts`

- [ ] Write failing tests for listing replay summaries by user and fetching replay detail only when the user participated.
- [ ] Run `corepack pnpm exec vitest run packages/match-server/src/postgres-completed-match.test.ts`.
- [ ] Add `CompletedMatchReplayRepository` with `listReplaysForUser` and `getReplayForUser`.
- [ ] Verify repository tests pass.

### Task 2: HTTP Replay Routes

**Files:**

- Create: `packages/match-server/src/replay-route.ts`
- Modify: `packages/match-server/src/match-http-server.ts`
- Modify: `packages/match-server/src/match-http-server-options.ts`
- Test: `packages/match-server/src/match-http-server-replay.test.ts`

- [ ] Write failing route tests for unauthenticated list, authenticated list, participant detail, and non-participant detail.
- [ ] Run `corepack pnpm exec vitest run packages/match-server/src/match-http-server-replay.test.ts`.
- [ ] Add route handler and server option wiring.
- [ ] Verify route tests pass.

### Task 3: Verification And Commit

**Files:**

- All touched files

- [ ] Run targeted match-server tests.
- [ ] Run match-server typecheck.
- [ ] Commit the implementation.
