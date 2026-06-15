# Spotlight Playback Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build spotlight rewind, pause/play, step-forward, and catch-up controls while retaining every captured effect presentation in order.

**Architecture:** Keep source extraction in `effect-spotlight-source.ts` and move playback semantics into `use-effect-spotlight.ts` as a retained timeline with a cursor and paused/caught-up state. Render controls in `EffectSpotlight.tsx`, with `MatchApp.tsx` and `BoardLayout.tsx` passing through the hook controls.

**Tech Stack:** React, TypeScript, Vitest, server-rendered component tests.

---

### Task 1: Timeline Playback Model

**Files:**

- Modify: `packages/client/src/react/use-effect-spotlight.test.ts`
- Modify: `packages/client/src/react/use-effect-spotlight.ts`

- [ ] **Step 1: Write failing model tests**

Add tests proving the model appends unseen sources to a retained timeline, rewinds without deleting entries, pauses automatic advance, steps forward only while behind the present entry, and catches up by clearing visible backlog.

Run: `corepack pnpm exec vitest run packages/client/src/react/use-effect-spotlight.test.ts`
Expected: FAIL because playback controls and timeline helpers do not exist yet.

- [ ] **Step 2: Implement minimal timeline state**

Extend `EffectSpotlightState` with timeline metadata and export controls from `useEffectSpotlight`. Keep the existing dwell/pin behavior, but select the active item from a retained ordered timeline instead of destructively removing queue entries.

- [ ] **Step 3: Verify model tests pass**

Run: `corepack pnpm exec vitest run packages/client/src/react/use-effect-spotlight.test.ts`
Expected: PASS.

### Task 2: Spotlight Controls UI

**Files:**

- Modify: `packages/client/src/react/effect-spotlight.test.ts`
- Modify: `packages/client/src/react/EffectSpotlight.tsx`
- Modify: `packages/client/src/react/styles/effect-spotlight.css`

- [ ] **Step 1: Write failing render tests**

Add server-render tests proving the controls render under the card, show left/pause/fast-forward by default, swap pause to play when paused, and only render right when the cursor is behind present.

Run: `corepack pnpm exec vitest run packages/client/src/react/effect-spotlight.test.ts`
Expected: FAIL because the component has no controls.

- [ ] **Step 2: Render controls under the card**

Add accessible icon/text buttons below `.effect-spotlight-card`, keep pointer events enabled only for the controls, and avoid changing the card’s existing image/rules layout.

- [ ] **Step 3: Verify render tests pass**

Run: `corepack pnpm exec vitest run packages/client/src/react/effect-spotlight.test.ts`
Expected: PASS.

### Task 3: App Wiring

**Files:**

- Modify: `packages/client/src/react/BoardLayout.tsx`
- Modify: `packages/client/src/react/MatchApp.tsx`
- Modify: `packages/client/src/react/playmat-structure.test.ts`

- [ ] **Step 1: Write failing pass-through test**

Update the structure test so `MatchApp` passes spotlight controls to `MatchBoardSurface`/`BoardLayout` and `BoardLayout` passes them to `EffectSpotlight`.

Run: `corepack pnpm exec vitest run packages/client/src/react/playmat-structure.test.ts`
Expected: FAIL because controls are not wired.

- [ ] **Step 2: Wire hook controls through props**

Pass the hook’s controls and state through `MatchApp` to `BoardLayout` and into `EffectSpotlight`.

- [ ] **Step 3: Verify pass-through tests pass**

Run: `corepack pnpm exec vitest run packages/client/src/react/playmat-structure.test.ts`
Expected: PASS.

### Task 4: Final Verification And Commit

**Files:**

- Verify all files touched above.

- [ ] **Step 1: Run focused verification**

Run: `corepack pnpm exec vitest run packages/client/src/react/use-effect-spotlight.test.ts packages/client/src/react/effect-spotlight.test.ts packages/client/src/react/effect-spotlight-source.test.ts packages/client/src/react/playmat-structure.test.ts`
Expected: PASS.

- [ ] **Step 2: Run client typecheck**

Run: `corepack pnpm exec tsc -p packages/client/tsconfig.json --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

Run: `git add docs/superpowers/plans/2026-06-15-spotlight-playback-controls.md packages/client/src/react/use-effect-spotlight.ts packages/client/src/react/use-effect-spotlight.test.ts packages/client/src/react/EffectSpotlight.tsx packages/client/src/react/effect-spotlight.test.ts packages/client/src/react/styles/effect-spotlight.css packages/client/src/react/BoardLayout.tsx packages/client/src/react/MatchApp.tsx packages/client/src/react/playmat-structure.test.ts && git commit -m "Improve spotlight playback controls"`
Expected: commit succeeds.
