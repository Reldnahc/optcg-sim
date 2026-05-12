<!-- agent-packet:story-id ENG-047E -->
<!-- agent-packet:story-path stories/approved/ENG-047E-event-order-state-hash-regression.yaml -->
<!-- agent-packet:story-sha256 0e0bd0763cf45d2b01538240d06619552f1961f67d8abefe836bda1fda0cb680 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-047E
Epic ID: KICK-001
Title: Add event-order and state-hash regressions
Type: implementation
Area: engine
Primary Concern: verification

## Why

Add integrated deterministic event-order and state-hash regressions for the complete supported transient reveal set lifecycle.

## Authoritative Spec References

- 03-game-state-events-decisions.s005 (Event journal)
- 03-game-state-events-decisions.s020 (State hashing)
- 04-effect-runtime.s017 (Transient reveal and selection sets)
- 11-testing-quality.s004 (Unit tests per DSL primitive)
- 18-acceptance-tests.s002 (Purpose)
- 22-v6-implementation-tightening.s008 (4. Life orientation)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 03-game-state-events-decisions.s005 (Event journal)

Every atomic mutation emits events. Trigger detection consumes events, not actions.

Event sequencing is part of the replay and state-hash contract:

- EngineResult.events from one accepted transition must be strictly increasing by
  `seq`.
- The final `state.eventJournal` must be strictly increasing by `seq`.
- Event `seq` values must be allocated by append order.
- Helpers must not create multiple events in one `push` call when event IDs or seq values depend on `events.length`; append events one at a time or use an
  equivalent allocator that observes the already-appended event count.

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

### 03-game-state-events-decisions.s020 (State hashing)

Replays and recovery need state hashes.

```ts
interface StateHashInput {
  state: GameState;
  includeHidden: boolean;
  normalizeTransientIds: boolean;
}
```

Use canonical JSON serialization:

- Stable object-key ordering.
- Stable array ordering.
- Exclude timestamps unless explicitly part of replay logic.
- Include hidden data for authoritative replay hashes.
- Use separate public-view hash for client sync if useful.

### 04-effect-runtime.s017 (Transient reveal and selection sets)

Transient sets are part of effect execution context, not normal zones. They exist for patterns such as revealing the top card, selecting from a revealed set, and returning unselected cards face-down.

Rules:

1. A transient set has an origin, visibility, and cleanup policy.
2. Cards in a transient set are not simultaneously in hand/deck/trash/life.
3. Movement from a transient set to a real zone must emit a `cardMoved` event with appropriate visibility.
4. If an effect exits early, cleanup policy runs before the queue continues.
5. Opponent views may see a revealed card only for the duration and visibility specified by the effect. If the card returns face-down to a hidden zone, future opponent views must not retain its ID.

### 11-testing-quality.s004 (Unit tests per DSL primitive)

Every primitive has tests independent of specific cards:

- `draw`
- `ko`
- `trash`
- `bounce`
- `search`
- `lookAtTop`
- `modifyPower`
- `modifyCost`
- `giveKeyword`
- `replacement`
- `damage`
- `addLife`
- `attachDon`
- `returnDon`
- `choice`
- `conditional`
- `sequence`

Primitive tests should assert events, state, decisions, and visibility where applicable.

### 18-acceptance-tests.s002 (Purpose)

Implementation readiness should be measured by named tests, not only by prose. These tests define the minimum acceptable behavior for each milestone.

### 22-v6-implementation-tightening.s008 (4. Life orientation)

Canonical state convention:

```text
player.life[0] = top Life card = next Life card taken for damage.
```

Setup algorithm:

1. Take `leader.life` cards from the top of deck in deck order.
2. Let that draw-order list be `[A, B, C, ...]`, where `A` was originally top of deck.
3. Store Life as `reverse([A, B, C, ...])`.
4. This makes the original top-deck card the bottom Life card.

Damage algorithm:

```text
take player.life[0]
remove it from life
process trigger/hand/trash path
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

Own only integration regressions and minimal deterministic ordering/hash fixes for ENG-047A through ENG-047D. Do not add new search behavior, real-card fixtures, broad replay snapshots, or unrelated event rewrites.

## Scope

- prove deterministic event sequencing for eligible path as `cardRevealed`, `decisionCreated`, `decisionResolved`, `cardMoved`, cleanup, and queue continuation
- prove deterministic no-eligible path has no reveal or decision-created card-identity events and preserves deck order
- prove equivalent supported reveal flows produce stable state hashes
- prove cleanup removes transient IDs or normalizes them according to existing hash policy
- preserve no-choice and unrelated effect-runtime baseline hashes

## Out of Scope

- broad replay smoke snapshots
- real-card fixture coverage
- adding new reveal/search primitives beyond prior ENG-047 children

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/types/src/game-state.test.ts
- packages/engine-core/src/effect-runtime*.ts
- packages/engine-core/src/search-reveal*.test.ts
- packages/engine-core/src/filter-state-for-player*.test.ts
- tests/contracts/**
- stories/generated/ENG-047E-event-order-state-hash-regression.yaml
- stories/approved/ENG-047E-event-order-state-hash-regression.yaml
- agent-packets/ENG-047E.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- generate and activate only the ENG-047E packet while implementing this story
- stay within allowed_touch_points
- target the ENG-047 parent integration branch
- do not run packets:complete after merging only into the parent integration branch
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

### Code Standard

Follow [`docs/code-standard.md`](docs/code-standard.md). Non-negotiables:

- stay inside the approved story boundary
- preserve package boundaries
- use strict TypeScript without `any`, routine non-null assertions, or ignored TS errors
- prefer named exports and precise types
- keep files cohesive; 500 effective lines is suspect, 800 is high-risk, 1000 is the hard mechanical guard
- split by reason-to-change, not by line count
- do not over-split into tiny files or generic dumping grounds
- keep engine-core pure and hidden-info safe
- prove engine behavior with synthetic/unit/regression tests
- keep real-card fixture tests separate from engine behavior requirements
- preserve deterministic event ordering and state hashes
- record ambiguity instead of inventing behavior

## Required Tests

- focused event-order and state-hash regressions for the integrated ENG-047 path
- run `corepack pnpm --filter @optcg/engine-core typecheck`
- run `corepack pnpm run packets:verify`
- run `corepack pnpm run verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- integrated supported eligible path has deterministic `cardRevealed`, `decisionCreated`, `decisionResolved`, `cardMoved`, cleanup, and queue-continuation order
- state hashes are stable across equivalent supported runs
- stale transient identifiers do not affect post-cleanup state hashes
- unsupported paths still fail closed without event/hash drift

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
