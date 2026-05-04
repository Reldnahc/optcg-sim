<!-- agent-packet:story-id ENG-005C -->
<!-- agent-packet:story-path stories/approved/ENG-005C-vanilla-play-card-replay-smoke.yaml -->
<!-- agent-packet:story-sha256 98bfb486ea79b2d6029ea1718999e99be2a7ebd80bb63b79418ddcf506586b34 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-005C
Epic ID: M1-001
Title: Expand replay smoke for vanilla Character and Stage play
Type: verification
Area: replay
Primary Concern: verification

## Why

Add deterministic replay smoke coverage for the ENG-005 vanilla Character and Stage play-card path, including paid play, Stage replacement, and Character overflow response handling.

## Authoritative Spec References

- 02-engine-mechanics.s016 (Playing a card)
- 02-engine-mechanics.s036 (DON!! card mechanics)
- 03-game-state-events-decisions.s005 (Event journal)
- 03-game-state-events-decisions.s017 (Canonical decision routing)
- 03-game-state-events-decisions.s020 (State hashing)
- 03-game-state-events-decisions.s021 (Invariant hooks)
- 08-replay-rollback-recovery.s004 (Replay log)
- 08-replay-rollback-recovery.s006 (Checkpoints)
- 09-card-data-and-support-policy.s013 (Match-time card manifest)
- 11-testing-quality.s008 (Invariant tests)
- 11-testing-quality.s010 (Golden replay tests)
- 11-testing-quality.s012 (Replay drift tests)
- 18-acceptance-tests.s003 (Milestone 1 - terminal engine)
- 22-v6-implementation-tightening.s012 (8. Replay determinism)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 02-engine-mechanics.s016 (Playing a card)

Playing a card from hand is a structured action:

```text
1. Reveal card from hand.
2. Compute total cost from base cost plus continuous cost modifiers.
3. Clamp final negative cost to 0.
4. Select required active DON!! in cost area.
5. Rest selected DON!!.
6. If playing a Character while character area is full, choose and trash one existing Character by rule process; no triggers.
7. If playing a Stage while stage area is full, trash existing Stage.
8. Place card in destination or trash Event before resolving Event effect.
9. Emit cardPlayed/cardMoved events.
10. Detect and queue [On Play] or Event effects as appropriate.
```

Cost payment should be represented as a `PendingDecision` if the player must choose exactly which DON!! or additional cards to pay.

### 02-engine-mechanics.s036 (DON!! card mechanics)

- Each DON!! attached to a Leader or Character grants +1000 power during the controller's turn only.
- During Main Phase, a player may give any number of active DON!! from cost area to their Leader or Characters.
- An attached DON!! card has `state: "attached"`; it is neither active nor rested while attached.
- When a card with attached DON!! leaves the field, all attached DON!! return to the owner's cost area rested.
- During Refresh Phase, all attached DON!! return to cost area rested, then the player's Leader, Characters, Stage, and DON!! in cost area become active.
- A `DON!! -X` cost may return the paying player's DON!! from cost area, attached to their Leader, or attached to their Characters unless the card text narrows the source. The paying player chooses the DON!! sources. If there are fewer than X eligible DON!! cards, the cost cannot be paid and the activation is illegal or declined before use is consumed.

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

### 03-game-state-events-decisions.s017 (Canonical decision routing)

All player choices are represented as `PendingDecision` and answered by exactly one action shape:

```ts
{
  type: ("respondToDecision", decisionId, response);
}
```

The engine validates the response against the current pending decision. The client never gets to submit raw target IDs or payment choices outside the active decision context.

The following decision families are implementation-required for Milestones 1-2:

```text
mulligan
chooseTriggerOrder
chooseOptionalActivation
payCost
selectTargets
selectCards
chooseEffectOption
confirmTriggerFromLife
chooseReplacement
orderCards
chooseCharacterToTrashForOverflow
```

Decision IDs are single-use. A response for an old decision ID is stale unless it is an exact idempotent retry already accepted by the match server.

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

### 03-game-state-events-decisions.s021 (Invariant hooks)

Run invariants after every accepted action and after every effect resolution in tests/dev.

Required invariants:

```ts
assertAllCardsInExactlyOneLocation(state);
assertNoDuplicateInstanceIds(state);
assertZoneOwnershipIsValid(state);
assertAttachedDonExistsAndBelongsToController(state);
assertCharacterAreaSizeAtMostFive(state);
assertStageAreaSizeAtMostOne(state);
assertLeaderAreaExactlyOne(state);
assertNoNegativeZoneCounts(state);
assertPendingDecisionHasLegalResponses(state);
assertEffectQueueEntriesHaveValidSourcesOrPolicies(state);
assertHiddenInfoNotPresentInPlayerViews(state);
```

### 08-replay-rollback-recovery.s004 (Replay log)

```ts
interface ReplayLog {
  header: MatchReplayHeader;
  reconstruction: ReplayReconstructionSource;
  entries: DeterministicReplayEntry[];
  audit?: ReplayAuditEnvelope[];
  checkpoints: ReplayCheckpoint[];
  finalSnapshot?: GameState;
}

type ReplayReconstructionSource =
  | { type: "initialSnapshot"; initialSnapshot: GameState }
  | {
      type: "seedAndDeckOrders";
      rngSeed: string;
      initialDeckOrders: Record<PlayerId, InstanceId[]>;
    };

type DeterministicReplayEntry =
  | {
      kind: "action";
      seq: number;
      stateSeqBefore: number;
      stateSeqAfter?: number;
      action: Action;
      resultingStateHash?: string;
    }
  | {
      kind: "decision";
      seq: number;
      decisionId: string;
      stateSeqBefore: number;
      stateSeqAfter?: number;
      response: DecisionResponse;
      resultingStateHash?: string;
    }
  | {
      kind: "system";
      seq: number;
      stateSeqBefore: number;
      stateSeqAfter?: number;
      event: unknown;
      resultingStateHash?: string;
    };

interface ReplayAuditEnvelope {
  entrySeq: number;
  clientActionId?: string;
  receivedAt?: string;
  connectionId?: string;
  transportMetadata?: unknown;
}
```

Intermediate effect events can be regenerated if the engine is version-pinned. For debugging, store them optionally as an audit trace. Client envelopes, timestamps, connection IDs, and signatures are audit metadata only; they are not deterministic replay inputs.

A replay artifact is invalid if it contains only `rngSeedCommitment` without either `rngSeed` or `initialSnapshot`.

### 08-replay-rollback-recovery.s006 (Checkpoints)

Store state hashes periodically:

```ts
interface ReplayCheckpoint {
  stateSeq: number;
  actionSeq: number;
  turnNumber: number;
  fullStateHash: string;
  publicViewHashes?: Record<PlayerId, string>;
  snapshotRef?: string;
}
```

Recommended checkpoint policy:

- Start of match.
- Start of every turn.
- After every rollback.
- End of match.
- Optional every N actions for long matches.

### 09-card-data-and-support-policy.s013 (Match-time card manifest)

At match creation, snapshot resolved card data versions and implementation data. Replays use this manifest instead of live Poneglyph data. The implementation contract is `MatchCardManifest` in `contracts/canonical-types.ts`.

```ts
interface MatchCardManifest {
  manifestHash: string;
  source: "poneglyph" | "poneglyph-fixture" | "manual-test";
  cardDataVersion: string;
  effectDefinitionsVersion: string;
  customHandlerVersion: string;
  banlistVersion: string;
  cards: Record<CardId, ResolvedCard>;
  createdAt: string;
}
```

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

### 11-testing-quality.s010 (Golden replay tests)

Store known game scripts and final state hashes.

```text
fixtures/replays/
  vanilla-basic-game.json
  blocker-counter-basic.json
  double-attack-life-trigger.json
  simultaneous-ko-triggers.json
  replacement-trigger-trash.json
```

CI replays them and checks:

- Final state hash.
- Checkpoint hashes.
- Event count/type sequence, optionally.
- No hidden-info leak in generated views.

### 11-testing-quality.s012 (Replay drift tests)

Whenever engine or effect definitions change:

1. Replay previous golden logs under the intended version bundle.
2. Compare checkpoint hashes.
3. Fail CI on unexpected drift.
4. Require migration/version-pin note for intentional drift.

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

### 22-v6-implementation-tightening.s012 (8. Replay determinism)

A replay artifact must contain either:

```text
initialSnapshot
```

or:

```text
rngSeed + initialDeckOrders
```

A seed commitment alone is not enough to reconstruct a match.

Replay entries are split into:

- deterministic replay entries, and
- audit envelopes for client IDs, received timestamps, signatures, and transport metadata.

Only deterministic entries participate in replay hashing.

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

Own only package-local replay smoke fixture and test coverage for ENG-005 vanilla play-card behavior. Do not define production replay schema, CLI commands, persisted replay storage, rollback, or client replay views.

## Scope

- extend or add a checked-in local replay smoke fixture using deterministic setup input, manifest data, supported ENG-005 actions, and any deterministic internal system entries emitted by canonical engine processing
- replay at least one nonzero-cost vanilla Character play from hand and assert checkpoint or final hashes
- replay at least one vanilla Stage play followed by Stage replacement and assert the old Stage reaches trash
- replay at least one full Character Area overflow that includes the pending decision and matching `respondToDecision` response
- assert that the replayed final state contains paid DON!! rested, the expected Character and Stage zones, and no duplicate card locations
- keep fixture entries deterministic and exclude transport timestamps, audit timestamps, signatures, client IDs, and nondeterministic metadata
- document in fixture naming or versioning that this remains package-local smoke coverage, not the production replay schema

## Out of Scope

- production replay artifact schema
- persisted replay storage
- rollback or recovery behavior
- CLI replay command
- post-game full-information replay views
- Event cards, On Play effects, replacement effects, or full vanilla-game completion coverage

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/**
- fixtures/replays/**
- tests/engine/**

## Constraints

- do not activate, packetize, or implement this story until ENG-005A and ENG-005B are done
- replay smoke must not become the production replay artifact schema
- deterministic replay entries must exclude transport timestamps, signatures, and client IDs
- no hidden-information view policy may be added in this story
- must pass `corepack pnpm run verify`
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- golden replay smoke test for paid vanilla Character play from hand
- golden replay smoke test for vanilla Stage replacement
- golden replay smoke test for Character overflow with `respondToDecision`
- negative test proving action-script drift changes the final hash or fails a checkpoint assertion
- negative test proving payment-selection drift changes the final hash or fails a checkpoint assertion
- negative test proving overflow-response drift changes the final hash or fails a checkpoint assertion
- negative test proving manifest-stat drift changes the final hash or fails a checkpoint assertion
- fixture determinism assertion rejecting transport/audit timestamps and transport-only fields while allowing deterministic fixed manifest `createdAt`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- replaying the play-card fixture from the same manifest, initial snapshot or RNG seed plus explicit initial deck orders, action script, and decision responses produces the same checkpoint hashes
- changing any one of the play action, selected payment, overflow response, or manifest stat changes the final hash or fails a checkpoint assertion
- fixture entries contain deterministic engine inputs only
- the replay smoke test covers paid Character play, Stage replacement, and Character overflow decision response

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
