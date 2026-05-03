<!-- agent-packet:story-id ENG-001C -->
<!-- agent-packet:story-path stories/approved/ENG-001C-stable-state-hash-primitive.yaml -->
<!-- agent-packet:story-sha256 d2eb2358518448576c2abdcd8a7bb45800374c374b8958012bb4387c3ebce253 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-001C
Epic ID: M1-001
Title: Add stable canonical state hash primitive
Type: implementation
Area: engine
Primary Concern: rules

## Why

Add the deterministic canonical state hash primitive needed before engine results, golden replay, and CLI `hash` output can be trusted.

## Authoritative Spec References

- 03-game-state-events-decisions.s020 (State hashing)
- 12-roadmap.s005 (Milestone 1: terminal engine)
- 15-implementation-kickoff.s006 (Step 2 - `@optcg/engine-core`)
- 15-implementation-kickoff.s011 (Definition of done for kickoff)
- 22-v6-implementation-tightening.s006 (2. TypeScript model)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

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

### 12-roadmap.s005 (Milestone 1: terminal engine)

Deliverables:

- `GameState` model.
- Setup, draw, DON!!, main, end phases.
- Play Character/Stage/Event skeleton.
- Attack/battle/damage with vanilla cards.
- Event journal.
- State hash.
- CLI runner.

Exit criteria:

- Two sample decks can finish a vanilla match in CLI.
- Golden replay can reconstruct final hash.
- Invariant tests pass after every action.

### 15-implementation-kickoff.s006 (Step 2 - `@optcg/engine-core`)

Implement the pure deterministic engine.

Initial exports:

```ts
createInitialState(input): GameState
getLegalActions(state, playerId): LegalAction[]
applyAction(state, action): EngineResult
resumeDecision(state, response): EngineResult
computeView(state): ComputedGameView
filterStateForPlayer(state, playerId): PlayerView
hashGameState(state): string
```

### 15-implementation-kickoff.s011 (Definition of done for kickoff)

- `pnpm test` passes.
- A CLI vanilla match can end by damage, deck-out, or concession.
- Every accepted action increments `stateSeq`.
- Every atomic mutation emits at least one `EngineEvent` or has an explicit no-event reason.
- `hashGameState()` is stable across repeated runs with the same seed.
- `filterStateForPlayer()` never leaks opponent hand, deck order, face-down life, RNG, or effect queue internals.

### 22-v6-implementation-tightening.s006 (2. TypeScript model)

The old `16-typescript-interface-draft.md` was a draft and referenced undefined symbols. The implementation contract is now `contracts/canonical-types.ts`.

Resolved and normalized items include:

- `Color` -> `CardColor`
- `Attribute`
- `ZoneRef`
- `MatchCardManifest`
- `RngState`
- `EffectQueueEntry`
- `ContinuousEffect`
- `EventVisibility`
- `CardRef`
- `DecisionResponse`
- `Cost`
- `PaymentOption`
- `TargetRequest`
- `CardSelectionRequest`
- `EffectOption`
- `PublicEffectEvent` replacement via filtered `EngineEvent[]`
- `eventLog`/`eventJournal` conflict resolved to `eventJournal`
- `activeBattle`/`battle` conflict resolved to `battle`
- serializable arrays instead of `Set`

The contract compiles with:

```bash
cd contracts
tsc -p tsconfig.json
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

Own only stable serialization and hashing helpers for canonical state-shaped data. Do not implement GameState setup, action application, event replay, hidden-info filtering, or CLI commands.

## Scope

- add a stable canonical serialization helper for JSON-compatible state-shaped values
- add a deterministic hash helper using Node standard library crypto
- canonical serialization recursively sorts plain object keys at every depth while preserving array order
- hash helper uses SHA-256 from Node standard crypto and returns lowercase hex
- unsupported non-JSON/cyclic inputs fail closed with a deterministic error
- ensure object key order does not affect hash output
- add tests proving repeated hashes are stable for semantically identical input

## Out of Scope

- full `GameState` construction
- replay log format
- event journal generation
- public view hashing
- CLI runner output

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/**
- tests/engine/**

## Constraints

- do not approve this story until ENG-001A is done
- do not approve this story until ENG-001B is done
- hashing must be deterministic and local-only
- do not include public-view filtering behavior in this story
- must pass `corepack pnpm run verify`
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- unit test proving repeated hash stability
- unit test proving object key order normalization
- unit test proving nested object key order normalization
- unit test proving array order remains significant
- unit test proving a known canonical fixture produces the expected SHA-256 lowercase hex digest
- unit test proving unsupported values such as `undefined`, functions, symbols, bigint, non-finite numbers, and cyclic structures fail closed

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- hash output is stable across repeated runs for the same canonical input
- object key insertion order does not change hash output
- nested object key insertion order does not change canonical serialization or hash output
- array order remains significant
- the same known canonical fixture produces a fixed expected SHA-256 lowercase hex digest
- unsupported non-JSON values and cyclic structures are rejected rather than silently coerced

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
