<!-- agent-packet:story-id ENG-053A -->
<!-- agent-packet:story-path stories/approved/ENG-053A-split-effect-runtime-primitives.yaml -->
<!-- agent-packet:story-sha256 4d23957a99e517b77ea3a4b322d5fe584ce0169d3aa33cc7ac048c284cac1a7e -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-053A
Epic ID: ENG-053
Title: Split effect-runtime primitives by draw, target K.O., and replacement responsibilities
Type: refactor
Area: engine
Primary Concern: rules

## Why

Split the mixed `effect-runtime-primitives.ts` implementation into cohesive draw primitive, selected-target K.O. primitive, and selected-target K.O. replacement-process modules without changing runtime behavior.

## Authoritative Spec References

- 01-system-architecture.s005 (`@optcg/engine-core`)
- 03-game-state-events-decisions.s005 (Event journal)
- 03-game-state-events-decisions.s007 (Atomic mutation contract)
- 03-game-state-events-decisions.s020 (State hashing)
- 11-testing-quality.s004 (Unit tests per DSL primitive)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 01-system-architecture.s005 (`@optcg/engine-core`)

Server-only authoritative game engine.

Contains:

- Full `GameState`, including hidden zones and RNG state.
- `applyAction`, `getLegalActions`, `resumeDecision`.
- Rule processing, battle flow, effect queue, event journal.
- Full visibility filtering functions.
- State hash generation.

Does not contain:

- React components.
- Database queries.
- WebSocket room management.
- Poneglyph HTTP calls.

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

### 03-game-state-events-decisions.s007 (Atomic mutation contract)

Every primitive state mutation uses the same return shape.

```ts
interface EngineStepResult {
  state: GameState;
  events: EngineEvent[];
}

type AtomicMutation = (state: GameState) => EngineStepResult;
```

The engine should not mutate state in place in production logic. Dev/test may use deep-freeze to catch accidental mutation.

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

Each package must expose consistent task names where applicable:

- `build`
- `typecheck`
- `lint`
- `test`
- `test:watch`
- `coverage`

Integration-heavy packages may additionally expose:

- `test:integration`
- `test:replay`
- `test:contracts`
- `test:hidden-info`

At the root, the workspace must provide:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm coverage
pnpm verify
```

`pnpm verify` is the canonical local pre-push command and must run the same core checks as the main merge CI pipeline.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

The repo must define a root `tsconfig.base.json` and package-level `tsconfig.json` files extending it.

Required compiler settings for implementation packages:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noImplicitOverride": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "useUnknownInCatchVariables": true,
    "noEmitOnError": true
  }
}
```

Strongly preferred unless a package-specific exception is justified in writing:

- `verbatimModuleSyntax`
- `importsNotUsedAsValues = error`
- `noUnusedLocals`
- `noUnusedParameters`

The repo must not rely on broad TypeScript escape hatches. The following require explicit justification in code review and should be lint-restricted where possible:

- `any`
- non-null assertion (`!`)
- `@ts-ignore`
- `@ts-nocheck`
- unchecked type assertions across trust boundaries

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

A pull request must not merge unless the main CI pipeline passes.

Minimum required merge gates:

1. install dependencies with locked versions,
2. build/typecheck workspace,
3. lint workspace,
4. run tests,
5. validate contracts and schemas,
6. validate formatting,
7. publish coverage artifact,
8. fail if generated artifacts or snapshots are stale when the repo defines them.

Recommended CI jobs:

- `quality` -> lint, typecheck, format check
- `engine` -> engine unit, interaction, invariant, replay tests
- `contracts` -> canonical types, DSL schema, fixture normalization, SQL/schema validation
- `client-server-smoke` -> protocol smoke tests and filtered-view checks

For protected branches, require at least one human review plus passing CI.

Ordinary protected-branch changes still require a pull request, at least one
human review, and passing required checks. The only allowed packet-lifecycle
exception is a dedicated GitHub App actor `optcg-packet-cleanup[bot]` running
workflow `.github/workflows/post-merge-packet-cleanup.yml` with token
`POST_MERGE_PACKET_CLEANUP_TOKEN`, and that exception exists only to push exact
packet-completion command output to `main` after a reviewed pull request has
merged. The cleanup actor and token must not be available to arbitrary GitHub
Actions workflows, human users, broad admin roles, implementation changes, docs
changes, tooling changes, or ordinary development pushes.

Exact packet-completion cleanup may use cleanup-scoped lifecycle verification
instead of full repo verification before the direct cleanup push. Cleanup-scoped
lifecycle verification must prove metadata binding, packet-completion output,
story lifecycle state, active packet state, and committed story metadata remain
valid. Normal main-branch CI remains the broad post-cleanup safety net after
the cleanup commit is pushed. Cleanup that includes any manual edit beyond
packet-completion output still requires full repo verification and the normal
reviewer-subagent path before push or merge.

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

Own only the behavior-preserving extraction of existing effect runtime primitive code from `packages/engine-core/src/effect-runtime-primitives.ts` into cohesive runtime modules and the minimal import updates required to keep existing consumers compiling. Do not add gameplay support, change event order, change state hashes, change hidden-information behavior, change DTOs, change replay or protocol behavior, or broaden replacement semantics.

## Scope

- inspect current exports and imports for `packages/engine-core/src/effect-runtime-primitives.ts`
- extract draw primitive execution, no-choice draw helpers, and draw support predicates into `effect-runtime-draw-primitives.ts`
- extract selected-target K.O. execution, target validation, K.O. event emission, and unreplaced selected-target K.O. process execution into `effect-runtime-target-ko-primitives.ts`
- extract selected-target K.O. replacement process construction, decision pause/resume helpers, and accepted replacement process application helpers currently owned by the primitive file into `effect-runtime-ko-replacement-process.ts`
- keep `effect-runtime-primitives.ts` as a temporary compatibility barrel if that reduces import churn and preserves existing consumers
- update imports only where doing so is safer and fully covered
- use existing focused runtime tests as characterization coverage for the refactor

## Out of Scope

- adding new effect primitive support
- changing replacement priority, replacement chaining, replacement candidate semantics, replacement decisions, or replacement application semantics
- changing event payloads, event order, event visibility, hidden-information allow lists, state hashes, errors, mutation behavior, or decision behavior
- changing DTOs, contracts, replay behavior, protocol behavior, card data, CLI behavior, server behavior, client behavior, or broader effect-runtime orchestration
- changing test behavior expectations except import paths if needed

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/effect-runtime-primitives.ts
- packages/engine-core/src/effect-runtime-draw-primitives.ts
- packages/engine-core/src/effect-runtime-target-ko-primitives.ts
- packages/engine-core/src/effect-runtime-ko-replacement-process.ts
- packages/engine-core/src/effect-runtime.ts
- packages/engine-core/src/effect-runtime-queue-results.ts
- packages/engine-core/src/effect-runtime-queue-target-decisions.ts
- packages/engine-core/src/effect-runtime-search-reveal.ts
- packages/engine-core/src/effect-runtime-trash-from-hand.ts
- packages/engine-core/src/effect-runtime-trigger-queueing-attack.ts
- packages/engine-core/src/effect-runtime-trigger-queueing-ko.ts
- packages/engine-core/src/effect-runtime-trigger-queueing-main-event.ts
- packages/engine-core/src/effect-runtime-trigger-queueing-on-play.ts
- packages/engine-core/src/play-card-support.ts
- packages/engine-core/src/actions.ts
- packages/engine-core/src/effect-runtime-draw-trash-sequence.ts
- packages/engine-core/src/effect-runtime-primitives.test.ts
- packages/engine-core/src/effect-runtime-draw.test.ts
- packages/engine-core/src/effect-runtime-target-primitives.test.ts
- packages/engine-core/src/effect-runtime-replacement-application.test.ts
- packages/engine-core/src/effect-runtime-draw-trash-sequence.test.ts
- stories/generated/ENG-053-split-effect-runtime-primitives-parent.yaml
- stories/generated/ENG-053A-split-effect-runtime-primitives.yaml
- stories/approved/ENG-053-split-effect-runtime-primitives-parent.yaml
- stories/approved/ENG-053A-split-effect-runtime-primitives.yaml
- agent-packets/ENG-053A.md
- agent-packets/active.json

## Constraints

- use TDD discipline by treating the focused runtime tests as characterization coverage before moving code
- keep the patch limited to cohesive file extraction and necessary import updates
- prefer a compatibility barrel over broad import churn when behavior and compile coverage remain clear
- use `corepack pnpm`, not plain `pnpm`, when running repo commands in this environment
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

- characterize existing behavior before the split with the focused runtime tests unless an existing baseline failure is recorded
- `corepack pnpm exec vitest run packages/engine-core/src/effect-runtime-primitives.test.ts`
- `corepack pnpm exec vitest run packages/engine-core/src/effect-runtime-draw.test.ts`
- `corepack pnpm exec vitest run packages/engine-core/src/effect-runtime-target-primitives.test.ts`
- `corepack pnpm exec vitest run packages/engine-core/src/effect-runtime-replacement-application.test.ts`
- `corepack pnpm exec vitest run packages/engine-core/src/effect-runtime-draw-trash-sequence.test.ts`
- `corepack pnpm --filter @optcg/engine-core typecheck`
- `corepack pnpm run packets:verify`
- `corepack pnpm run stories:validate`
- full `corepack pnpm run verify` if feasible

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- existing tests pass without behavior expectation changes
- draw, selected-target K.O., and K.O. replacement-process code no longer live in one mixed-responsibility primitive file
- `effect-runtime-primitives.ts` remains only as a compatibility barrel or contains no mixed-responsibility runtime implementation
- event order, event payloads, event visibility, state hashes, errors, decisions, and mutation behavior are unchanged
- existing consumers continue to compile
- no unrelated hidden-info, DTO, replacement semantics, replay, protocol, card-data, CLI, server, client, or gameplay work is included
- PR notes list moved functions, changed imports, tests run, and confirm the change was behavior-preserving

## Post-Approval Role Sections

### implementation

Responsibilities
- implement only the approved story using packet authority order
- follow strict TypeScript, lint, and verification requirements
- report ambiguity instead of inventing uncited behavior

Forbidden Actions
- do not broaden scope beyond the approved story boundary or allowed_touch_points
- do not add packet extraction behavior unless the approved story explicitly owns it
- do not implement story-author/story-review handoff mechanics

Required Inputs
- active packet content with authoritative spec references
- approved story scope, non-scope, and acceptance criteria
- allowed_touch_points and required test list

Required Outputs
- scoped code and test changes within approved touch points
- verification command results with pass/fail status
- assumptions and blockers note

Verification Checklist
- confirm required inputs are present and current
- confirm forbidden actions are not introduced
- confirm required outputs are produced for handoff

### code-review

Responsibilities
- review correctness, scope fit, and required-test coverage
- verify no forbidden role sections or lifecycle changes were introduced
- confirm canonical packet behavior remains enforceable

Forbidden Actions
- do not author new feature scope outside the reviewed patch
- do not bypass required tests, packet verification, or CI gate evidence
- do not approve scope drift that violates story boundary

Required Inputs
- proposed patch limited to approved touch points
- active packet, approved story, and cited spec references
- verification and test evidence for required commands

Required Outputs
- review findings prioritized by correctness and scope compliance
- clear disposition for findings (fix/defer/block) with rationale
- review closure recommendation for Session Orchestrator handoff

Verification Checklist
- confirm required inputs are present and current
- confirm forbidden actions are not introduced
- confirm required outputs are produced for handoff

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

<!-- prettier-ignore-end -->
