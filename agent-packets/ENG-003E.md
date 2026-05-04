<!-- agent-packet:story-id ENG-003E -->
<!-- agent-packet:story-path stories/approved/ENG-003E-vanilla-combat-replay-smoke.yaml -->
<!-- agent-packet:story-sha256 61caa97355c8c043b532d89a8ffc21627ed638d21b198625df49c8d67d0dcd35 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-003E
Epic ID: M1-001
Title: Expand replay smoke for vanilla combat
Type: verification
Area: replay
Primary Concern: verification

## Why

Expand the package-local replay smoke fixture to cover manifest-backed setup, vanilla attack declaration, supported vanilla Life damage, Character K.O., and rule-processing defeat checkpoints.

## Authoritative Spec References

- 08-replay-rollback-recovery.s004 (Replay log)
- 02-engine-mechanics.s017 (Battle sequence)
- 02-engine-mechanics.s018 (Attack Step)
- 02-engine-mechanics.s021 (Damage Step)
- 02-engine-mechanics.s023 (Damage processing)
- 02-engine-mechanics.s035 (Exact win/loss conditions)
- 03-game-state-events-decisions.s020 (State hashing)
- 08-replay-rollback-recovery.s006 (Checkpoints)
- 09-card-data-and-support-policy.s013 (Match-time card manifest)
- 11-testing-quality.s010 (Golden replay tests)
- 11-testing-quality.s012 (Replay drift tests)
- 12-roadmap.s005 (Milestone 1: terminal engine)
- 18-acceptance-tests.s003 (Milestone 1 - terminal engine)
- 22-v6-implementation-tightening.s012 (8. Replay determinism)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

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

### 02-engine-mechanics.s017 (Battle sequence)

A battle is a sub-state inside Main Phase.

### 02-engine-mechanics.s018 (Attack Step)

1. Attacker rests an active Leader or Character.
2. Attacker selects target: opponent Leader or one rested opponent Character.
3. Emit `attackDeclared`.
4. Queue attacker's `[When Attacking]` effects in the attack timing window.
5. Resolve that attack timing window.
6. If attacker or target left its zone or is no longer a legal battle participant, skip to End of Battle.

### 02-engine-mechanics.s021 (Damage Step)

1. Compute attacker and target power from `ComputedGameView`.
2. If attacker power is lower than target power, no damage/K.O. occurs.
3. If attacker power is equal or greater:
   - Target Leader: deal damage.
   - Target Character: K.O. target.
4. Emit events for damage, life movement, K.O., card movement.
5. Triggered effects during damage wait until damage processing completes.

### 02-engine-mechanics.s023 (Damage processing)

For each point of damage:

1. If player has 0 life, mark defeat condition and run rule processing.
2. Otherwise, take the top life card.
3. If the card has `[Trigger]`, ask whether to reveal and activate it instead of adding it to hand.
4. If trigger is activated, the card is temporarily in no zone while the trigger resolves.
5. After trigger resolution, trash the card unless the trigger or a replacement says otherwise.
6. If trigger is declined or unavailable, add the card to hand hidden.

When damage is greater than 1, repeat this process one point at a time in official order.

`[Banish]` replaces the normal life-to-hand/trigger path by trashing the life card instead.

### 02-engine-mechanics.s035 (Exact win/loss conditions)

Run defeat checks at every rule-processing checkpoint:

1. **Leader damage at 0 Life** - if a player has 0 Life cards and their Leader would take damage, that player loses.
2. **Deck-out** - if a player has 0 cards in deck at any rule-processing checkpoint, that player loses.
3. **Concession** - a player may concede at any time; concession is immediate and cannot be prevented or replaced by card effects.
4. **Effect-based win/loss** - card effects may directly cause a win or loss during effect resolution.
5. **Double loss** - if both players meet defeat conditions at the same rule-processing checkpoint, both lose and the match is a draw.

Rule processing happens after atomic state changes, including mid-effect. For example, if a player decks out while drawing during an effect, the loss is detected at the next rule-processing point.

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

Own only the local engine-core replay smoke fixture and test assertions for ENG-003 combat behavior. Do not define a production replay artifact schema, CLI runner, persisted replay storage, rollback, or post-game view generation.

## Scope

- extend or add a checked-in local replay smoke fixture using deterministic setup input, manifest data, supported ENG-003 actions, and any deterministic internal system entries emitted by canonical engine processing
- replay at least one supported vanilla Leader damage sequence and assert checkpoint/final hashes
- replay at least one supported vanilla Character K.O. sequence and assert checkpoint/final hashes
- replay terminal rule-processing defeat paths for both Leader damage at 0 Life and deck-out, and assert the final statuses
- include only no-blocker, no-counter, no-trigger, no-replacement supported vanilla combat paths from ENG-003C
- include replay setup evidence as either an initial snapshot or RNG seed plus explicit initial deck orders, including main-deck card IDs and DON!! deck IDs, following `08-replay-rollback-recovery.s004`
- assert checkpoint hashes for the local smoke fixture using the checkpoint shape from `08-replay-rollback-recovery.s006`
- keep fixture entries deterministic and exclude transport timestamps, audit timestamps, signatures, client IDs, and nondeterministic metadata
- allow spec-required `MatchCardManifest.createdAt` only as a deterministic fixed fixture value or when excluded from replay hash assertions by existing hash policy
- document in fixture naming or versioning that this remains package-local smoke coverage, not the production replay schema

## Out of Scope

- production replay artifact schema
- persisted replay storage
- rollback or recovery behavior
- CLI replay command
- post-game full-information replay views
- blocker, counter, trigger, replacement, Banish, Double Attack, or full vanilla-game completion coverage

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/**
- fixtures/replays/**
- tests/engine/**

## Constraints

- do not activate, packetize, or implement this story until ENG-003D is done
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

- golden replay smoke test for setup plus supported vanilla Leader damage
- golden replay smoke test for setup plus supported vanilla Character K.O.
- golden replay smoke test for terminal defeat by Leader damage at 0 Life
- golden replay smoke test for terminal defeat by deck-out
- negative test proving action-script or manifest-stat drift changes the final hash or fails checkpoint assertion
- fixture determinism assertion rejecting transport/audit timestamps and transport-only fields while allowing deterministic fixed manifest `createdAt`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- replaying the combat fixture from the same manifest, initial snapshot or RNG seed plus explicit initial deck orders, action script, and helper-step script produces the same checkpoint hashes
- changing a combat action or manifest stat changes the final hash or fails a checkpoint assertion
- fixture entries contain deterministic engine inputs only
- the replay smoke test covers supported Leader damage, supported Character K.O., terminal defeat by Leader damage at 0 Life, and terminal defeat by deck-out
- the replay smoke test runs under root `pnpm verify`

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
