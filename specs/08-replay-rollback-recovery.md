---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "08-replay-rollback-recovery"
doc_title: "Replay Rollback Recovery"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# Replay, Rollback, and Recovery

<!-- SECTION_REF: 08-replay-rollback-recovery.s001 -->

Section Ref: `08-replay-rollback-recovery.s001`

## Replay goals

<!-- SECTION_REF: 08-replay-rollback-recovery.s002 -->

Section Ref: `08-replay-rollback-recovery.s002`

A replay must be able to reconstruct a match deterministically from:

- Initial deck lists and initial state.
- RNG algorithm plus either the actual revealed seed or a mandatory initial authoritative snapshot. A seed commitment alone is not reconstructable.
- Engine/rules/card/effect/banlist versions.
- Ordered player actions.
- Ordered decision responses.
- Checkpoint hashes and optional snapshots.

Do not assume the current deployed engine can replay old matches without version metadata.

## Replay header

<!-- SECTION_REF: 08-replay-rollback-recovery.s003 -->

Section Ref: `08-replay-rollback-recovery.s003`

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

## Replay log

<!-- SECTION_REF: 08-replay-rollback-recovery.s004 -->

Section Ref: `08-replay-rollback-recovery.s004`

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

## Card manifest snapshot

<!-- SECTION_REF: 08-replay-rollback-recovery.s005 -->

Section Ref: `08-replay-rollback-recovery.s005`

Every replay stores `manifestHash` and a manifest snapshot or reference that can reconstruct the exact `MatchCardManifest` used at match creation. Live Poneglyph data, current card overlays, and current banlists must not be consulted during deterministic replay except to locate the pinned historical artifact.

The manifest snapshot includes:

- normalized card metadata,
- variant keys used for display,
- source text hashes,
- behavior hashes,
- support status,
- effect definition version,
- custom handler version,
- banlist/format version.

## Checkpoints

<!-- SECTION_REF: 08-replay-rollback-recovery.s006 -->

Section Ref: `08-replay-rollback-recovery.s006`

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

## Replay drift

<!-- SECTION_REF: 08-replay-rollback-recovery.s007 -->

Section Ref: `08-replay-rollback-recovery.s007`

Replay drift occurs when replaying old action logs under current code produces different hashes.

CI should run golden replays against the correct version bundle. When drift occurs:

1. Confirm whether the rules change is intentional.
2. If intentional, pin old replays to old engine/effect version or write a migration.
3. If unintentional, fix regression.
4. Update checkpoint hashes only with review.

## Rollback classes

<!-- SECTION_REF: 08-replay-rollback-recovery.s008 -->

Section Ref: `08-replay-rollback-recovery.s008`

Rollback is not just state. It is information.

```ts
interface HistoryEntry {
  index: number;
  stateSeq: number;
  actionSeq: number;
  stateHash: string;
  action?: Action;
  revealedInfo: RevealedInfoEvent[];
  rollbackClass: RollbackClass;
}

type RollbackClass =
  | "safe"
  | "hidden-info-exposed"
  | "judge-only"
  | "not-rollbackable";
```

### Safe

<!-- SECTION_REF: 08-replay-rollback-recovery.s009 -->

Section Ref: `08-replay-rollback-recovery.s009`

No hidden information was revealed after the target point. Unranked/custom mutual rollback may allow this.

### Hidden-info-exposed

<!-- SECTION_REF: 08-replay-rollback-recovery.s010 -->

Section Ref: `08-replay-rollback-recovery.s010`

A player saw card(s) they would not know after rollback:

- Life trigger revealed.
- Deck search/look occurred.
- Hand reveal occurred.
- Randomized order was exposed.
- Face-down life/deck information became known.

Casual matches may allow by consent. Ranked should not allow player-initiated rollback past this point.

### Judge-only

<!-- SECTION_REF: 08-replay-rollback-recovery.s011 -->

Section Ref: `08-replay-rollback-recovery.s011`

Competitive correction may require rollback despite exposed information. Only judge/admin can initiate and it must be logged.

### Not rollbackable

<!-- SECTION_REF: 08-replay-rollback-recovery.s012 -->

Section Ref: `08-replay-rollback-recovery.s012`

Examples:

- Match already finalized and rating applied.
- Replay/export already published under immutable policy.
- Engine cannot reconstruct target state.
- Required version bundle missing.

## Rollback modes

<!-- SECTION_REF: 08-replay-rollback-recovery.s013 -->

Section Ref: `08-replay-rollback-recovery.s013`

```ts
type RollbackMode =
  | { type: "mutual"; requestedBy: PlayerId; targetIndex: number }
  | { type: "judge"; adminId: PlayerId; targetIndex: number; reason: string }
  | {
      type: "auto";
      targetIndex: number;
      reason: "invariantViolation" | "recoverableCrash";
    };
```

## Rollback flow

<!-- SECTION_REF: 08-replay-rollback-recovery.s014 -->

Section Ref: `08-replay-rollback-recovery.s014`

1. Validate target exists.
2. Compute rollback class.
3. Check match mode policy.
4. If mutual, request opponent consent.
5. Freeze actions during consent.
6. Set current state to target snapshot.
7. Truncate or branch history after target.
8. Record rollback event.
9. Emit new filtered views.

Branching is recommended for audit: keep discarded future history marked inactive rather than deleting it from storage.

## Rollback record

<!-- SECTION_REF: 08-replay-rollback-recovery.s015 -->

Section Ref: `08-replay-rollback-recovery.s015`

```ts
interface RollbackRecord {
  id: string;
  matchId: MatchId;
  mode: RollbackMode;
  fromStateSeq: number;
  toStateSeq: number;
  rollbackClass: RollbackClass;
  requestedBy?: PlayerId;
  approvedBy?: PlayerId[];
  adminId?: PlayerId;
  reason: string;
  createdAt: string;
}
```

## Crash recovery modes

<!-- SECTION_REF: 08-replay-rollback-recovery.s016 -->

Section Ref: `08-replay-rollback-recovery.s016`

Do not blindly replay through a crashing action. If the action caused an engine crash, replaying it may crash again.

```ts
type RecoveryMode =
  | "replay-through"
  | "rollback-to-pre-action"
  | "freeze-for-review"
  | "no-contest";
```

### replay-through

<!-- SECTION_REF: 08-replay-rollback-recovery.s017 -->

Section Ref: `08-replay-rollback-recovery.s017`

Use when crash was infrastructure-related and the action log is safe.

### rollback-to-pre-action

<!-- SECTION_REF: 08-replay-rollback-recovery.s018 -->

Section Ref: `08-replay-rollback-recovery.s018`

Use when the last action may have crashed but previous state is clean.

### freeze-for-review

<!-- SECTION_REF: 08-replay-rollback-recovery.s019 -->

Section Ref: `08-replay-rollback-recovery.s019`

Use when hidden-info exposure, effect runtime error, or invariant violation makes automatic continuation unsafe.

### no-contest

<!-- SECTION_REF: 08-replay-rollback-recovery.s020 -->

Section Ref: `08-replay-rollback-recovery.s020`

Use when match integrity cannot be preserved.

## Match-level crash boundary

<!-- SECTION_REF: 08-replay-rollback-recovery.s021 -->

Section Ref: `08-replay-rollback-recovery.s021`

If one match fails:

1. Catch at match boundary.
2. Freeze match.
3. Record error, last action, last state hash, queue state, and version set.
4. Notify players.
5. Attempt recovery mode selection.
6. Never let one match crash the whole server.

## Process crash persistence

<!-- SECTION_REF: 08-replay-rollback-recovery.s022 -->

Section Ref: `08-replay-rollback-recovery.s022`

Persist to Redis:

```text
match:{matchId}:state       last clean snapshot
match:{matchId}:meta        players, config, owner instance, timers
match:{matchId}:actions     actions since snapshot
match:{matchId}:decisions   decision responses since snapshot
match:{matchId}:locks       recovery lock/owner
```

Recommended snapshot points:

- Start of match.
- Start of each turn.
- Before actions that enter complex effect resolution, if cheap.
- After a successful rollback.

The original plan used turn boundaries; that remains a good baseline. Add pre-action snapshots for high-risk interactions once performance is measured.

## Recovery flow after process restart

<!-- SECTION_REF: 08-replay-rollback-recovery.s023 -->

Section Ref: `08-replay-rollback-recovery.s023`

1. Scan Redis for active match metadata.
2. Acquire recovery lock per match.
3. Load last clean snapshot.
4. Load action/decision log since snapshot.
5. Replay in recovery mode.
6. Verify checkpoint hash if available.
7. Reopen room and send filtered views.
8. If replay fails, freeze match for review.

## Redis failure

<!-- SECTION_REF: 08-replay-rollback-recovery.s024 -->

Section Ref: `08-replay-rollback-recovery.s024`

If Redis is unavailable, active matches cannot be reliably recovered after process crash. Mitigations:

- Enable Redis persistence.
- Use managed Redis or replication when public.
- Surface clear maintenance/match-risk state if Redis health fails.
- Refuse ranked queue if persistence is unavailable.

## Replay storage

<!-- SECTION_REF: 08-replay-rollback-recovery.s025 -->

Section Ref: `08-replay-rollback-recovery.s025`

Completed matches write to Postgres:

- Match metadata.
- Replay header.
- Compressed action/decision log.
- Final state hash and optional final snapshot.
- Error/rollback/report links.

Large snapshots can move to object storage later, referenced by DB rows.

## Source-preserved crash and reconnect behavior

<!-- SECTION_REF: 08-replay-rollback-recovery.s026 -->

Section Ref: `08-replay-rollback-recovery.s026`

The original plan distinguishes match-level failures from process-level failures. This distinction remains important.

### Match-level isolation

<!-- SECTION_REF: 08-replay-rollback-recovery.s027 -->

Section Ref: `08-replay-rollback-recovery.s027`

Each active match runs inside its own error boundary. If a single match hits an unhandled edge case, corrupt state, or infinite effect loop, only that match is affected.

When one match crashes:

1. Catch the error at the match boundary, not the process boundary.
2. Mark the match as errored and frozen.
3. Reject all further player actions.
4. Send both players a `match_error` / `matchError` event with a human-readable message.
5. Show an error screen with a Report button that attaches match ID, last known state hash, and triggering action.
6. Preserve full state history and action log.
7. Write the match as `errored`, not silently abandoned.
8. Attempt auto-rollback only if the last clean state is safe and hidden-information policy allows it.

### Player-facing error event

<!-- SECTION_REF: 08-replay-rollback-recovery.s028 -->

Section Ref: `08-replay-rollback-recovery.s028`

```ts
interface MatchErrorMessage {
  type: "matchError";
  matchId: MatchId;
  message: string;
  reportToken: string;
  lastSafeStateSeq?: number;
  recoveryOffered?: boolean;
}
```

The client should never silently dump the player to lobby after a match error.

### Process-level crash recovery

<!-- SECTION_REF: 08-replay-rollback-recovery.s029 -->

Section Ref: `08-replay-rollback-recovery.s029`

The original plan persisted these Redis keys at turn boundaries and appended actions since the last snapshot. This version preserves that baseline and adds decisions/recovery locks.

```text
match:{matchId}:state       JSON-serialized last clean GameState snapshot
match:{matchId}:meta        player IDs, start time, turn number, spectator policy, lobby config
match:{matchId}:actions     ordered actions since last clean snapshot
match:{matchId}:decisions   ordered decision responses since last clean snapshot
match:{matchId}:locks       recovery lock / owner instance
```

Default TTL from the original plan: 2 hours for active-match recovery records. Public/ranked deployment may choose longer TTLs. Ranked disconnect forfeits and ladder/discipline outcomes must be persisted outside expiring Redis match state.

### Recovery flow

<!-- SECTION_REF: 08-replay-rollback-recovery.s030 -->

Section Ref: `08-replay-rollback-recovery.s030`

On match-server start or restart:

1. Scan Redis for `match:*:meta` keys.
2. For each active match, acquire a recovery lock.
3. Load the last clean snapshot.
4. Load action and decision logs since the snapshot.
5. Replay through `applyAction()` / `resumeDecision()` according to selected `RecoveryMode`.
6. Verify checkpoint hashes when available.
7. Reopen WebSocket rooms.
8. Send current filtered views to players.
9. If recovery fails, freeze the match for review or record no-contest.

### Client reconnection flow

<!-- SECTION_REF: 08-replay-rollback-recovery.s031 -->

Section Ref: `08-replay-rollback-recovery.s031`

When a player's WebSocket drops:

1. Client enters a reconnect loop with `matchId`, `playerId`, and session token.
2. Server checks in-memory match first.
3. If missing, server attempts Redis recovery.
4. If found, server sends current filtered `PlayerView` and pending decision if applicable.
5. If not found, server sends `match_lost` / `matchLost` and records the match as abandoned or errored according to context.

```ts
interface MatchLostMessage {
  type: "matchLost";
  matchId: MatchId;
  reason: "notRecoverable" | "expired" | "infrastructureFailure";
}
```

The client should show a reconnecting overlay during this process. A configurable timeout determines when a disconnected player forfeits.

### Spectator reconnection

<!-- SECTION_REF: 08-replay-rollback-recovery.s032 -->

Section Ref: `08-replay-rollback-recovery.s032`

Spectators reconnect by resubscribing to the match room with their allowed spectator policy. If they are using delayed viewing, the delay buffer may hide short server restarts.

### Multi-server recovery

<!-- SECTION_REF: 08-replay-rollback-recovery.s033 -->

Section Ref: `08-replay-rollback-recovery.s033`

Early solo phase can run one match-server instance, but the Redis persistence model should still be implemented so deploys and crashes are recoverable.

When horizontally scaled:

- Route both players for a match to the same server instance via sticky routing by `matchId`.
- Store active match ownership in Redis.
- If an owner heartbeat expires, another instance acquires the recovery lock and restores the match.

## Failure-mode table

<!-- SECTION_REF: 08-replay-rollback-recovery.s034 -->

Section Ref: `08-replay-rollback-recovery.s034`

| Scenario                                       | Impact                                                                     | Recovery                                                                                  |
| ---------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Single match crashes from engine bug           | Only that match affected                                                   | Error boundary freezes match; report button; rollback to last safe state if legal.        |
| Process crash mid-turn                         | State since snapshot is in action/decision log                             | Replay from last clean snapshot.                                                          |
| Process crash during effect resolution         | Action log may contain triggering action but not intermediate effect state | Use recovery mode; do not blindly replay if the same action may crash again.              |
| Redis unavailable                              | No reliable process-crash recovery                                         | Alert; refuse ranked queue if persistence is required; use Redis persistence/replication. |
| Snapshot succeeded but action-log write failed | May roll back to last turn boundary                                        | Acceptable for unranked/custom; ranked should flag/freeze.                                |
| Both players disconnect                        | Server holds match until timeout                                           | If server also crashes, Redis snapshot allows recovery.                                   |

## v2 correction to original crash replay assumption

<!-- SECTION_REF: 08-replay-rollback-recovery.s035 -->

Section Ref: `08-replay-rollback-recovery.s035`

The original plan said that if a server crashes during effect resolution, replaying the triggering action should reproduce the same effect chain. That is true for infrastructure crashes, but unsafe if the action caused the crash. This spec therefore uses `RecoveryMode`:

- `replay-through` for infrastructure-only crash.
- `rollback-to-pre-action` when the last action may be the crash trigger.
- `freeze-for-review` when automatic continuation may corrupt match integrity.
- `no-contest` when a fair recovery is impossible.

## Full-information replay policy

<!-- SECTION_REF: 08-replay-rollback-recovery.s036 -->

Section Ref: `08-replay-rollback-recovery.s036`

Post-game replays are full-information artifacts. They may reveal deck order history, hands, private candidate sets, hidden-life identities, and other previously secret information needed to reconstruct the match exactly. This is intentional.

Live spectating remains delayed by spectator policy; replay visibility is not restricted once the replay artifact is produced.
