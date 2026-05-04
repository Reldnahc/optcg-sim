<!-- agent-packet:story-id ENG-004A -->
<!-- agent-packet:story-path stories/approved/ENG-004A-fix-phase-event-sequence-allocation.yaml -->
<!-- agent-packet:story-sha256 75b5ba2906e4401df298f501c9416951bdc14e7fac5f9df0272b4623eadfb9c0 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-004A
Epic ID: M1-001
Title: Fix phase event sequence allocation in phase transitions
Type: implementation
Area: engine
Primary Concern: rules

## Why

Fix duplicate event sequence and id allocation in phase helpers when multiple phase transition events are appended during one EngineResult.

## Authoritative Spec References

- 02-engine-mechanics.s011 (Refresh Phase)
- 02-engine-mechanics.s012 (Draw Phase)
- 02-engine-mechanics.s013 (DON!! Phase)
- 03-game-state-events-decisions.s004 (Engine result)
- 03-game-state-events-decisions.s005 (Event journal)
- 18-acceptance-tests.s003 (Milestone 1 - terminal engine)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 02-engine-mechanics.s011 (Refresh Phase)

1. Expire effects that end at the start of this player's turn.
2. Queue/resolve start-of-turn triggers.
3. Return attached DON!! to cost area rested.
4. Set the turn player's Leader, Characters, Stage, and Cost Area cards active.

### 02-engine-mechanics.s012 (Draw Phase)

1. Turn player draws one card.
2. First player skips this draw on their first turn.

### 02-engine-mechanics.s013 (DON!! Phase)

1. Place two DON!! from DON!! Deck into cost area active.
2. First player places only one on their first turn.
3. If fewer DON!! remain, place as many as possible.

### 03-game-state-events-decisions.s004 (Engine result)

Every engine call returns a result object rather than only the new state.

```ts
interface EngineResult {
  state: GameState;
  events: EngineEvent[];
  decisions?: PendingDecision[];
  errors?: EngineError[];
  stateHash: string;
}
```

For normal play there should be at most one active `pendingDecision` at a time. Tests may use arrays to inspect internal generated decisions.

### 03-game-state-events-decisions.s005 (Event journal)

Every atomic mutation emits events. Trigger detection consumes events, not actions.

```ts
interface EngineEvent {
  id: EngineEventId;
  seq: number;
  type: EngineEventType;
  actor?: PlayerId;
  source?: CardRef;
  affected?: CardRef[];
  payload: unknown;
  causedBy?: CausalityRef;
  visibility: EventVisibility;
  createdAtStateSeq: StateSeq;
}

type EngineEventType =
  | "phaseStarted"
  | "phaseEnded"
  | "cardRevealed"
  | "cardMoved"
  | "cardPlayed"
  | "cardDrawn"
  | "cardDiscarded"
  | "cardTrashed"
  | "cardKOd"
  | "cardReturned"
  | "donAttached"
  | "donReturned"
  | "costPaid"
  | "attackDeclared"
  | "blockerActivated"
  | "counterUsed"
  | "damageWouldBeDealt"
  | "damageDealt"
  | "lifeTaken"
  | "triggerActivated"
  | "effectQueued"
  | "effectResolved"
  | "replacementApplied"
  | "decisionCreated"
  | "decisionResolved"
  | "ruleProcessingChecked"
  | "gameEnded";
```

### 18-acceptance-tests.s003 (Milestone 1 - terminal engine)

```text
M1-001 setup creates legal starting state
M1-002 opening hand draw uses deterministic deck order
M1-003 official mulligan flow supports keep or redraw-five once per player in first-player-then-second-player order
M1-004 first player skips first draw
M1-005 first player gains only one DON!! on first turn
M1-006 second player cannot attack on their first turn
M1-007 active DON!! can be attached during Main Phase
M1-008 attached DON!! returns rested during Refresh Phase
M1-009 vanilla leader damage moves life to hand
M1-010 leader taking damage at 0 life loses at rule processing
M1-011 attacking rested character can K.O. it
M1-012 character played this turn cannot attack without Rush
M1-013 deck-out loses at rule-processing checkpoint
M1-014 concession immediately ends match and cannot be replaced
M1-015 state hash is stable for same seed and action log
M1-016 PlayerView hides opponent hand and deck order
M1-017 life setup orientation makes original deck top card bottom Life card
M1-018 attached DON!! has attached state and no active/rested state while attached
M1-019 start-of-main-phase trigger window resolves before Main Phase action priority
```

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

### 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)

Boundary enforcement is mechanical: `@optcg/engine-core` cannot import React, browser code, WebSocket transport, Redis, Postgres, or live HTTP clients.

### 15-implementation-kickoff.s012 (Guardrails)

Kickoff guardrails require the engine to stay free of Redis, Postgres, WebSocket, React, and Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution consumes resolved manifests rather than live HTTP calls.

## Story Boundary

Own only event sequence and id allocation inside engine-core phase transition helpers, local regression tests, and deterministic CLI smoke fixture hash updates directly caused by the corrected event sequencing. Do not implement global replay, event-journal invariant enforcement, or unrelated engine behavior.

## Scope

- fix event sequence allocation in phase helpers
- ensure every EngineResult.events item created during one phase transition has a unique append-order seq
- ensure corresponding event ids are unique
- remove or refactor same-call multi-event push patterns in phases.ts where event id or seq depends on events.length
- add regression tests for refresh-to-draw and draw-to-don transition event seq/id uniqueness and appended eventJournal ordering
- refresh only deterministic CLI smoke fixture hashes that drift solely because corrected phase event seq/id values change state hashes

## Out of Scope

- global replay or event-journal invariant enforcement
- action handling, combat, mulligan, card play, effect runtime, server, client, or persistence behavior
- replay fixture schema, replay runner behavior, CLI command behavior, or CLI tests
- engine files outside phases.ts unless a local regression test proves the bug cannot be fixed within phases.ts

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/phases.ts
- packages/engine-core/src/phases.test.ts
- fixtures/replays/cli-001d-terminal-runner.local.json
- stories/approved/ENG-004A-fix-phase-event-sequence-allocation.yaml
- agent-packets/ENG-004A.md
- agent-packets/active.json

## Constraints

- stay within allowed_touch_points
- do not implement global replay/event-journal invariant enforcement in this story
- do not change replay fixture shape, setup scripts, action commands, expected statuses, or unrelated scenario hashes
- must pass `corepack pnpm exec vitest run packages/engine-core/src/phases.test.ts`
- must pass `corepack pnpm run typecheck`
- must pass `corepack pnpm run verify`
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- regression test for refresh-to-draw result.events seq strict increase and ids unique
- regression test for draw-to-don result.events seq strict increase and ids unique
- regression assertions that eventJournal entries appended by each transition are strictly increasing

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- phase transition helpers allocate unique append-order seq values for events created during a single transition
- phase transition helpers allocate unique event ids for events created during a single transition
- refresh-to-draw and draw-to-don regressions fail on the old duplicate allocation pattern and pass after the fix
- CLI smoke fixture hash updates, if needed, are limited to expected checkpoint/final hashes changed by corrected phase event sequencing
- existing phase behavior, payloads, visibility, causality, state seq, action seq, and rule-processing behavior remain unchanged

## Ambiguity Rule

Policy: fail_and_escalate

If the story or cited specification is ambiguous, do not invent behavior. Report the ambiguity and stop at the narrowest safe point.

## Agent Instruction Footer

```text
You are implementing a constrained story in an existing codebase.
The cited specification is authoritative.
Do not invent behavior not supported by the cited spec.
Stay within scope.
Stay within the approved story boundary and allowed touch points.
Follow repo tooling and code standard requirements.
Include tests for the listed acceptance criteria.
If the spec is ambiguous, report the ambiguity instead of guessing.
```
