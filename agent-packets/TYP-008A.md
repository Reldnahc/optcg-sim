<!-- agent-packet:story-id TYP-008A -->
<!-- agent-packet:story-path stories/approved/TYP-008A-canonical-effect-execution-frame-state.yaml -->
<!-- agent-packet:story-sha256 f43e5e15e12087cabfeaa6376afbb74658cf65fc2567a19f5653b9d7bd0ddbc2 -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: TYP-008A
Epic ID: TYP-008
Title: Canonical effect execution frame state
Type: implementation
Area: contracts
Primary Concern: contract

## Why

Add canonical serialized GameState authority for resumable effect execution frames so ENG-055B can pause and resume composed sequences without process-local state.

## Authoritative Spec References

- 01-system-architecture.s004 (`@optcg/types`)
- 01-system-architecture.s021 (Cross-package workflow)
- 03-game-state-events-decisions.s002 (Canonical state model)
- 03-game-state-events-decisions.s020 (State hashing)
- 04-effect-runtime.s002 (Overview)
- 04-effect-runtime.s010 (Queue processing)
- 04-effect-runtime.s012 (Player choices during effect resolution)
- 04-effect-runtime.s016 (Failure policy)
- 11-testing-quality.s008 (Invariant tests)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 01-system-architecture.s004 (`@optcg/types`)

Shared TypeScript types with no runtime dependencies on app packages.

Contains:

- `CardId`, `InstanceId`, `PlayerId`, `MatchId` branded types.
- Public action and message contracts.
- `PlayerView`, `SpectatorView`, and replay DTOs.
- Card-data schemas.
- Deck validation input/output types.

Does not contain:

- Full engine implementation.
- Database clients.
- WebSocket clients.
- Browser-specific code.

### 01-system-architecture.s021 (Cross-package workflow)

1. Shared type changes land first.
2. Engine changes include tests and replay hash updates.
3. Effect-definition changes include card tests.
4. Protocol changes include old/new compatibility notes.
5. Integration tests run across packages before merge.

Avoid single PRs that rewrite multiple boundaries unless they are mechanical migrations.

### 03-game-state-events-decisions.s002 (Canonical state model)

The canonical `GameState` is server-only. It includes hidden information, RNG state, internal queues, snapshots, and metadata.

**v6 contract:** the compile-ready version of every interface in this document is [`contracts/canonical-types.ts`](contracts/canonical-types.ts). Markdown snippets below are explanatory and may be abbreviated. If a snippet conflicts with the contract file, the contract file wins.

Canonical naming decisions:

| Concept                 | Canonical name             |
| ----------------------- | -------------------------- |
| State sequence          | `stateSeq`                 |
| Event collection        | `eventJournal`             |
| Battle sub-state        | `battle`                   |
| Effect queue            | `effectQueue`              |
| Effect execution frames | `effectExecutionFrames`    |
| Continuous modifiers    | `continuousEffects`        |
| Decision answer action  | `Action.respondToDecision` |
| Hidden/server-only RNG  | `rng`                      |

Do not use `eventLog`, `activeBattle`, raw JavaScript `Set`, or transport envelopes inside canonical state. Serializable arrays are required for deterministic hashing.

```ts
type PlayerId = string & { __brand: "PlayerId" };
type CardId = string & { __brand: "CardId" };
type InstanceId = string & { __brand: "InstanceId" };
type MatchId = string & { __brand: "MatchId" };
type EngineEventId = string & { __brand: "EngineEventId" };

interface GameState {
  matchId: MatchId;
  status: MatchStatus;
  version: RuntimeVersionSet;
  seq: StateSeq;
  actionSeq: number;
  turn: TurnState;
  players: Record<PlayerId, PlayerState>;
  timers: TimerState;
  battle?: BattleState;
  pendingDecision?: PendingDecision;
  effectQueue: EffectQueueEntry[];
  effectExecutionFrames: EffectExecutionFrame[];
  deferredTriggers: DeferredTriggerBucket[];
  continuousEffects: ContinuousEffectRecord[];
  replacementState: ReplacementProcessState[];
  revealedCards: RevealRecord[];
  rng: RngState;
  eventJournal: EngineEvent[];
  audit: AuditEntry[];
}
```

`effectExecutionFrames` is serialized authoritative internal state for resumable effect resolution. Frame records are match-scoped runtime context, participate in canonical state serialization and authoritative state hashes, and are not a client-facing `PlayerView` or `SpectatorView` surface.

Canonical live state also carries the authoritative per-player timer snapshot used for `PlayerView` and reconnect/state-sync payloads. Do not fabricate timer values in filtered views.

The browser does not receive this object.

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

### 04-effect-runtime.s002 (Overview)

The effect runtime executes effect definitions against the authoritative game state.

```text
Effect definitions        Runtime                 Engine core
DSL + custom handlers --> queue/choices/events --> atomic state mutations
```

The runtime must preserve timing, hidden information, source-presence rules, replacement effects, and deterministic replay.

**v6 contract:** queue entries, decisions, replacement state, and continuous-effect records are defined in [`contracts/canonical-types.ts`](contracts/canonical-types.ts). The algorithms below are normative when they are more precise than older snippets.

### 04-effect-runtime.s010 (Queue processing)

```ts
function processEffectQueue(state: GameState): EngineResult {
  let allEvents: EngineEvent[] = [];

  while (state.effectQueue.length > 0) {
    const entry = dequeueEffect(state);
    state = markResolving(state, entry.id);

    if (!canQueuedEffectResolve(entry, state)) {
      const cancelled = cancelQueuedEffect(
        state,
        entry,
        "source-or-condition-failed",
      );
      state = cancelled.state;
      allEvents.push(...cancelled.events);
      continue;
    }

    const resolution = executeEffectBlock(state, entry);
    state = resolution.state;
    allEvents.push(...resolution.events);

    const checked = checkRuleProcessingWithEvents(state, {
      causedBy: {
        type: "effect",
        queueEntryId: entry.id,
        effectId: entry.effectBlock.id,
      },
    });
    state = checked.state;
    allEvents.push(...checked.events);

    if (state.status.type === "gameOver") {
      return { state, events: allEvents, stateHash: hashState(state) };
    }

    const triggered = detectTriggeredEffects(state, resolution.events);
    state = enqueueTriggeredEffectsRespectingTiming(state, triggered);
  }

  return { state, events: allEvents, stateHash: hashState(state) };
}
```

There is no `return` inside the loop unless the game ends, an unrecoverable error occurs, or a pending decision pauses resolution.

Generic composed execution is represented by a resumable effect execution frame stored in `GameState.effectExecutionFrames`. The frame is serialized authoritative runtime context for one resolving effect and is not a client-facing object. It must track at least the queue entry, effect block, current effect path, next segment index, saved result references, segment results, transient selection sets, and pending-decision continuation. Frame records participate in authoritative canonical serialization and state hashes, but filtered player and live spectator views must not expose frame internals.

When a sequence segment pauses for a `PendingDecision`, the runtime stores the frame and returns the pending decision with the same causality context. After a valid response, resolution resumes from the stored frame at the paused segment rather than restarting earlier segments. Completed earlier segments must not be re-applied, and their saved result references and segment results remain available for later connector decisions.

### 04-effect-runtime.s012 (Player choices during effect resolution)

Effects pause through `PendingDecision`.

Example target selection flow:

```ts
function executeKoEffect(
  state: GameState,
  effect: KoEffect,
  context: EffectContext,
): EngineResult {
  const candidates = resolveTargetCandidates(state, effect.target, context);

  if (requiresChoice(effect.target)) {
    return pauseForDecision(state, {
      type: "selectTargets",
      playerId: resolveChooser(effect.target, context),
      request: effect.target,
      candidates,
      causedBy: context.causedBy,
    });
  }

  return koTargets(state, candidates.selected, context);
}
```

Decision responses are validated by the engine, not the client.

Composed execution records one segment result for every attempted sequence segment or optional clause. A segment result must record `attempted`, `succeeded`, `changedState`, `selectedCards`, `selectedTargets`, `paidCost`, and `playerDeclined`. `succeeded` means the segment legally performed its required instruction, while `changedState` separately records whether canonical state changed. Legal selection without mutation may still drive connectors such as "if you do" when card text depends on choosing or identifying an object.

Saved-result references may bind selected cards, selected targets, paid costs, or produced objects for later text such as `that Character`. A later segment may use a saved-result reference only while the referenced object remains legal for that later instruction; otherwise the later segment follows its connector and failure policy. Saved references must preserve hidden-information visibility and replay determinism.

### 04-effect-runtime.s016 (Failure policy)

```ts
type FailurePolicy =
  | "doAsMuchAsPossible"
  | "requiresAll"
  | "skipIfNoLegalTarget"
  | "optionalIfPossible";
```

Default is `doAsMuchAsPossible`, unless a connector or card text requires dependency.

For composed execution, failure policy applies to the whole effect block and to each segment through its connector:

- `doAsMuchAsPossible` attempts each supported segment and records per-segment success without rolling back successful independent segments.
- `requiresAll` fails the composed execution before mutation when any required segment cannot legally complete.
- `skipIfNoLegalTarget` skips the composed execution when required activation-time or first required resolution-time targets are absent.
- `optionalIfPossible` offers the optional instruction only when at least one legal execution path exists; if none exists, the segment is not attempted and does not create a decision.

Unsupported composed runtime shapes default to fail-closed rather than degrading to partial execution. Ambiguous connector dependency, saved-reference lifetime, optionality boundary, target visibility, pending-decision continuation, or replacement interaction must be treated as unsupported until the spec and capability matrix authorize it.

### 11-testing-quality.s008 (Invariant tests)

Run after every action, decision response, effect resolution, and replay step in test mode.

```ts
assertAllCardsInExactlyOneLocation(state);
assertNoDuplicateInstanceIds(state);
assertCharacterAreaSizeAtMostFive(state);
assertStageAreaSizeAtMostOne(state);
assertLeaderAreaExactlyOne(state);
assertAttachedDonConsistency(state);
assertNoIllegalHiddenInfoInViews(state);
assertPendingDecisionIsValid(state);
assertEffectQueueEntriesAreResolvableOrCancelled(state);
assertStateHashStable(state);
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

Own only the contract/spec/test authority for serialized effect execution frames. Do not implement generic sequence execution, pause/resume behavior, optionality, costs, playSelected, drawUpTo, saved-reference consumers, or card support.

## Scope

- add canonical TypeScript types for serialized effect execution frames
- sync generated package type projections for the new canonical contract
- add an authoritative GameState field for serialized effect execution frames
- initialize the frame list as empty in new game state
- ensure representative frame data is canonical-serializable and state-hash-visible
- ensure frame internals remain absent from player and spectator views
- update deterministic state-hash pins and replay fixtures only where the new empty authoritative field changes canonical serialization
- document this story as the serialized frame authority prerequisite for future ENG-055B work

## Out of Scope

- implementing generic sequence execution or decision continuation
- changing existing supported effect runtime behavior
- resolving saved-reference consumer semantics beyond storing serialized references
- parser, generated-support, real-card fixture, server, client, API, UI, database, or live Poneglyph work

## Allowed Touch Points

<!-- prettier-ignore -->
- specs/03-game-state-events-decisions.md
- specs/04-effect-runtime.md
- specs/section-index.json
- contracts/types/game-state.ts
- contracts/types/runtime.ts
- contracts/canonical-types.ts
- packages/types/src/game-state.ts
- packages/types/src/game-state.test.ts
- packages/types/src/runtime.ts
- packages/types/src/export-cohesion.test.ts
- packages/types/src/export-ownership.manifest.ts
- packages/types/src/view.test.ts
- packages/engine-core/src/initial-state.ts
- packages/engine-core/src/canonical-state.test.ts
- packages/engine-core/src/filter-state-effect-execution-frames.test.ts
- packages/engine-core/src/invariants.test.ts
- packages/engine-core/src/once-per-turn.test.ts
- packages/engine-core/src/filter-state-for-player.ts
- packages/engine-core/src/filter-state-for-player.test.ts
- packages/engine-core/src/*replay*.test.ts
- packages/engine-core/src/*sequencing*.test.ts
- packages/engine-core/src/*runtime*.test.ts
- packages/engine-core/src/*battle*.test.ts
- fixtures/replays/*.local.json
- stories/approved/TYP-008*.yaml
- agent-packets/TYP-008A.md
- agent-packets/TYP-008*-story-review-*.md
- agent-packets/active.json

## Constraints

- do not import @optcg/cards
- keep frame state authoritative, serialized, match-scoped, and internal to engine-core
- fail closed on replay, state-hash, or hidden-information ambiguity
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

- focused engine test proving initial state frame list is empty
- focused canonical-state test proving representative frame data changes the state hash
- focused view-filter test proving frame internals are absent from player and spectator views
- run `corepack pnpm run contracts:compile`
- run `corepack pnpm --filter @optcg/engine-core typecheck`
- run `corepack pnpm run specs:verify-metadata`
- run `corepack pnpm run stories:validate`
- run `corepack pnpm run packets:verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- GameState has a serialized `effectExecutionFrames` location for resumable composed effect execution context
- frame records bind to a queue entry and include effect block id, effect path, next segment index, segment results, saved references, transient selection sets, and pending decision continuation metadata
- new initial states contain an empty frame list
- frame records participate in authoritative canonical serialization and state hashes
- player and spectator views do not expose frame internals
- TYP-008A is documented as the serialized frame authority prerequisite for future ENG-055B work

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
