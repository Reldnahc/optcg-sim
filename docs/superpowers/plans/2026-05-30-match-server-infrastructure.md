# Match Server Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first production-shaped match-server infrastructure spine: authoritative match sessions, sequence-aware idempotent actions, persistence adapter boundaries, and restart recovery hooks.

**Architecture:** Keep gameplay authority in `engine-core`; wrap the existing `local-match` behavior in a match-server session runtime that owns transport/session/persistence concerns. Add storage as an interface with an in-memory adapter first, then a Redis adapter behind the same contract. Preserve the current dev WebSocket/client flow by routing it through the new session service rather than rewriting the UI.

**Tech Stack:** TypeScript, Node, existing `@optcg/engine-core`, existing `@optcg/types`, existing match-server WebSocket code, Redis adapter using the repo's existing package/dependency pattern.

---

## Spec Anchors

- `specs/01-system-architecture.md` sections `s009`, `s013`, `s017`, `s018`, `s019`, `s025`
- `specs/07-match-server-protocol.md` sections `s002` through `s006`
- `specs/08-replay-rollback-recovery.md` sections `s022` through `s031`
- `specs/29-game-types-queues-and-lobbies.md` sections `s004` through `s010`
- `docs/code-standard.md` package boundary, hidden-info, and deterministic-engine guidance

## Non-Goals For This Plan

- No account system.
- No ranked queue implementation.
- No Postgres completed replay storage.
- No production lobby password hashing beyond preserving room for the field.
- No client UI redesign.
- No engine/card-rule behavior changes except test fixtures needed to drive session paths.
- No hidden-state leakage into client snapshots.

## File Structure

Create focused match-server infrastructure files:

- `packages/match-server/src/session-types.ts`
  - Owns match session metadata, action envelope, action result, persistence record types, and repository interfaces.
- `packages/match-server/src/action-envelope.ts`
  - Canonical action hashing, idempotency key helpers, stale/future-state validation helpers.
- `packages/match-server/src/match-session.ts`
  - `MatchSessionRuntime` class/function wrapper around current local match state application.
- `packages/match-server/src/match-session-store.ts`
  - In-memory `MatchSessionStore` adapter for active dev/test matches.
- `packages/match-server/src/match-persistence.ts`
  - Persistence interface and in-memory implementation for recovery tests.
- `packages/match-server/src/redis-match-persistence.ts`
  - Redis-backed persistence adapter. Add only after the in-memory contract is tested.
- `packages/match-server/src/match-recovery.ts`
  - Recovery orchestration: scan metadata, lock, load snapshot/logs, rehydrate/freeze.
- `packages/match-server/src/session-service.ts`
  - High-level service for create/join/load/action used by dev HTTP/WebSocket server.

Modify existing files narrowly:

- `packages/match-server/src/local-match.ts`
  - Export or route minimal helpers required by `MatchSessionRuntime`; do not expand gameplay logic.
- `packages/match-server/src/dev-http-server.ts`
  - Replace ad hoc match map/action handling with `SessionService` calls.
- `packages/match-server/src/index.ts`
  - Export the new infrastructure types/helpers.
- `packages/client/src/transport.ts`
  - Add protocol-shaped action envelope fields if not already represented.
- `packages/client/src/transport-ws.ts`
  - Send `clientActionId`, `expectedStateSeq`, and `expectedDecisionId`.
- `packages/client/src/controller.ts`
  - Generate action IDs and preserve idempotent resend behavior.

Test files:

- `packages/match-server/src/action-envelope.test.ts`
- `packages/match-server/src/match-session.test.ts`
- `packages/match-server/src/match-session-store.test.ts`
- `packages/match-server/src/match-persistence.test.ts`
- `packages/match-server/src/match-recovery.test.ts`
- `packages/match-server/src/dev-http-server.test.ts` updates only where current routes/messages change.
- `packages/client/src/transport-ws.test.ts` and `packages/client/src/controller.test.ts` for envelope generation.

---

### Task 1: Add Session And Envelope Types

**Files:**

- Create: `packages/match-server/src/session-types.ts`
- Test: `packages/match-server/src/action-envelope.test.ts`

- [ ] **Step 1: Write the failing envelope/type behavior test**

```ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Action, MatchId, PlayerId } from "@optcg/types";
import { actionHash, idempotencyKey } from "./action-envelope.js";

describe("match action envelope helpers", () => {
  test("hashes only the action payload, not transport metadata", () => {
    const action: Action = { type: "pass" };

    const first = actionHash(action);
    const second = actionHash({ ...action });

    assert.equal(first, second);
  });

  test("keys idempotency by match player and client action id", () => {
    const key = idempotencyKey({
      matchId: "match-1" as MatchId,
      playerId: "p1" as PlayerId,
      clientActionId: "client-action-1",
    });

    assert.equal(key, "match-1:p1:client-action-1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/action-envelope.test.ts
```

Expected: FAIL because `action-envelope.ts` does not exist.

- [ ] **Step 3: Add session infrastructure types**

Create `packages/match-server/src/session-types.ts`:

```ts
import type {
  Action,
  GameState,
  MatchCardManifest,
  MatchId,
  PlayerId,
} from "@optcg/types";

export type GameType = "ranked" | "unranked" | "custom" | "dev";

export type SpectatorPolicyMode = "disabled" | "live-filtered";

export type RollbackPolicyMode = "disabled" | "mutual-consent" | "host-consent";

export interface MatchSessionMetadata {
  matchId: MatchId;
  gameType: GameType;
  formatId: string;
  createdAt: string;
  playerIds: readonly PlayerId[];
  rollbackPolicyMode: RollbackPolicyMode;
  spectatorPolicyMode: SpectatorPolicyMode;
  ownerInstanceId?: string;
  lobbyId?: string;
  queueTicketIds?: readonly string[];
}

export interface ClientActionEnvelope {
  protocolVersion: string;
  matchId: MatchId;
  playerId: PlayerId;
  clientActionId: string;
  expectedStateSeq: number;
  expectedDecisionId?: string;
  actionHash: string;
  sentAtClientTime?: string;
  action: Action;
}

export type ActionRejectionReason =
  | "staleState"
  | "futureState"
  | "idempotencyConflict"
  | "notYourSeat"
  | "illegalAction"
  | "pendingDecisionMismatch"
  | "matchFrozen"
  | "serverError";

export interface SessionActionResult {
  type: "actionResult";
  matchId: MatchId;
  clientActionId: string;
  accepted: boolean;
  stateSeq: number;
  actionSeq: number;
  reason?: ActionRejectionReason;
  state?: GameState;
}

export interface StoredActionRecord {
  envelope: ClientActionEnvelope;
  result: SessionActionResult;
  recordedAt: string;
}

export interface MatchPersistenceSnapshot {
  metadata: MatchSessionMetadata;
  state: GameState;
  manifest: MatchCardManifest;
  actions: readonly StoredActionRecord[];
}

export interface MatchPersistence {
  saveSnapshot(input: MatchPersistenceSnapshot): Promise<void>;
  appendAction(input: {
    matchId: MatchId;
    record: StoredActionRecord;
  }): Promise<void>;
  loadSnapshot(matchId: MatchId): Promise<MatchPersistenceSnapshot | undefined>;
  listActiveMatchIds(): Promise<MatchId[]>;
  freezeMatch(input: {
    matchId: MatchId;
    reason: string;
    frozenAt: string;
  }): Promise<void>;
}
```

- [ ] **Step 4: Add action envelope helpers**

Create `packages/match-server/src/action-envelope.ts`:

```ts
import { createHash } from "node:crypto";
import type { Action, MatchId, PlayerId } from "@optcg/types";

export const actionHash = (action: Action): string =>
  createHash("sha256").update(JSON.stringify(action)).digest("hex");

export const idempotencyKey = (input: {
  matchId: MatchId;
  playerId: PlayerId;
  clientActionId: string;
}): string =>
  `${String(input.matchId)}:${String(input.playerId)}:${input.clientActionId}`;
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/action-envelope.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add packages/match-server/src/session-types.ts packages/match-server/src/action-envelope.ts packages/match-server/src/action-envelope.test.ts
git commit -m "Add match session envelope types"
```

---

### Task 2: Implement Idempotent Match Session Runtime

**Files:**

- Create: `packages/match-server/src/match-session.ts`
- Test: `packages/match-server/src/match-session.test.ts`
- Modify: `packages/match-server/src/local-match.ts` only if a helper export is required.

- [ ] **Step 1: Write failing tests for accepted, stale, future, and duplicate actions**

```ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { MatchId, PlayerId } from "@optcg/types";
import { actionHash } from "./action-envelope.js";
import { createMatchSessionRuntime } from "./match-session.js";
import { createLocalDevMatch } from "./local-match.js";

const matchId = "match-1" as MatchId;
const p1 = "p1" as PlayerId;

const envelope = (stateSeq: number, clientActionId = "a1") => {
  const action = { type: "pass" } as const;
  return {
    protocolVersion: "dev",
    matchId,
    playerId: p1,
    clientActionId,
    expectedStateSeq: stateSeq,
    actionHash: actionHash(action),
    action,
  };
};

describe("match session runtime", () => {
  test("accepts a new sequence-matching action once", () => {
    const local = createLocalDevMatch({ matchId });
    const runtime = createMatchSessionRuntime({ local });

    const result = runtime.applyEnvelope(envelope(local.state.seq));

    assert.equal(result.accepted, true);
    assert.equal(result.clientActionId, "a1");
  });

  test("returns the stored result for duplicate client action id and hash", () => {
    const local = createLocalDevMatch({ matchId });
    const runtime = createMatchSessionRuntime({ local });
    const input = envelope(local.state.seq);

    const first = runtime.applyEnvelope(input);
    const second = runtime.applyEnvelope(input);

    assert.deepEqual(second, first);
  });

  test("rejects duplicate client action id with different hash", () => {
    const local = createLocalDevMatch({ matchId });
    const runtime = createMatchSessionRuntime({ local });
    const input = envelope(local.state.seq);
    runtime.applyEnvelope(input);

    const second = runtime.applyEnvelope({
      ...input,
      actionHash: "different",
    });

    assert.equal(second.accepted, false);
    assert.equal(second.reason, "idempotencyConflict");
  });

  test("rejects stale and future sequence actions without applying them", () => {
    const local = createLocalDevMatch({ matchId });
    const runtime = createMatchSessionRuntime({ local });

    const stale = runtime.applyEnvelope(envelope(local.state.seq - 1, "old"));
    const future = runtime.applyEnvelope(envelope(local.state.seq + 1, "new"));

    assert.equal(stale.reason, "staleState");
    assert.equal(future.reason, "futureState");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/match-session.test.ts
```

Expected: FAIL because `match-session.ts` does not exist or because local factory signatures need adapting.

- [ ] **Step 3: Implement minimal runtime wrapper**

Create `packages/match-server/src/match-session.ts`:

```ts
import type { LocalDevMatch } from "./local-match.js";
import { applyLocalDevAction } from "./local-match.js";
import type {
  ClientActionEnvelope,
  SessionActionResult,
  StoredActionRecord,
} from "./session-types.js";

export interface MatchSessionRuntime {
  readonly local: LocalDevMatch;
  applyEnvelope(envelope: ClientActionEnvelope): SessionActionResult;
  actionRecords(): readonly StoredActionRecord[];
}

export const createMatchSessionRuntime = (input: {
  local: LocalDevMatch;
  now?: () => string;
}): MatchSessionRuntime => {
  const records = new Map<string, StoredActionRecord>();
  const now = input.now ?? (() => new Date().toISOString());

  const runtime: MatchSessionRuntime = {
    local: input.local,
    applyEnvelope(envelope) {
      const key = `${String(envelope.matchId)}:${String(envelope.playerId)}:${envelope.clientActionId}`;
      const existing = records.get(key);
      if (existing !== undefined) {
        if (existing.envelope.actionHash !== envelope.actionHash) {
          return {
            type: "actionResult",
            matchId: envelope.matchId,
            clientActionId: envelope.clientActionId,
            accepted: false,
            stateSeq: input.local.state.seq,
            actionSeq: input.local.state.actionSeq,
            reason: "idempotencyConflict",
          };
        }
        return existing.result;
      }

      if (envelope.expectedStateSeq < input.local.state.seq) {
        return {
          type: "actionResult",
          matchId: envelope.matchId,
          clientActionId: envelope.clientActionId,
          accepted: false,
          stateSeq: input.local.state.seq,
          actionSeq: input.local.state.actionSeq,
          reason: "staleState",
        };
      }

      if (envelope.expectedStateSeq > input.local.state.seq) {
        return {
          type: "actionResult",
          matchId: envelope.matchId,
          clientActionId: envelope.clientActionId,
          accepted: false,
          stateSeq: input.local.state.seq,
          actionSeq: input.local.state.actionSeq,
          reason: "futureState",
        };
      }

      const applied = applyLocalDevAction(input.local, {
        playerId: envelope.playerId,
        action: envelope.action,
      });
      const result: SessionActionResult = {
        type: "actionResult",
        matchId: envelope.matchId,
        clientActionId: envelope.clientActionId,
        accepted: applied.errors === undefined,
        stateSeq: input.local.state.seq,
        actionSeq: input.local.state.actionSeq,
        ...(applied.errors === undefined
          ? { state: input.local.state }
          : { reason: "illegalAction" }),
      };
      records.set(key, { envelope, result, recordedAt: now() });
      return result;
    },
    actionRecords() {
      return [...records.values()];
    },
  };

  return runtime;
};
```

If `LocalDevMatch` is not exported, export only its type from `local-match.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/match-session.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/match-server/src/match-session.ts packages/match-server/src/match-session.test.ts packages/match-server/src/local-match.ts
git commit -m "Add idempotent match session runtime"
```

---

### Task 3: Add Active Match Store

**Files:**

- Create: `packages/match-server/src/match-session-store.ts`
- Test: `packages/match-server/src/match-session-store.test.ts`

- [ ] **Step 1: Write failing store tests**

```ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { MatchId } from "@optcg/types";
import { createInMemoryMatchSessionStore } from "./match-session-store.js";

describe("in-memory match session store", () => {
  test("stores and loads sessions by match id", () => {
    const store = createInMemoryMatchSessionStore<string>();
    store.set("match-1" as MatchId, "session");

    assert.equal(store.get("match-1" as MatchId), "session");
  });

  test("lists active match ids", () => {
    const store = createInMemoryMatchSessionStore<string>();
    store.set("match-1" as MatchId, "one");
    store.set("match-2" as MatchId, "two");

    assert.deepEqual(store.listMatchIds(), ["match-1", "match-2"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/match-session-store.test.ts
```

Expected: FAIL because store module does not exist.

- [ ] **Step 3: Implement store**

```ts
import type { MatchId } from "@optcg/types";

export interface MatchSessionStore<TSession> {
  get(matchId: MatchId): TSession | undefined;
  set(matchId: MatchId, session: TSession): void;
  delete(matchId: MatchId): void;
  listMatchIds(): MatchId[];
}

export const createInMemoryMatchSessionStore = <
  TSession,
>(): MatchSessionStore<TSession> => {
  const sessions = new Map<string, TSession>();
  return {
    get(matchId) {
      return sessions.get(String(matchId));
    },
    set(matchId, session) {
      sessions.set(String(matchId), session);
    },
    delete(matchId) {
      sessions.delete(String(matchId));
    },
    listMatchIds() {
      return [...sessions.keys()] as MatchId[];
    },
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

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

### Task 4: Add Persistence Interface And In-Memory Adapter

**Files:**

- Create: `packages/match-server/src/match-persistence.ts`
- Test: `packages/match-server/src/match-persistence.test.ts`

- [ ] **Step 1: Write failing persistence tests**

```ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { MatchId } from "@optcg/types";
import { createInMemoryMatchPersistence } from "./match-persistence.js";
import type { MatchPersistenceSnapshot } from "./session-types.js";

const snapshot = (): MatchPersistenceSnapshot =>
  ({
    metadata: {
      matchId: "match-1" as MatchId,
      gameType: "dev",
      formatId: "dev",
      createdAt: "2026-05-30T00:00:00.000Z",
      playerIds: ["p1", "p2"],
      rollbackPolicyMode: "mutual-consent",
      spectatorPolicyMode: "disabled",
    },
    state: {
      seq: 1,
      actionSeq: 0,
      players: {},
      turn: { turnPlayerId: "p1", phase: "main", globalTurn: 1 },
    },
    manifest: { cards: {}, effectDefinitions: {} },
    actions: [],
  }) as MatchPersistenceSnapshot;

describe("in-memory match persistence", () => {
  test("saves and loads active match snapshots", async () => {
    const persistence = createInMemoryMatchPersistence();

    await persistence.saveSnapshot(snapshot());
    const loaded = await persistence.loadSnapshot("match-1" as MatchId);

    assert.equal(loaded?.metadata.matchId, "match-1");
  });

  test("appends action records without dropping the snapshot", async () => {
    const persistence = createInMemoryMatchPersistence();
    await persistence.saveSnapshot(snapshot());

    await persistence.appendAction({
      matchId: "match-1" as MatchId,
      record: {
        envelope: {
          protocolVersion: "dev",
          matchId: "match-1" as MatchId,
          playerId: "p1",
          clientActionId: "a1",
          expectedStateSeq: 1,
          actionHash: "hash",
          action: { type: "pass" },
        },
        result: {
          type: "actionResult",
          matchId: "match-1" as MatchId,
          clientActionId: "a1",
          accepted: true,
          stateSeq: 2,
          actionSeq: 1,
        },
        recordedAt: "2026-05-30T00:00:01.000Z",
      },
    });

    const loaded = await persistence.loadSnapshot("match-1" as MatchId);
    assert.equal(loaded?.actions.length, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/match-persistence.test.ts
```

Expected: FAIL because `match-persistence.ts` does not exist.

- [ ] **Step 3: Implement in-memory persistence**

```ts
import type { MatchId } from "@optcg/types";
import type {
  MatchPersistence,
  MatchPersistenceSnapshot,
  StoredActionRecord,
} from "./session-types.js";

export const createInMemoryMatchPersistence = (): MatchPersistence => {
  const snapshots = new Map<string, MatchPersistenceSnapshot>();
  const frozen = new Map<string, { reason: string; frozenAt: string }>();

  return {
    async saveSnapshot(input) {
      snapshots.set(String(input.metadata.matchId), {
        ...input,
        actions: [...input.actions],
      });
    },
    async appendAction(input: {
      matchId: MatchId;
      record: StoredActionRecord;
    }) {
      const current = snapshots.get(String(input.matchId));
      if (current === undefined) {
        return;
      }
      snapshots.set(String(input.matchId), {
        ...current,
        actions: [...current.actions, input.record],
      });
    },
    async loadSnapshot(matchId) {
      return snapshots.get(String(matchId));
    },
    async listActiveMatchIds() {
      return [...snapshots.keys()] as MatchId[];
    },
    async freezeMatch(input) {
      frozen.set(String(input.matchId), {
        reason: input.reason,
        frozenAt: input.frozenAt,
      });
    },
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/match-persistence.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/match-server/src/match-persistence.ts packages/match-server/src/match-persistence.test.ts
git commit -m "Add match persistence boundary"
```

---

### Task 5: Persist Session Snapshots And Accepted Actions

**Files:**

- Modify: `packages/match-server/src/match-session.ts`
- Test: `packages/match-server/src/match-session.test.ts`

- [ ] **Step 1: Add failing persistence integration test**

Add to `match-session.test.ts`:

```ts
test("persists the snapshot and accepted action record", async () => {
  const local = createLocalDevMatch({ matchId });
  const persistence = createInMemoryMatchPersistence();
  const runtime = createMatchSessionRuntime({
    local,
    persistence,
    metadata: {
      matchId,
      gameType: "dev",
      formatId: "dev",
      createdAt: "2026-05-30T00:00:00.000Z",
      playerIds: ["p1", "p2"],
      rollbackPolicyMode: "mutual-consent",
      spectatorPolicyMode: "disabled",
    },
  });

  await runtime.saveSnapshot();
  runtime.applyEnvelope(envelope(local.state.seq));
  await runtime.flushPersistence();

  const loaded = await persistence.loadSnapshot(matchId);
  assert.equal(loaded?.actions.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/match-session.test.ts
```

Expected: FAIL because persistence wiring does not exist.

- [ ] **Step 3: Extend runtime constructor and persistence methods**

Update `MatchSessionRuntime`:

```ts
export interface MatchSessionRuntime {
  readonly local: LocalDevMatch;
  applyEnvelope(envelope: ClientActionEnvelope): SessionActionResult;
  actionRecords(): readonly StoredActionRecord[];
  saveSnapshot(): Promise<void>;
  flushPersistence(): Promise<void>;
}
```

Add optional constructor fields:

```ts
persistence?: MatchPersistence;
metadata?: MatchSessionMetadata;
```

In `applyEnvelope`, push newly accepted action records into a `pendingPersistenceRecords` array. Implement:

```ts
async saveSnapshot() {
  if (input.persistence === undefined || input.metadata === undefined) {
    return;
  }
  await input.persistence.saveSnapshot({
    metadata: input.metadata,
    state: input.local.state,
    manifest: input.local.state.cardManifest,
    actions: [...records.values()],
  });
},
async flushPersistence() {
  if (input.persistence === undefined) {
    pendingPersistenceRecords.length = 0;
    return;
  }
  for (const record of pendingPersistenceRecords.splice(0)) {
    await input.persistence.appendAction({
      matchId: record.envelope.matchId,
      record,
    });
  }
},
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/match-session.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/match-server/src/match-session.ts packages/match-server/src/match-session.test.ts
git commit -m "Persist match session action records"
```

---

### Task 6: Add Recovery Orchestration Skeleton

**Files:**

- Create: `packages/match-server/src/match-recovery.ts`
- Test: `packages/match-server/src/match-recovery.test.ts`

- [ ] **Step 1: Write failing recovery tests**

```ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { MatchId } from "@optcg/types";
import { createInMemoryMatchPersistence } from "./match-persistence.js";
import { recoverActiveMatches } from "./match-recovery.js";

describe("match recovery", () => {
  test("returns no recovered sessions when persistence is empty", async () => {
    const recovered = await recoverActiveMatches({
      persistence: createInMemoryMatchPersistence(),
    });

    assert.equal(recovered.length, 0);
  });

  test("freezes a match when snapshot recovery fails", async () => {
    const persistence = createInMemoryMatchPersistence();
    await persistence.freezeMatch({
      matchId: "match-1" as MatchId,
      reason: "preexisting",
      frozenAt: "2026-05-30T00:00:00.000Z",
    });

    const recovered = await recoverActiveMatches({ persistence });

    assert.deepEqual(recovered, []);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/match-recovery.test.ts
```

Expected: FAIL because recovery module does not exist.

- [ ] **Step 3: Implement recovery shell**

```ts
import type { MatchId } from "@optcg/types";
import type { MatchPersistence } from "./session-types.js";

export interface RecoveredMatchSummary {
  matchId: MatchId;
  stateSeq: number;
  actionCount: number;
}

export const recoverActiveMatches = async (input: {
  persistence: MatchPersistence;
  now?: () => string;
}): Promise<RecoveredMatchSummary[]> => {
  const now = input.now ?? (() => new Date().toISOString());
  const matchIds = await input.persistence.listActiveMatchIds();
  const recovered: RecoveredMatchSummary[] = [];

  for (const matchId of matchIds) {
    const snapshot = await input.persistence.loadSnapshot(matchId);
    if (snapshot === undefined) {
      await input.persistence.freezeMatch({
        matchId,
        reason: "missing active match snapshot",
        frozenAt: now(),
      });
      continue;
    }
    recovered.push({
      matchId,
      stateSeq: snapshot.state.seq,
      actionCount: snapshot.actions.length,
    });
  }

  return recovered;
};
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/match-recovery.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/match-server/src/match-recovery.ts packages/match-server/src/match-recovery.test.ts
git commit -m "Add active match recovery shell"
```

---

### Task 7: Route Dev Server Through Session Service

**Files:**

- Create: `packages/match-server/src/session-service.ts`
- Modify: `packages/match-server/src/dev-http-server.ts`
- Test: `packages/match-server/src/dev-http-server.test.ts`

- [ ] **Step 1: Add failing dev-server behavior test**

Add or update a test in `dev-http-server.test.ts` to assert duplicate WebSocket action delivery does not apply twice:

```ts
test("duplicate client action ids return the same result without applying twice", async () => {
  const harness = await startDevHttpServerHarness();
  const created = await harness.createMatch();
  const first = await harness.sendWsAction({
    matchId: created.matchId,
    sessionToken: created.seats[0].sessionToken,
    clientActionId: "duplicate-action",
    action: { type: "pass" },
  });
  const second = await harness.sendWsAction({
    matchId: created.matchId,
    sessionToken: created.seats[0].sessionToken,
    clientActionId: "duplicate-action",
    action: { type: "pass" },
  });

  assert.equal(second.type, "actionResult");
  assert.equal(second.clientActionId, first.clientActionId);
  assert.equal(second.stateSeq, first.stateSeq);
});
```

If the harness currently lacks `clientActionId`, add it to the test harness request object in the same test file.

- [ ] **Step 2: Run test to verify it fails**

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/dev-http-server.test.ts
```

Expected: FAIL because raw dev actions are not idempotent yet.

- [ ] **Step 3: Implement `SessionService`**

Create `packages/match-server/src/session-service.ts`:

```ts
import type { MatchId } from "@optcg/types";
import { actionHash } from "./action-envelope.js";
import { createMatchSessionRuntime } from "./match-session.js";
import type { MatchSessionRuntime } from "./match-session.js";
import { createInMemoryMatchSessionStore } from "./match-session-store.js";
import type {
  ClientActionEnvelope,
  MatchPersistence,
  MatchSessionMetadata,
  SessionActionResult,
} from "./session-types.js";
import type { LocalDevMatch } from "./local-match.js";

export interface SessionService {
  registerLocalMatch(input: {
    local: LocalDevMatch;
    metadata: MatchSessionMetadata;
  }): MatchSessionRuntime;
  applyEnvelope(envelope: ClientActionEnvelope): Promise<SessionActionResult>;
}

export const createSessionService = (
  input: {
    persistence?: MatchPersistence;
  } = {},
): SessionService => {
  const store = createInMemoryMatchSessionStore<MatchSessionRuntime>();
  return {
    registerLocalMatch({ local, metadata }) {
      const runtime = createMatchSessionRuntime({
        local,
        metadata,
        persistence: input.persistence,
      });
      store.set(metadata.matchId, runtime);
      return runtime;
    },
    async applyEnvelope(envelope) {
      const runtime = store.get(envelope.matchId);
      if (runtime === undefined) {
        return {
          type: "actionResult",
          matchId: envelope.matchId,
          clientActionId: envelope.clientActionId,
          accepted: false,
          stateSeq: envelope.expectedStateSeq,
          actionSeq: 0,
          reason: "serverError",
        };
      }
      const expectedHash = actionHash(envelope.action);
      if (expectedHash !== envelope.actionHash) {
        return {
          type: "actionResult",
          matchId: envelope.matchId,
          clientActionId: envelope.clientActionId,
          accepted: false,
          stateSeq: runtime.local.state.seq,
          actionSeq: runtime.local.state.actionSeq,
          reason: "idempotencyConflict",
        };
      }
      const result = runtime.applyEnvelope(envelope);
      await runtime.flushPersistence();
      return result;
    },
  };
};
```

- [ ] **Step 4: Wire `dev-http-server.ts` through `SessionService`**

Add one `const sessionService = createSessionService({ persistence })` near the current local match map setup. When creating a match, register the local match:

```ts
sessionService.registerLocalMatch({
  local: match,
  metadata: {
    matchId,
    gameType: "dev",
    formatId: "dev",
    createdAt: new Date().toISOString(),
    playerIds: ["p1", "p2"],
    rollbackPolicyMode: "mutual-consent",
    spectatorPolicyMode: "disabled",
  },
});
```

In the WebSocket action handler, build a `ClientActionEnvelope`:

```ts
const envelope: ClientActionEnvelope = {
  protocolVersion: "dev",
  matchId,
  playerId,
  clientActionId: message.clientActionId,
  expectedStateSeq: message.expectedStateSeq,
  ...(message.expectedDecisionId === undefined
    ? {}
    : { expectedDecisionId: message.expectedDecisionId }),
  actionHash: message.actionHash,
  action: message.action,
};
const result = await sessionService.applyEnvelope(envelope);
```

Keep snapshot broadcasting through the existing filtered snapshot path after accepted actions.

- [ ] **Step 5: Run dev server tests**

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/dev-http-server.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add packages/match-server/src/session-service.ts packages/match-server/src/dev-http-server.ts packages/match-server/src/dev-http-server.test.ts
git commit -m "Route dev matches through session service"
```

---

### Task 8: Update Client WebSocket Transport To Send Action Envelopes

**Files:**

- Modify: `packages/client/src/transport.ts`
- Modify: `packages/client/src/transport-ws.ts`
- Modify: `packages/client/src/controller.ts`
- Test: `packages/client/src/transport-ws.test.ts`
- Test: `packages/client/src/controller.test.ts`

- [ ] **Step 1: Write failing client envelope test**

Add to `transport-ws.test.ts`:

```ts
test("sends client action id expected state sequence and action hash", async () => {
  const sent = await captureNextWebSocketSend(async (transport) => {
    await transport.sendAction({
      matchId: "match-1" as MatchId,
      sessionToken: "token",
      playerId: "p1" as PlayerId,
      expectedStateSeq: 7,
      action: { type: "pass" },
    });
  });

  assert.equal(sent.type, "action");
  assert.equal(typeof sent.clientActionId, "string");
  assert.equal(sent.expectedStateSeq, 7);
  assert.equal(typeof sent.actionHash, "string");
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/transport-ws.test.ts
```

Expected: FAIL because the transport does not send the full envelope yet.

- [ ] **Step 3: Update transport send action input**

In `packages/client/src/transport.ts`, ensure `sendAction` input includes:

```ts
playerId: PlayerId;
expectedStateSeq: number;
expectedDecisionId?: string;
clientActionId?: string;
```

In `transport-ws.ts`, generate a client action id if absent:

```ts
const clientActionId = input.clientActionId ?? crypto.randomUUID();
const actionHash = await hashAction(input.action);
socket.send(
  JSON.stringify({
    type: "action",
    matchId: input.matchId,
    playerId: input.playerId,
    sessionToken: input.sessionToken,
    clientActionId,
    expectedStateSeq: input.expectedStateSeq,
    ...(input.expectedDecisionId === undefined
      ? {}
      : { expectedDecisionId: input.expectedDecisionId }),
    actionHash,
    action: input.action,
  }),
);
```

Use the repo's existing hash helper if present; otherwise add a browser-safe SHA-256 helper in `transport-ws.ts` with Web Crypto.

- [ ] **Step 4: Update controller call site**

In `packages/client/src/controller.ts`, pass current view state seq and pending decision id:

```ts
await transport.sendAction({
  matchId: current.matchId,
  sessionToken: current.sessionToken,
  playerId: current.playerId,
  expectedStateSeq: current.view.seq,
  ...(current.view.pendingDecision === undefined
    ? {}
    : { expectedDecisionId: current.view.pendingDecision.id }),
  action,
});
```

Use actual existing controller state property names. Do not introduce guessed state fields if the current controller already stores them under different names.

- [ ] **Step 5: Run client tests**

```powershell
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/transport-ws.test.ts packages/client/src/controller.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add packages/client/src/transport.ts packages/client/src/transport-ws.ts packages/client/src/controller.ts packages/client/src/transport-ws.test.ts packages/client/src/controller.test.ts
git commit -m "Send sequence-aware action envelopes"
```

---

### Task 9: Add Redis Match Persistence Adapter

**Files:**

- Create: `packages/match-server/src/redis-match-persistence.ts`
- Test: `packages/match-server/src/redis-match-persistence.test.ts`
- Modify: `packages/match-server/package.json` only if a Redis client dependency is not already present.

- [ ] **Step 1: Write adapter contract test using a fake Redis client**

```ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { MatchId } from "@optcg/types";
import { createRedisMatchPersistence } from "./redis-match-persistence.js";

class FakeRedis {
  readonly values = new Map<string, string>();
  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async keys(pattern: string): Promise<string[]> {
    const prefix = pattern.replace("*", "");
    return [...this.values.keys()].filter((key) => key.startsWith(prefix));
  }
  async rPush(key: string, value: string): Promise<void> {
    const current = JSON.parse(this.values.get(key) ?? "[]") as string[];
    current.push(value);
    this.values.set(key, JSON.stringify(current));
  }
  async lRange(key: string): Promise<string[]> {
    return JSON.parse(this.values.get(key) ?? "[]") as string[];
  }
}

describe("redis match persistence", () => {
  test("uses spec-shaped active match keys", async () => {
    const redis = new FakeRedis();
    const persistence = createRedisMatchPersistence({ redis });

    await persistence.freezeMatch({
      matchId: "match-1" as MatchId,
      reason: "test",
      frozenAt: "2026-05-30T00:00:00.000Z",
    });

    assert.equal(redis.values.has("match:match-1:locks"), true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/redis-match-persistence.test.ts
```

Expected: FAIL because Redis adapter does not exist.

- [ ] **Step 3: Implement Redis adapter behind a minimal client interface**

```ts
import type { MatchId } from "@optcg/types";
import type {
  MatchPersistence,
  MatchPersistenceSnapshot,
  StoredActionRecord,
} from "./session-types.js";

export interface RedisLike {
  set(key: string, value: string): Promise<unknown>;
  get(key: string): Promise<string | null>;
  keys(pattern: string): Promise<string[]>;
  rPush(key: string, value: string): Promise<unknown>;
  lRange(key: string, start: number, stop: number): Promise<string[]>;
}

const key = (matchId: MatchId, suffix: string): string =>
  `match:${String(matchId)}:${suffix}`;

export const createRedisMatchPersistence = (input: {
  redis: RedisLike;
}): MatchPersistence => ({
  async saveSnapshot(snapshot) {
    const matchId = snapshot.metadata.matchId;
    await input.redis.set(
      key(matchId, "state"),
      JSON.stringify(snapshot.state),
    );
    await input.redis.set(
      key(matchId, "meta"),
      JSON.stringify(snapshot.metadata),
    );
    await input.redis.set(
      key(matchId, "manifest"),
      JSON.stringify(snapshot.manifest),
    );
  },
  async appendAction({ matchId, record }) {
    await input.redis.rPush(key(matchId, "actions"), JSON.stringify(record));
  },
  async loadSnapshot(matchId) {
    const [state, metadata, manifest, actions] = await Promise.all([
      input.redis.get(key(matchId, "state")),
      input.redis.get(key(matchId, "meta")),
      input.redis.get(key(matchId, "manifest")),
      input.redis.lRange(key(matchId, "actions"), 0, -1),
    ]);
    if (state === null || metadata === null || manifest === null) {
      return undefined;
    }
    return {
      state: JSON.parse(state),
      metadata: JSON.parse(metadata),
      manifest: JSON.parse(manifest),
      actions: actions.map((entry) => JSON.parse(entry) as StoredActionRecord),
    } satisfies MatchPersistenceSnapshot;
  },
  async listActiveMatchIds() {
    const keys = await input.redis.keys("match:*:meta");
    return keys.map((candidate) => candidate.split(":")[1] as MatchId);
  },
  async freezeMatch({ matchId, reason, frozenAt }) {
    await input.redis.set(
      key(matchId, "locks"),
      JSON.stringify({ reason, frozenAt }),
    );
  },
});
```

- [ ] **Step 4: Run Redis adapter tests**

```powershell
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/redis-match-persistence.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/match-server/src/redis-match-persistence.ts packages/match-server/src/redis-match-persistence.test.ts packages/match-server/package.json pnpm-lock.yaml
git commit -m "Add Redis active match persistence adapter"
```

---

### Task 10: Export Infrastructure And Run Full Verification

**Files:**

- Modify: `packages/match-server/src/index.ts`
- Test: existing package export/cohesion tests if present.

- [ ] **Step 1: Export public infrastructure modules**

In `packages/match-server/src/index.ts`:

```ts
export * from "./action-envelope.js";
export * from "./match-persistence.js";
export * from "./match-recovery.js";
export * from "./match-session.js";
export * from "./match-session-store.js";
export * from "./session-service.js";
export * from "./session-types.js";
```

Do not export `redis-match-persistence.ts` if package policy treats Redis as deployment wiring only. If it should be public for server bootstrapping, export it explicitly and test that server-only code does not enter client bundles.

- [ ] **Step 2: Run focused test suite**

```powershell
corepack pnpm --filter @optcg/match-server test
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/transport-ws.test.ts packages/client/src/controller.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run repo verification**

```powershell
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm run contracts
git diff --check
```

Expected: all pass. If `corepack pnpm verify` is feasible, run it after the listed commands.

- [ ] **Step 4: Commit exports**

```powershell
git add packages/match-server/src/index.ts
git commit -m "Export match server infrastructure"
```

---

## Plan Self-Review

Spec coverage:

- Match server owns sessions, action sequencing, reconnect/recovery surfaces: Tasks 1, 2, 3, 6, 7.
- Action envelope and idempotency: Tasks 1, 2, 7, 8.
- Redis active match persistence keys: Tasks 4, 5, 9.
- Dev flow preservation: Tasks 7 and 8 route existing dev server/client through the new service.
- Hidden info boundary: This plan does not project raw state to clients; existing filtered snapshot path remains the client output.
- Recovery foundation: Task 6 adds recovery skeleton; full deterministic replay-through is intentionally not completed in this first slice.

Risk notes:

- `local-match.ts` may need small exports. Do not move gameplay logic into new session files.
- `actionHash` using `JSON.stringify` is acceptable only if existing action object construction is stable. If a canonical JSON helper already exists, use that instead.
- Redis adapter tests should use a fake client, not a live Docker Redis dependency, so CI remains stable.
- Full process restart replay from action logs is not complete until a later task replays accepted actions from the last clean snapshot.
