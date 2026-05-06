<!-- agent-packet:story-id SPEC-001 -->
<!-- agent-packet:story-path stories/approved/SPEC-001-clarify-m1-replay-scope.yaml -->
<!-- agent-packet:story-sha256 c976ee1f0648863a0ffe657d3b26db8a6e559b926fc30a97c8077eb437520e1e -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: SPEC-001
Epic ID: KICK-001
Title: Clarify Milestone 1 replay scope as deterministic CLI smoke hash reconstruction
Type: tooling
Area: docs
Primary Concern: contract

## Why

Replace Milestone 1 production-style golden replay reconstruction wording with a narrower local deterministic CLI command/decision smoke requirement, while keeping production replay reconstruction in the later replay/rollback/recovery milestone.

## Authoritative Spec References

- 08-replay-rollback-recovery.s003 (Replay header)
- 08-replay-rollback-recovery.s004 (Replay log)
- 08-replay-rollback-recovery.s006 (Checkpoints)
- 12-roadmap.s005 (Milestone 1: terminal engine)
- 12-roadmap.s010 (Milestone 6: replay/rollback/recovery)
- 15-implementation-kickoff.s007 (Step 3 - CLI runner)
- 15-implementation-kickoff.s011 (Definition of done for kickoff)
- 24-story-schema.s026 (Approval rule)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

### 08-replay-rollback-recovery.s003 (Replay header)

```ts
interface MatchReplayHeader {
  replayFormatVersion: string;
  matchId: MatchId;
  createdAt: string;
  players: ReplayPlayerInfo[];
  engineVersion: string;
  rulesVersion: string;
  cardDataVersion: string;
  effectDefinitionsVersion: string;
  customHandlerVersion: string;
  banlistVersion: string;
  protocolVersion: string;
  rngAlgorithm: "pcg32" | "xoshiro256ss" | "test-fixed";
  rngSeed?: string; // allowed after match completion or in trusted storage
  rngSeedCommitment?: string;
  manifestHash: string;
  initialStateHash: string;
  finalStateHash?: string;
}
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

- CLI can play a complete vanilla match through normal legal actions.
- Character play from hand exists.
- Stage play from hand exists.
- DON!! attach/refresh works.
- Attacks against Leader and rested Character work.
- Damage, life-to-hand, K.O., deck-out, and concession endings work.
- Every accepted action has stable state hash output.
- Event journal seq is strictly increasing.
- Local deterministic CLI command/decision script smoke from fixture boot
  reproduces script-defined state-hash checkpoints and final hash, without
  requiring production ReplayCheckpoint artifacts.
- production `filterStateForPlayer` hidden-info tests consume real engine output.
- Invariant tests pass after every accepted action.

Milestone 1 does not include server, client, Poneglyph live adapter, Redis, ranked, broad card pool work, or production ReplayLog, ReplayHeader, persisted replay storage, rollback, recovery, version migration, or replay viewer.

### 12-roadmap.s010 (Milestone 6: replay/rollback/recovery)

Deliverables:

- Replay header with versions.
- Action/decision log.
- Checkpoints.
- Casual rollback.
- Hidden-info rollback classification.
- Redis active match snapshot.
- Crash freeze/recovery path.

Exit criteria:

- Completed match replay final hash matches.
- Rollback past revealed info is blocked in ranked policy.
- Simulated process restart recovers or freezes safely.

### 15-implementation-kickoff.s007 (Step 3 - CLI runner)

A CLI runner should allow one developer to play both sides.

Minimum CLI commands:

```text
show
hand
play <handIndex>
attach-don <donIndex> <target>
attack <attacker> <target>
counter <handIndex>
pass
respond <choice>
concede
hash
```

The CLI should print state sequence, current phase, pending decision, legal actions, and state hash after every action.

### 15-implementation-kickoff.s011 (Definition of done for kickoff)

- `pnpm test` passes.
- CLI can play a complete vanilla match through normal legal actions.
- Character play from hand exists.
- Stage play from hand exists.
- DON!! attach/refresh works.
- Attacks against Leader and rested Character work.
- Damage, life-to-hand, K.O., deck-out, and concession endings work.
- Every accepted action increments `stateSeq`.
- Every accepted action has stable state hash output.
- Every atomic mutation emits at least one `EngineEvent` or has an explicit no-event reason.
- Event journal seq is strictly increasing.
- `hashGameState()` is stable across repeated runs with the same seed.
- Local deterministic CLI command/decision script smoke from fixture boot
  reproduces script-defined state-hash checkpoints and final hash, without
  requiring production ReplayCheckpoint artifacts.
- production `filterStateForPlayer` hidden-info tests consume real engine output
  and prove opponent hand, deck order, face-down life, RNG, and effect queue
  internals stay hidden.
- Milestone 1 does not include server, client, Poneglyph live adapter, Redis,
  ranked, broad card pool work, or production ReplayLog, ReplayHeader, persisted
  replay storage, rollback, recovery, version migration, or replay viewer.

### 24-story-schema.s026 (Approval rule)

A generated story is not assignment-ready until it is either:

- manually approved by the project owner, or
- normalized and approved by an explicit review workflow that verifies schema completeness and valid spec references.

Approval should also verify that:

- `epic_id` is present and points at the parent gameplay or platform capability,
- `primary_concern` is singular and coherent,
- `story_boundary` makes the stop point obvious,
- `allowed_touch_points` are narrow enough to review,
- the story does not mix unrelated review concerns simply because they belong to one feature thread.

Only approved stories should be turned into agent packets.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only canonical spec wording and contract/spec tests that describe the M1 replay-scope gate. Do not change engine behavior, CLI behavior, replay fixtures, database schema, production replay contracts, or replay/rollback milestone behavior.

## Scope

- update Milestone 1 roadmap exit criteria to require a local deterministic CLI command/decision script smoke from fixture boot that reproduces script-defined state-hash checkpoints and a final hash, without requiring production ReplayCheckpoint artifacts
- update kickoff definition-of-done text to use the same local deterministic CLI smoke hash reconstruction requirement
- ensure Milestone 1 explicitly excludes production ReplayLog, ReplayHeader, persisted replay storage, rollback, recovery, version migration, and replay viewer requirements
- keep completed-match replay final-hash reconstruction in the later replay/rollback/recovery milestone
- update the contract/spec test that currently requires the old M1 "Golden replay reconstructs final hash" wording

## Out of Scope

- engine behavior changes
- CLI behavior changes
- replay fixture changes or expected hash updates
- database schema or migration changes
- production ReplayLog, ReplayHeader, replay storage, rollback, recovery, version migration, or replay viewer contracts
- moving completed-match production replay reconstruction out of the later replay/rollback/recovery milestone

## Allowed Touch Points

<!-- prettier-ignore -->
- specs/12-roadmap.md
- specs/15-implementation-kickoff.md
- tests/contracts/spec-authority-gates.test.mjs
- stories/approved/SPEC-001-clarify-m1-replay-scope.yaml
- agent-packets/SPEC-001.md
- agent-packets/active.json

## Constraints

- do not change engine behavior, CLI behavior, replay fixtures, database schema, or production replay contracts
- stay within allowed_touch_points
- do not broaden Milestone 1 into server, client, Poneglyph live adapter, Redis, ranked, broad card pool, or production replay systems
- story-review must pass before moving the story to approved or implementation begins
- must pass corepack pnpm run test:contracts
- must pass corepack pnpm run typecheck
- must pass corepack pnpm run verify
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- update tests/contracts/spec-authority-gates.test.mjs to require the new local deterministic CLI smoke hash reconstruction language
- update tests/contracts/spec-authority-gates.test.mjs to assert the old "Golden replay reconstructs final hash" wording is absent from Milestone 1 gate text
- update tests/contracts/spec-authority-gates.test.mjs to assert Milestone 6 still requires completed-match replay final hash matching
- corepack pnpm run test:contracts
- corepack pnpm run typecheck
- corepack pnpm run verify

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- Milestone 1 roadmap and kickoff text require deterministic CLI command/decision script smoke reconstruction from fixture boot with script-defined state-hash checkpoints and final hash, without requiring production ReplayCheckpoint artifacts
- Milestone 1 text no longer requires production-style golden replay reconstruction or completed-match replay reconstruction
- Milestone 1 non-scope explicitly excludes production ReplayLog, ReplayHeader, persisted replay storage, rollback, recovery, version migration, and replay viewer requirements
- Milestone 6 continues to require completed-match replay final hash matching
- contract/spec tests enforce the new M1 replay-scope wording and reject the old golden replay wording as an M1 gate

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
