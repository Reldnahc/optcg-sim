<!-- agent-packet:story-id ENG-001A -->
<!-- agent-packet:story-path stories/approved/ENG-001A-engine-core-package-skeleton.yaml -->
<!-- agent-packet:story-sha256 3a5140c899bb75ca606fd13297eb91fcb8dbbed78e10a615aef931f97a135604 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-001A
Epic ID: M1-001
Title: Add engine-core package skeleton and compile lane
Type: tooling
Area: engine
Primary Concern: tooling

## Why

Add the strict `@optcg/engine-core` package shell so later engine stories have a pure package boundary, compile target, and package-local test lane.

## Authoritative Spec References

- 15-implementation-kickoff.s004 (Package bootstrap order)
- 15-implementation-kickoff.s006 (Step 2 - `@optcg/engine-core`)
- 15-implementation-kickoff.s012 (Guardrails)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

### 15-implementation-kickoff.s004 (Package bootstrap order)

```text
packages/
  types/
  engine-core/
  effects/
  cards/
  view-engine/
  match-server/
  api/
  client/
  bot/
integration/
fixtures/
```

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

### 15-implementation-kickoff.s012 (Guardrails)

- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code.
- The client must not import `engine-core` once hidden state exists; use `view-engine`.
- The card-data package may call Poneglyph, but effect resolution must consume resolved manifests, not live HTTP calls.
- Unsupported cards must fail closed outside dev sandbox.

### 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)

Package-boundary enforcement is required, not optional.

At minimum, lint rules or dependency-cruiser / equivalent boundary tooling must enforce:

- `@optcg/engine-core` cannot import React, browser code, WebSocket transport, Redis, Postgres, or live HTTP clients.
- `@optcg/view-engine` cannot import hidden-information-only server modules.
- `@optcg/client` cannot import server-only packages.
- `@optcg/server` cannot bypass `@optcg/cards` to call card-data sources directly from engine execution paths.
- test helpers that expose hidden state cannot be imported into browser/client production bundles.
- replay validation code cannot depend on client rendering code.

If stronger tooling is adopted, such as dependency-cruiser, Knip, or custom graph checks, CI must fail on violations.

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

Own only package skeleton, a minimal non-gameplay package entrypoint, package compile/test wiring, and boundary tests. Do not stub or export engine behavior functions from `15-implementation-kickoff.s006`, and do not implement GameState setup, RNG, hashing, legal actions, or turn flow.

## Scope

- create `packages/engine-core` with strict TypeScript config extending the repo baseline
- expose package-local compile and test commands consistent with root tooling
- ensure root typecheck includes the engine-core compile target
- add or update lint boundary tests proving engine-core cannot import forbidden client/server/browser/runtime dependencies

## Out of Scope

- deterministic RNG implementation
- state hash implementation
- GameState setup
- legal action generation
- CLI runner

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/**
- package.json
- pnpm-lock.yaml
- pnpm-workspace.yaml
- eslint.config.mjs
- tests/lint/**
- tests/fixtures/eslint/**

## Constraints

- do not approve this story until all TYP-001 child stories are done
- do not approve this story until TYP-003 is done
- engine-core must not import React, browser code, WebSocket transport, Redis, Postgres, or live HTTP clients
- do not add gameplay behavior in the package skeleton story
- must pass `corepack pnpm run verify`
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- package compile smoke test for engine-core
- lint fixture test proving engine-core rejects forbidden imports for React, browser/client code, WebSocket/server transport, Redis, Postgres, and live HTTP clients
- root verify includes the new compile target

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- `@optcg/engine-core` exists as a workspace package
- root typecheck compiles engine-core
- engine-core package boundary rejects forbidden imports mechanically

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
