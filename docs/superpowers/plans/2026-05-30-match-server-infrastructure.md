# Match Server Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first production-shaped match-server infrastructure spine: authoritative match sessions, sequence-aware idempotent client envelopes, active-match persistence boundaries, and restart recovery hooks.

**Architecture:** The match server owns sessions, transport, sequencing, persistence, recovery, and filtered delivery. `engine-core` remains the only gameplay authority. This first slice wraps the current dev server action shapes (`submitAction`, `respondToDecision`, `requestRollback`, `cancelRollback`) instead of inventing a raw engine `Action` transport; later production protocol work can swap the payload adapter without changing the session/persistence spine.

**Tech Stack:** TypeScript, Node, Vitest, existing `@optcg/types`, existing `@optcg/engine-core`, existing match-server WebSocket code, in-memory persistence for tests/dev, Redis persistence behind an adapter contract.

---

## Spec Anchors

- `specs/01-system-architecture.md` sections `s009`, `s013`, `s017`, `s018`, `s019`, `s025`
- `specs/07-match-server-protocol.md` sections `s002` through `s006`
- `specs/08-replay-rollback-recovery.md` sections `s022` through `s031`
- `specs/29-game-types-queues-and-lobbies.md` sections `s004` through `s010`
- `docs/code-standard.md` package boundary, hidden-info, and deterministic-engine guidance

## Non-Goals

- No account system.
- No ranked queue implementation.
- No Postgres completed replay storage.
- No production lobby password hashing.
- No client UI redesign.
- No card or engine gameplay behavior changes.
- No raw `GameState` in client-visible results or WebSocket messages.

## Required Invariants

- `GameState` is server-only. It may appear in active persistence snapshots and recovery internals, never in `SessionActionResult`, client transport messages, `PlayerView`, or `DevMatchSnapshot` payloads.
- The session runtime wraps current dev request shapes:
  - `submitAction`: `playerId`, `actionIndex`, optional `expectedStateSeq`
  - `respondToDecision`: `playerId`, `decisionId`, `response`
  - `requestRollback`: `playerId`, `rollbackPointId`, optional `expectedStateSeq`
  - `cancelRollback`: `playerId`, optional `expectedStateSeq`
- The action envelope is idempotent by `(matchId, playerId, clientActionId)`.
- Duplicate envelopes with the same canonical request hash return the stored result and do not re-apply.
- Duplicate envelopes with a different canonical request hash reject with `idempotencyConflict`.
- Sequence mismatches reject before request application.
- Every live client envelope must include `expectedStateSeq`, including `respondToDecision`; missing sequence is invalid rather than defaulted.
- Canonical request hashing omits `undefined` object properties, rejects unsupported non-JSON values, and must match after browser JSON serialization and server JSON parsing.
- Runtime logs/metrics must distinguish accepted and rejected actions, include action processing timing, and carry `matchId`, `stateSeq`, and `actionSeq` when available.
- The current dev snapshot/catalog path remains filtered and is the only client-facing state delivery in this slice.
- Persistence must model both action records and decision-response records; recovery can be shallow initially, but typed seams for locks, decisions, and rehydration must exist.
- First-player setup is session orchestration, not engine policy. Game one randomly chooses which player is allowed to choose first/second. A rematch gives that choice to the previous game's loser. The engine receives only the resolved `firstPlayerId` after the chooser submits `goFirst` or `goSecond`.

## File Structure

Create:

- `packages/match-server/src/session-types.ts`
  - Session metadata, dev request union, envelope, filtered result, stored record, persistence interface.
- `packages/match-server/src/canonical-json.ts`
  - Stable JSON stringifier used for client/server request hashing.
- `packages/match-server/src/action-envelope.ts`
  - Request hashing, idempotency keys, stale/future validation helpers.
- `packages/match-server/src/match-session.ts`
  - `MatchSessionRuntime` wrapping current local dev request handlers.
- `packages/match-server/src/match-session-store.ts`
  - In-memory active session store.
- `packages/match-server/src/match-persistence.ts`
  - Persistence interface test double and in-memory adapter.
- `packages/match-server/src/match-recovery.ts`
  - Active match recovery orchestration shell with lock/freeze seams.
- `packages/match-server/src/session-service.ts`
  - High-level service used by dev HTTP/WebSocket server.
- `packages/match-server/src/redis-match-persistence.ts`
  - Redis adapter using scan-style active match discovery and owner locks.

Modify:

- `packages/match-server/src/dev-http-server.ts`
  - Route socket requests through `SessionService`.
- `packages/match-server/src/dev-socket-envelope.ts`
  - Add sequence/hash fields to current socket envelopes.
- `packages/match-server/src/index.ts`
  - Export infrastructure APIs that are safe for server-side consumers.
- `packages/client/src/transport.ts`
  - Add envelope metadata to live request inputs/results.
- `packages/client/src/transport-ws.ts`
  - Generate `clientActionId`, `expectedStateSeq`, and canonical request hash.
- `packages/client/src/controller.ts`
  - Pass the current snapshot sequence and pending decision id where applicable.

---

## Task 1: Session Types And Canonical Request Hashing

**Files:**

- Create: `packages/match-server/src/session-types.ts`
- Create: `packages/match-server/src/canonical-json.ts`
- Create: `packages/match-server/src/action-envelope.ts`
- Test: `packages/match-server/src/action-envelope.test.ts`

- [ ] **Step 1: Write failing hash/idempotency tests**

```ts
import { describe, expect, test } from "vitest";
import type { MatchId, PlayerId } from "@optcg/types";
import { canonicalJson } from "./canonical-json.js";
import { idempotencyKey, requestHash } from "./action-envelope.js";
import type { SessionActionRequest } from "./session-types.js";

describe("session action envelopes", () => {
  test("canonical JSON is stable for object key order", () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 }));
  });

  test("canonical JSON omits undefined object fields like JSON transport", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
    expect(canonicalJson({ nested: { b: undefined, a: [2, 1] } })).toBe(
      '{"nested":{"a":[2,1]}}',
    );
  });

  test("canonical JSON rejects unsupported non-JSON values", () => {
    expect(() => canonicalJson(undefined)).toThrow(TypeError);
    expect(() => canonicalJson({ value: () => undefined })).toThrow(TypeError);
    expect(() => canonicalJson({ value: Symbol("x") })).toThrow(TypeError);
    expect(() => canonicalJson({ value: 1n })).toThrow(TypeError);
  });

  test("request hash is based on the current dev request payload only", () => {
    const first: SessionActionRequest = {
      type: "submitAction",
      playerId: "p1" as PlayerId,
      actionIndex: 3,
      expectedStateSeq: 8,
    };
    const second: SessionActionRequest = {
      expectedStateSeq: 8,
      actionIndex: 3,
      playerId: "p1" as PlayerId,
      type: "submitAction",
    };

    expect(requestHash(first)).toBe(requestHash(second));
  });

  test("idempotency key is match player and client action id", () => {
    expect(
      idempotencyKey({
        matchId: "match-1" as MatchId,
        playerId: "p1" as PlayerId,
        clientActionId: "client-action-1",
      }),
    ).toBe("match-1:p1:client-action-1");
  });
});
```

- [ ] **Step 2: Run the failing test**

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/action-envelope.test.ts
```

Expected: FAIL because the new files do not exist.

- [ ] **Step 3: Implement `session-types.ts`**

Use current dev request shapes and protocol-shaped metadata. `SessionActionResult` must not contain `GameState`.

```ts
import type {
  DecisionId,
  DecisionResponse,
  GameState,
  MatchCardManifest,
  MatchId,
  PlayerId,
} from "@optcg/types";
import type { DevMatchSnapshot } from "./dev-snapshot-types.js";

export type GameType = "ranked" | "unranked" | "custom" | "dev";
export type SpectatorPolicyMode = "disabled" | "live-filtered";
export type RollbackPolicyMode =
  | "disabled"
  | "mutual-consent"
  | "host-consent"
  | "admin-only";

export type DisconnectPolicyMode =
  | "dev-none"
  | "casual-timeout"
  | "ranked-forfeit";

export type FirstPlayerChoiceSource =
  | "game-one-random-chooser"
  | "rematch-previous-loser";

export type FirstPlayerChoiceValue = "goFirst" | "goSecond";

export interface FirstPlayerChoiceState {
  readonly source: FirstPlayerChoiceSource;
  readonly chooserPlayerId: PlayerId;
  readonly choice?: FirstPlayerChoiceValue;
  readonly resolvedFirstPlayerId?: PlayerId;
  readonly rematchOfMatchId?: MatchId;
  readonly previousLoserId?: PlayerId;
}

export type MatchCreationSource =
  | { readonly type: "dev" }
  | {
      readonly type: "customLobby";
      readonly lobbyId: string;
      readonly lobbyConfigId: string;
    }
  | {
      readonly type: "queue";
      readonly ticketIds: readonly string[];
      readonly ladderId: string;
      readonly queueSnapshotId: string;
    };

export interface MatchSessionMetadata {
  readonly matchId: MatchId;
  readonly gameType: GameType;
  readonly formatId: string;
  readonly createdAt: string;
  readonly playerIds: readonly PlayerId[];
  readonly creationSource: MatchCreationSource;
  readonly disconnectPolicyMode: DisconnectPolicyMode;
  readonly rollbackPolicyMode: RollbackPolicyMode;
  readonly spectatorPolicyMode: SpectatorPolicyMode;
  readonly firstPlayerChoice: FirstPlayerChoiceState;
  readonly ownerInstanceId?: string;
}

export type SessionActionRequest =
  | {
      type: "submitAction";
      playerId: PlayerId;
      actionIndex: number;
      expectedStateSeq?: number;
    }
  | {
      type: "respondToDecision";
      playerId: PlayerId;
      decisionId: DecisionId;
      response: DecisionResponse;
    }
  | {
      type: "requestRollback";
      playerId: PlayerId;
      rollbackPointId: string;
      expectedStateSeq?: number;
    }
  | {
      type: "cancelRollback";
      playerId: PlayerId;
      expectedStateSeq?: number;
    };

export interface ClientActionEnvelope {
  protocolVersion: string;
  matchId: MatchId;
  playerId: PlayerId;
  clientActionId: string;
  expectedStateSeq: number;
  expectedDecisionId?: string;
  requestHash: string;
  sentAtClientTime?: string;
  request: SessionActionRequest;
}

export type ActionRejectionReason =
  | "staleState"
  | "futureState"
  | "idempotencyConflict"
  | "notYourTurn"
  | "illegalAction"
  | "pendingDecisionMismatch"
  | "rateLimited"
  | "matchFrozen"
  | "unsupportedCard"
  | "serverError";

export interface SessionActionResult {
  type: "actionResult";
  matchId: MatchId;
  clientActionId: string;
  accepted: boolean;
  stateSeq: number;
  actionSeq?: number;
  reason?: ActionRejectionReason;
  snapshot?: DevMatchSnapshot;
  errors: readonly string[];
}

export interface StoredSessionRecord {
  envelope: ClientActionEnvelope;
  result: SessionActionResult;
  recordedAt: string;
}

export interface MatchPersistenceSnapshot {
  metadata: MatchSessionMetadata;
  state: GameState;
  manifest: MatchCardManifest;
  actions: readonly StoredSessionRecord[];
  decisions: readonly StoredSessionRecord[];
}

export interface RecoveryLock {
  matchId: MatchId;
  ownerInstanceId: string;
  acquiredAt: string;
  expiresAt: string;
}

export interface MatchPersistence {
  saveSnapshot(input: MatchPersistenceSnapshot): Promise<void>;
  appendAction(input: {
    matchId: MatchId;
    record: StoredSessionRecord;
  }): Promise<void>;
  appendDecision(input: {
    matchId: MatchId;
    record: StoredSessionRecord;
  }): Promise<void>;
  loadSnapshot(matchId: MatchId): Promise<MatchPersistenceSnapshot | undefined>;
  listActiveMatchIds(): Promise<MatchId[]>;
  tryAcquireRecoveryLock(input: {
    matchId: MatchId;
    ownerInstanceId: string;
    now: string;
    ttlMs: number;
  }): Promise<RecoveryLock | undefined>;
  releaseRecoveryLock(input: {
    matchId: MatchId;
    ownerInstanceId: string;
  }): Promise<void>;
  freezeMatch(input: {
    matchId: MatchId;
    reason: string;
    frozenAt: string;
  }): Promise<void>;
}
```

- [ ] **Step 4: Implement stable canonical JSON and hashing**

```ts
export const canonicalJson = (value: unknown): string => {
  if (value === undefined) {
    throw new TypeError("Cannot canonicalize undefined as a JSON value.");
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  if (
    typeof value === "function" ||
    typeof value === "symbol" ||
    typeof value === "bigint" ||
    (typeof value === "number" && !Number.isFinite(value))
  ) {
    throw new TypeError("Cannot canonicalize unsupported non-JSON value.");
  }
  return JSON.stringify(value);
};
```

```ts
import { createHash } from "node:crypto";
import type { MatchId, PlayerId } from "@optcg/types";
import { canonicalJson } from "./canonical-json.js";
import type { SessionActionRequest } from "./session-types.js";

export const requestHash = (request: SessionActionRequest): string =>
  createHash("sha256").update(canonicalJson(request)).digest("hex");

export const idempotencyKey = (input: {
  matchId: MatchId;
  playerId: PlayerId;
  clientActionId: string;
}): string =>
  `${String(input.matchId)}:${String(input.playerId)}:${input.clientActionId}`;
```

- [ ] **Step 5: Run the test**

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/action-envelope.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add packages/match-server/src/session-types.ts packages/match-server/src/canonical-json.ts packages/match-server/src/action-envelope.ts packages/match-server/src/action-envelope.test.ts
git commit -m "Add session envelope hashing types"
```

---

## Task 2: Idempotent Session Runtime Around Current Dev Requests

**Files:**

- Create: `packages/match-server/src/match-session.ts`
- Test: `packages/match-server/src/match-session.test.ts`
- Modify: `packages/match-server/src/local-match.ts` only if additional type exports are required.

- [ ] **Step 1: Write failing runtime tests**

Use a real `LocalDevMatch` and the current `applyLocalDevAction` style. Do not use raw engine `Action`.

```ts
import { describe, expect, test } from "vitest";
import type { MatchId, PlayerId } from "@optcg/types";
import { requestHash } from "./action-envelope.js";
import { createMatchSessionRuntime } from "./match-session.js";
import { createLocalDevMatch } from "./local-match.js";
import type { SessionActionRequest } from "./session-types.js";

const matchId = "match-1" as MatchId;
const p1 = "p1" as PlayerId;

const submitRequest = (
  stateSeq: number,
  actionIndex = 0,
): SessionActionRequest => ({
  type: "submitAction",
  playerId: p1,
  actionIndex,
  expectedStateSeq: stateSeq,
});

const envelope = (
  request: SessionActionRequest,
  expectedStateSeq: number,
  clientActionId = "client-action-1",
) => ({
  protocolVersion: "dev",
  matchId,
  playerId: request.playerId,
  clientActionId,
  expectedStateSeq,
  requestHash: requestHash(request),
  request,
});

describe("match session runtime", () => {
  test("returns the same result for duplicate client action id and hash", () => {
    const local = createLocalDevMatch({ matchId });
    const runtime = createMatchSessionRuntime({ local });
    const input = envelope(submitRequest(local.state.seq), local.state.seq);

    const first = runtime.applyEnvelope(input);
    const second = runtime.applyEnvelope(input);

    expect(second).toEqual(first);
  });

  test("rejects duplicate client action id with different request hash", () => {
    const local = createLocalDevMatch({ matchId });
    const runtime = createMatchSessionRuntime({ local });
    const input = envelope(submitRequest(local.state.seq), local.state.seq);
    runtime.applyEnvelope(input);

    const second = runtime.applyEnvelope({
      ...input,
      requestHash: "different",
    });

    expect(second.accepted).toBe(false);
    expect(second.reason).toBe("idempotencyConflict");
  });

  test("does not expose raw GameState in action results", () => {
    const local = createLocalDevMatch({ matchId });
    const runtime = createMatchSessionRuntime({ local });
    const result = runtime.applyEnvelope(
      envelope(submitRequest(local.state.seq), local.state.seq),
    );

    expect("state" in result).toBe(false);
    expect(result.snapshot?.players).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the failing test**

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/match-session.test.ts
```

Expected: FAIL because `match-session.ts` does not exist.

- [ ] **Step 3: Implement the runtime wrapper**

`createMatchSessionRuntime` should dispatch by `request.type`:

- `submitAction` -> `applyLocalDevAction(local, request)`
- `respondToDecision` -> `applyLocalDevDecision(local, request)`
- `requestRollback` -> `requestLocalDevRollback(local, request)`
- `cancelRollback` -> `cancelLocalDevRollback(local, request)`

The result must include `snapshot`, `errors`, `stateSeq`, and `actionSeq`; it must not include `GameState`.

- [ ] **Step 4: Add stale/future request tests**

Add tests that send `submitAction` envelopes with `expectedStateSeq` lower and higher than `local.state.seq`. The session runtime should reject before calling local application and should return `staleState` or `futureState`.

- [ ] **Step 5: Run runtime tests**

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/match-session.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add packages/match-server/src/match-session.ts packages/match-server/src/match-session.test.ts packages/match-server/src/local-match.ts
git commit -m "Add idempotent dev match session runtime"
```

---

## Task 3: Active Session Store

**Files:**

- Create: `packages/match-server/src/match-session-store.ts`
- Test: `packages/match-server/src/match-session-store.test.ts`

- [ ] **Step 1: Write failing store tests**

```ts
import { describe, expect, test } from "vitest";
import type { MatchId } from "@optcg/types";
import { createInMemoryMatchSessionStore } from "./match-session-store.js";

describe("in-memory match session store", () => {
  test("stores loads deletes and lists sessions by match id", () => {
    const store = createInMemoryMatchSessionStore<string>();

    store.set("match-1" as MatchId, "session");

    expect(store.get("match-1" as MatchId)).toBe("session");
    expect(store.listMatchIds()).toEqual(["match-1"]);
    store.delete("match-1" as MatchId);
    expect(store.get("match-1" as MatchId)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the failing test**

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/match-session-store.test.ts
```

Expected: FAIL because the store does not exist.

- [ ] **Step 3: Implement the store**

Create a generic in-memory store with `get`, `set`, `delete`, and `listMatchIds`.

- [ ] **Step 4: Run the test**

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/match-session-store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/match-server/src/match-session-store.ts packages/match-server/src/match-session-store.test.ts
git commit -m "Add active match session store"
```

---

## Task 4: Persistence Contract And In-Memory Adapter

**Files:**

- Create: `packages/match-server/src/match-persistence.ts`
- Test: `packages/match-server/src/match-persistence.test.ts`

- [ ] **Step 1: Write failing contract tests**

Tests must cover:

- saving/loading a server-only snapshot with `GameState`;
- preserving immutable match metadata by copying it on save/load so mutating the construction input after match start cannot change stored metadata;
- appending an action record;
- appending a decision record;
- listing active match ids;
- acquiring a recovery lock once;
- rejecting lock acquisition by another owner before expiry;
- freezing a match.

- [ ] **Step 2: Run the failing test**

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/match-persistence.test.ts
```

Expected: FAIL because persistence does not exist.

- [ ] **Step 3: Implement in-memory persistence**

Implement the full `MatchPersistence` interface from Task 1. Store actions and decisions separately. Store freeze records internally so tests can assert they were written through an exported test-only inspection function or a returned fake adapter helper.

- [ ] **Step 4: Run persistence tests**

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/match-persistence.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/match-server/src/match-persistence.ts packages/match-server/src/match-persistence.test.ts
git commit -m "Add active match persistence contract"
```

---

## Task 5: Persist Accepted Session Records

**Files:**

- Modify: `packages/match-server/src/match-session.ts`
- Test: `packages/match-server/src/match-session.test.ts`

- [ ] **Step 1: Add failing persistence tests**

Add tests proving:

- accepted `submitAction` records are appended through `appendAction`;
- accepted `respondToDecision` records are appended through `appendDecision`;
- rejected duplicate/stale/future requests are not appended;
- saved snapshots include metadata, manifest, state, actions, and decisions.

- [ ] **Step 2: Run the failing tests**

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/match-session.test.ts
```

Expected: FAIL because runtime persistence is not wired.

- [ ] **Step 3: Wire persistence into the runtime**

Add optional `metadata` and `persistence` constructor fields. Add:

- `saveSnapshot(): Promise<void>`
- `flushPersistence(): Promise<void>`
- pending record queues split by action versus decision request type.

Only append records after successful request application. Keep raw `GameState` inside `saveSnapshot`; do not put it in `SessionActionResult`.

- [ ] **Step 4: Run runtime tests**

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/match-session.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/match-server/src/match-session.ts packages/match-server/src/match-session.test.ts
git commit -m "Persist accepted match session records"
```

---

## Task 6: Recovery Orchestration With Lock And Freeze Seams

**Files:**

- Create: `packages/match-server/src/match-recovery.ts`
- Test: `packages/match-server/src/match-recovery.test.ts`

- [ ] **Step 1: Write failing recovery tests**

Tests must cover:

- empty persistence returns no recovered matches;
- a listed match with no snapshot calls `freezeMatch`;
- lock acquisition failure skips the match without freezing;
- a valid snapshot returns a recovered summary including `matchId`, `stateSeq`, action count, and decision count.

Use a fake `MatchPersistence` in the missing-snapshot test whose `listActiveMatchIds()` returns a match id and whose `loadSnapshot()` returns `undefined`.

- [ ] **Step 2: Run the failing test**

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/match-recovery.test.ts
```

Expected: FAIL because recovery does not exist.

- [ ] **Step 3: Implement recovery shell**

`recoverActiveMatches` must:

1. call `listActiveMatchIds`;
2. call `tryAcquireRecoveryLock` per match;
3. load the snapshot;
4. freeze if snapshot is missing;
5. return recovered summaries for valid snapshots;
6. release the lock after successful shallow recovery.

Do not implement full deterministic replay in this task. The returned summary must include enough data for later room rehydration.

- [ ] **Step 4: Run recovery tests**

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/match-recovery.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/match-server/src/match-recovery.ts packages/match-server/src/match-recovery.test.ts
git commit -m "Add active match recovery orchestration"
```

---

## Task 7: Route Dev WebSocket Through Session Service

**Files:**

- Create: `packages/match-server/src/session-service.ts`
- Modify: `packages/match-server/src/dev-socket-envelope.ts`
- Modify: `packages/match-server/src/dev-http-server.ts`
- Test: `packages/match-server/src/dev-http-server.test.ts`

- [ ] **Step 1: Add failing dev server tests**

Tests must prove:

- duplicate `clientActionId` with the same request hash returns the same result and does not apply twice;
- duplicate `clientActionId` with a different request hash rejects;
- accepted result messages contain `snapshot`/existing filtered sync data and do not contain raw `state`;
- `respondToDecision`, `requestRollback`, and `cancelRollback` still work through the new service.
- game-one match creation stores a `firstPlayerChoice` whose chooser was selected by server RNG, not by a client-provided `firstPlayerId`;
- only the stored chooser can answer the first-player setup decision;
- choosing `goFirst` resolves `firstPlayerId` to the chooser, while choosing `goSecond` resolves it to the other player;
- engine/local match initialization receives the resolved `firstPlayerId` only after the setup choice is complete;
- rematch creation stores `firstPlayerChoice.source: "rematch-previous-loser"` and gives the setup decision to the previous game's loser;
- rematch creation with no single previous loser fails closed unless a later explicit session policy adds a no-contest fallback.

- [ ] **Step 2: Run dev server tests**

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/dev-http-server.test.ts
```

Expected: FAIL because the dev server does not route through the session service.

- [ ] **Step 3: Extend socket envelope validation**

`DevSocketEnvelope` keeps its current four `type` variants and adds:

- `requestHash: string`
- `expectedStateSeq: number`
- optional `expectedDecisionId: string`
- optional `sentAtClientTime: string`

Do not replace current `actionIndex` or `decisionId` payloads with raw `Action`.
Reject any socket request that is missing `clientActionId`, `requestHash`, or
`expectedStateSeq`. For `respondToDecision`, also validate
`expectedDecisionId` against the current pending decision id before applying the
response.

- [ ] **Step 4: Implement `SessionService`**

The service owns:

- active session store;
- register local dev match with complete `MatchSessionMetadata`;
- first-player setup orchestration before engine start:
  - for game one, use server RNG to choose the player who receives the first/second setup decision;
  - for rematches, use the previous game's loser as the chooser;
  - accept only `goFirst` or `goSecond` from that chooser;
  - resolve and persist concrete `firstPlayerId` before constructing the engine/local match;
  - reject non-chooser setup responses and no-loser rematch setup without mutating match state;
- apply envelope;
- verify `requestHash` against `requestHash(envelope.request)`;
- flush persistence after accepted requests.

- [ ] **Step 5: Wire `dev-http-server.ts`**

When a match is created, register it with metadata:

- `gameType: "dev"`
- `formatId: "dev"`
- `creationSource: { type: "dev" }`
- `disconnectPolicyMode: "dev-none"`
- rollback and spectator policies matching current dev behavior.
- `firstPlayerChoice` with `source: "game-one-random-chooser"` and a server-selected `chooserPlayerId`.

After accepted requests, continue broadcasting existing filtered snapshots and card catalogs.

- [ ] **Step 6: Run dev server tests**

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/dev-http-server.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add packages/match-server/src/session-service.ts packages/match-server/src/dev-socket-envelope.ts packages/match-server/src/dev-http-server.ts packages/match-server/src/dev-http-server.test.ts
git commit -m "Route dev websocket through session service"
```

---

## Task 8: Client WebSocket Envelope Metadata

**Files:**

- Modify: `packages/client/src/transport.ts`
- Modify: `packages/client/src/transport-ws.ts`
- Modify: `packages/client/src/controller.ts`
- Test: `packages/client/src/transport-ws.test.ts`
- Test: `packages/client/src/controller.test.ts`

- [ ] **Step 1: Add failing client transport tests**

Tests must prove each live request type sends:

- `clientActionId`;
- current `expectedStateSeq` as a required field;
- `expectedDecisionId` for decision responses;
- stable `requestHash`;
- server/browser hash parity after client payload JSON serialization and server JSON parsing, including omitted versus explicit `undefined` fields;
- no raw `GameState`.

- [ ] **Step 2: Run client tests**

```powershell
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/transport-ws.test.ts packages/client/src/controller.test.ts
```

Expected: FAIL because the client does not send all envelope metadata yet.

- [ ] **Step 3: Update transport/controller**

Use a browser-safe canonical hash equivalent to the server `canonicalJson` behavior in production client transport code and tests. If sharing the exact helper would violate package boundaries, duplicate the small stable stringifier in client transport code and its tests, and document that production protocol should move it to a shared package later.

Controller calls must pass the current snapshot sequence for every live request. Decision responses should pass the current pending decision id as `expectedDecisionId`.

- [ ] **Step 4: Run client tests**

```powershell
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/transport-ws.test.ts packages/client/src/controller.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/client/src/transport.ts packages/client/src/transport-ws.ts packages/client/src/controller.ts packages/client/src/transport-ws.test.ts packages/client/src/controller.test.ts
git commit -m "Send idempotent websocket request envelopes"
```

---

## Task 9: Redis Active Match Persistence Adapter

**Files:**

- Create: `packages/match-server/src/redis-match-persistence.ts`
- Test: `packages/match-server/src/redis-match-persistence.test.ts`
- Modify: `packages/match-server/package.json` and lockfile only if a Redis dependency is required.

- [ ] **Step 1: Write fake-client Redis adapter tests**

Tests must cover:

- `saveSnapshot` writes `state`, `meta`, and `manifest`;
- `appendAction` writes to `match:{matchId}:actions`;
- `appendDecision` writes to `match:{matchId}:decisions`;
- `loadSnapshot` loads state/meta/manifest/actions/decisions;
- `listActiveMatchIds` uses scan-style iteration, not `KEYS`;
- `tryAcquireRecoveryLock` uses an atomic owner lock with TTL (`SET NX PX` or an equivalent single atomic operation);
- `freezeMatch` writes lock/freeze metadata.

- [ ] **Step 2: Run Redis tests**

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/redis-match-persistence.test.ts
```

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement adapter behind `RedisLike`**

Define a narrow `RedisLike` interface with only the operations required. The interface must model scan iteration and atomic `set` with `NX`/`PX`-style options or an equivalent single atomic lock operation. Do not call Redis `KEYS` in production code.

Use spec-shaped keys:

- `match:{matchId}:state`
- `match:{matchId}:meta`
- `match:{matchId}:manifest`
- `match:{matchId}:actions`
- `match:{matchId}:decisions`
- `match:{matchId}:locks`

- [ ] **Step 4: Run Redis adapter tests**

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/redis-match-persistence.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/match-server/src/redis-match-persistence.ts packages/match-server/src/redis-match-persistence.test.ts packages/match-server/package.json pnpm-lock.yaml
git commit -m "Add Redis active match persistence"
```

---

## Task 10: Exports And Verification

**Files:**

- Modify: `packages/match-server/src/index.ts`
- Modify: `packages/match-server/src/match-session.ts`
- Modify: `packages/match-server/src/session-service.ts`
- Test: package export/cohesion tests if present.

- [ ] **Step 1: Add observability tests**

Add focused tests or explicit test seams proving session handling records:

- accepted action count;
- rejected action count by rejection reason;
- action processing duration;
- structured log context containing `matchId`, `stateSeq`, and `actionSeq` when available.

The observability path must not expose `GameState` or hidden card data.

- [ ] **Step 2: Implement observability seams**

Use a narrow match-server-local metrics/logger interface or callback. Keep it
server-only. Do not import client, React, Redis, or engine internals into the
observability abstraction.

- [ ] **Step 3: Export server-safe infrastructure**

Export:

- `action-envelope`
- `canonical-json`
- `match-persistence`
- `match-recovery`
- `match-session`
- `match-session-store`
- `session-service`
- `session-types`

Only export `redis-match-persistence` if server bootstrapping needs it from outside the package. Do not allow client code to import match-server modules.

- [ ] **Step 4: Run focused verification**

```powershell
corepack pnpm --filter @optcg/match-server test
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/transport-ws.test.ts packages/client/src/controller.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run repo verification**

```powershell
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm run contracts
git diff --check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add packages/match-server/src/index.ts packages/match-server/src/match-session.ts packages/match-server/src/session-service.ts
git commit -m "Export match server infrastructure"
```

---

## Review Feedback Addressed

- Removed raw `GameState` from client-visible action results. It remains only in server-only persistence snapshots.
- Replaced invented raw engine `Action` transport snippets with current dev request shapes.
- Added complete immutable session metadata fields: creation source, disconnect policy, queue/lobby room for later, rollback policy, spectator policy.
- Added action and decision persistence records.
- Added recovery lock/freeze seams and a real missing-snapshot test requirement.
- Strengthened Redis requirements: actions, decisions, manifest, locks, TTL/owner semantics, and scan-style discovery.
- Required Vitest-style tests.
- Replaced plain `JSON.stringify` hashing with stable canonical request hashing.
- Tightened canonical hashing to omit undefined object fields, reject non-JSON values, and prove browser/server parity.
- Required `expectedStateSeq` in every live envelope, including decision responses.
- Required atomic Redis owner locks with TTL using `SET NX PX` or an equivalent single operation.
- Added observability requirements for accepted/rejected counts, processing timing, and match/action log context.
- Added first-player chooser orchestration: game one randomly selects the chooser, rematches give the choice to the previous loser, and the engine only receives the resolved `firstPlayerId`.

## Residual Risks

- Full deterministic replay-through from snapshot plus action/decision logs is still a later implementation slice. This plan creates typed seams and shallow recovery summaries only.
- The client and server will temporarily duplicate canonical JSON hashing unless a later shared package is introduced.
- The dev protocol remains dev-shaped; production queue/lobby creation can use the same session runtime after an API layer creates immutable `MatchSessionMetadata`.
- Draws, cancels, no-contests, and admin-reset rematches intentionally fail closed for first-player choice until a later session policy defines an explicit fallback.
