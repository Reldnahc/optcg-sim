<!-- agent-packet:story-id ENG-044D -->
<!-- agent-packet:story-path stories/approved/ENG-044D-compose-power-modifiers.yaml -->
<!-- agent-packet:story-sha256 924446778700fc5dbff256564819e154d84a1818a0464a148c141e46bd282ea6 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-044D
Epic ID: KICK-001
Title: Compose continuous power with DON and battle modifiers
Type: implementation
Area: engine
Primary Concern: rules

## Why

Prove supported continuous +1000 power modifiers compose deterministically with existing attached DON and battle counter power derivation.

## Authoritative Spec References

- 0003-continuous-effects-computed-view.s004 (Decision)
- 0003-continuous-effects-computed-view.s005 (Consequences)
- 02-engine-mechanics.s024 (Effect categories)
- 03-game-state-events-decisions.s020 (State hashing)
- 11-testing-quality.s004 (Unit tests per DSL primitive)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 0003-continuous-effects-computed-view.s004 (Decision)

Canonical state stores base facts and active modifier records. `computeView(state)` derives current power, cost, keywords, restrictions, and protections.

### 0003-continuous-effects-computed-view.s005 (Consequences)

Positive:

- Prevents double-application of modifiers.
- Makes state hashes more stable.
- Keeps replay state cleaner.
- Makes expiration easier to reason about.

Negative:

- Computed view performance must be measured.
- Some rule interactions may require careful layering.

### 02-engine-mechanics.s024 (Effect categories)

Every effect is classified as one of:

| Category    | Behavior                                             |
| ----------- | ---------------------------------------------------- |
| Auto        | Queued when an event satisfies its trigger.          |
| Activate    | Player chooses to activate during a legal window.    |
| Permanent   | Contributes modifiers/restrictions to computed view. |
| Replacement | Intercepts a replaceable process before it occurs.   |

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

Own only composition tests and any small compute-view adjustment needed for additive composition. Do not introduce broad layering, base setters, or new effect-runtime creation paths.

## Scope

- prove current power equals base power plus attached DON bonus plus battle counter bonus plus supported continuous power modifier bonus
- preserve existing attached DON turn-player-only behavior
- preserve existing battle counter target-only behavior
- keep derivation deterministic across repeated runs

## Out of Scope

- broad continuous-effect layers
- non-additive modifiers
- base power setters
- keyword, cost, restriction, or protection composition
- real-card fixtures or card-data integration

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/compute-view.ts
- packages/engine-core/src/compute-view.test.ts
- stories/generated/ENG-044D-compose-power-modifiers.yaml
- stories/approved/ENG-044D-compose-power-modifiers.yaml
- agent-packets/ENG-044D.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- generate and activate only the ENG-044D packet while implementing this story
- run `corepack pnpm run packets:verify` before implementation and review handoff
- stay within allowed_touch_points
- target the ENG-044 parent integration branch
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

- run `corepack pnpm exec vitest run packages/engine-core/src/compute-view.test.ts`
- run `corepack pnpm --filter @optcg/engine-core typecheck`
- run `corepack pnpm run packets:verify`
- run `corepack pnpm run verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- attached DON and supported continuous power both contribute to current power during controller turn
- battle counter power and supported continuous power both contribute to current target power during battle
- unrelated cards do not receive the continuous source-self modifier
- repeated `computeView` calls return stable computed power values

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
