# Replay Display Artifact Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace on-demand replay frame reconstruction with a completed-match display artifact that the replay viewer can load and play locally.

**Architecture:** Rollback and replay display are separate artifacts. Rollback keeps deterministic entries and checkpoints for audit/recovery. Replay viewing reads precomputed, compact, versioned display frames written while live action snapshots still exist, then uses `MatchApp` with local play/pause/seek controls.

**Tech Stack:** TypeScript, Vitest, React, Node HTTP server, Postgres JSONB replay persistence, existing `MatchApp` and `createBoardViewModel`.

---

## Source Of Truth

This plan replaces `docs/superpowers/plans/2026-06-24-unified-replay-rollback-recovery-log.md`, which has been deleted because replay viewing should not depend on rollback reconstruction.

Useful historical commits:

- `f871a65a` and `db8b9145`: correct viewer shape, `MatchApp` plus transport controls.
- `e54000da` and `28fed1df`: correct data-flow shape, replay detail supplies board frames and the client steps locally.
- `f940dd1a`: wrong pivot, frame viewing starts reconstructing from engine artifacts at read time.

Do not restore the old payload literally. The old payload used full snapshot-shaped frames and grew too large. Restore the product/data-flow shape and replace the payload with compact display frames.

## Hard Requirements

- New replays must not call `reconstructReplayArtifactStates` for normal viewer rendering.
- Opening a replay must be a cheap replay-detail read, not an engine replay loop.
- Display-v1 viewer play, pause, next, previous, and seek must not call `/api/replays/:matchId/frames`. The frame endpoint remains only for an explicit legacy fallback path for old rows without a valid display artifact.
- Rollback deterministic entries and checkpoints must remain intact.
- Replay display frames must be versioned as `display-v1`.
- Replay display frames must not duplicate full event history in every frame.
- Replay display artifacts must have one fixed `perspectivePlayerId`. Each frame stores only that perspective player's `PlayerView`, as that player saw it during live play. Frames must not store the opponent player's `PlayerView`, opponent-private zones, deck order, RNG state, rollback internals, or raw hidden engine state.
- Legacy frame reconstruction may remain only as a named fallback for rows with missing, null, invalid, or malformed display artifacts.

## Concrete Current-Code Seams

- `packages/match-server/src/session-types.ts`
  - `StoredDeterministicSessionRecord` is the right place to attach a server-internal display frame, because accepted deterministic records are already passed into completed-match persistence.
- `packages/match-server/src/match-session.ts`
  - `createMatchSessionRuntime()` can build display frames immediately after accepted deterministic operations. Prefer `result.snapshot` when available, but production HTTP sessions currently run with `includeActionSnapshots: false`, so the display capture path must fall back to `getLocalDevSnapshot(local)` after the accepted operation. Persisted action/audit records must still use `compactSessionResult(...)`.
  - Choose one replay display perspective per session. Prefer `metadata.playerIds[0]` when present; otherwise use the first accepted envelope player that produces a snapshot. Do not switch perspectives mid-replay.
- `packages/match-server/src/deterministic-entry-builder.ts`
  - `buildStoredDeterministicSessionRecord(...)` should accept an optional `replayDisplayFrame` and copy it onto the returned record. It must not put display data inside `deterministicEntry`.
- `packages/match-server/src/local-completed-match-record.ts`
  - `buildLocalCompletedMatchRecord(...)` should receive the runtime's ordered `replayDisplayFrames` list and write it into one `replayDisplayArtifact`. It must not mine deterministic entries as the source of truth, because zero-action matches still need an initial display frame.
- `packages/match-server/src/postgres-completed-match.ts`
  - `match_replays` SQL currently has no display artifact field. Add `replay_display_artifact` to the contract and repository SQL, then expose it in public replay detail.
- `packages/match-server/src/replay-frame-cache.ts`
  - `publicReplayDetail(...)` currently allowlists public replay fields and must explicitly include `replayDisplayArtifact` for local fixture/public detail paths until the legacy cache file is renamed or removed.
- `packages/client/src/react/ReplayViewerPage.tsx`
  - Current code fetches frame chunks. Replace the display-v1 path with a one-time replay detail fetch and local frame array, while moving chunk fetching into a named legacy fallback for old or malformed rows.

---

### Task 1: Add Replay Display Artifact Types And Compact Snapshot Projection

**Files:**

- Create: `packages/match-server/src/replay-display-artifact.ts`
- Create: `packages/match-server/src/replay-display-artifact.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/match-server/src/replay-display-artifact.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { PlayerId } from "@optcg/types";

import {
  createReplayDisplayArtifact,
  createReplayDisplayFrameFromSnapshot,
  isReplayDisplayArtifactV1,
  replayDisplayArtifactByteSize,
} from "./replay-display-artifact.js";
import type { DevMatchSnapshot } from "./dev-snapshot-types.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

const publicCard = (instanceId: string, cardId: string) => ({
  instanceId,
  cardId,
  owner: p1,
  controller: p1,
  zone: { playerId: p1, zone: "leader" },
  rested: false,
  attachedDonCount: 0,
  attachedDonIds: [],
});

const selfState = () => ({
  playerId: p1,
  deckCount: 40,
  donDeckCount: 10,
  hand: [],
  trash: [],
  leader: publicCard("leader-1", "L1"),
  characters: [],
  costArea: [],
  life: { count: 5, faceUpCards: [] },
  hasMulliganed: false,
  turnCount: 1,
});

const opponentState = () => ({
  playerId: p2,
  deckCount: 40,
  donDeckCount: 10,
  handCount: 5,
  trash: [],
  leader: {
    ...publicCard("leader-2", "L2"),
    owner: p2,
    controller: p2,
    zone: { playerId: p2, zone: "leader" },
  },
  characters: [],
  costArea: [],
  life: { count: 5, faceUpCards: [] },
  hasMulliganed: false,
  turnCount: 1,
});

const snapshot = (eventSeqs: readonly number[]): DevMatchSnapshot =>
  ({
    stateSeq: 10,
    actionSeq: 4,
    stateHash: "hash-10",
    status: "active",
    turn: {
      turnPlayerId: p1,
      globalTurn: 1,
      playerTurn: 1,
      phase: "main",
      hasAttacked: false,
      hasPlayedDonThisTurn: false,
      hasPlayedCharacterThisTurn: false,
    },
    activePlayerId: p1,
    players: {
      [p1]: {
        view: {
          matchId: "match-1",
          playerId: p1,
          stateSeq: 10,
          actionSeq: 4,
          turn: {
            turnPlayerId: p1,
            globalTurn: 1,
            playerTurnCounts: { [p1]: 1, [p2]: 0 },
            phase: "main",
          },
          self: selfState(),
          opponent: opponentState(),
          timers: { players: {} },
          legalActions: [{ type: "endTurn" }],
          revealedCards: [],
          events: eventSeqs.map((seq) => ({ id: `event-${seq}`, seq })),
        },
        actions: [{ index: 0, type: "endTurn", label: "End turn" }],
      },
      [p2]: {
        view: {
          matchId: "match-1",
          playerId: p2,
          stateSeq: 10,
          actionSeq: 4,
          turn: {
            turnPlayerId: p1,
            globalTurn: 1,
            playerTurnCounts: { [p1]: 1, [p2]: 0 },
            phase: "main",
          },
          self: {
            ...selfState(),
            playerId: p2,
            hand: [{ instanceId: "hidden-card", cardId: "H1" }],
          },
          opponent: { ...opponentState(), playerId: p1 },
          timers: { players: {} },
          legalActions: [{ type: "endTurn" }],
          revealedCards: [],
          events: [{ id: "opponent-private-event", seq: 99 }],
        },
        actions: [{ index: 0, type: "endTurn", label: "End turn" }],
      },
    },
  }) as unknown as DevMatchSnapshot;

describe("replay display artifact", () => {
  test("creates versioned display-v1 artifacts", () => {
    const frame = createReplayDisplayFrameFromSnapshot({
      index: 0,
      actionIndex: null,
      label: "Initial state",
      snapshot: snapshot([1, 2]),
      perspectivePlayerId: p1,
      previousEventSeqByPlayer: new Map(),
    });
    expect(frame).toBeDefined();
    if (frame === undefined) {
      throw new Error("Expected display frame.");
    }
    const artifact = createReplayDisplayArtifact({
      perspectivePlayerId: p1,
      frames: [frame.frame],
    });

    expect(artifact).toMatchObject({
      replayDisplayVersion: "display-v1",
      perspectivePlayerId: p1,
      frameCount: 1,
      frames: [{ index: 0, label: "Initial state" }],
    });
    expect(isReplayDisplayArtifactV1(artifact)).toBe(true);
    expect(Object.keys(artifact.frames[0]?.snapshot.players ?? {})).toEqual([
      p1,
    ]);
    expect(JSON.stringify(artifact)).not.toContain("hidden-card");
  });

  test("stores per-frame event deltas instead of repeated full event history", () => {
    const first = createReplayDisplayFrameFromSnapshot({
      index: 0,
      actionIndex: null,
      label: "Initial state",
      snapshot: snapshot([1, 2]),
      perspectivePlayerId: p1,
      previousEventSeqByPlayer: new Map(),
    });
    expect(first).toBeDefined();
    if (first === undefined) {
      throw new Error("Expected first display frame.");
    }
    const second = createReplayDisplayFrameFromSnapshot({
      index: 1,
      actionIndex: 0,
      label: "endTurn",
      snapshot: snapshot([1, 2, 3]),
      perspectivePlayerId: p1,
      previousEventSeqByPlayer: first.nextEventSeqByPlayer,
    });
    expect(second).toBeDefined();
    if (second === undefined) {
      throw new Error("Expected second display frame.");
    }

    expect(first.frame.snapshot.players[p1]?.view.events).toHaveLength(2);
    expect(second.frame.snapshot.players[p1]?.view.events).toEqual([
      { id: "event-3", seq: 3 },
    ]);
    expect(second.frame.snapshot.players[p1]?.actions).toEqual([]);
    expect(second.frame.snapshot.players[p1]?.view.legalActions).toEqual([]);
  });

  test("strips terminal private-zone expansions from display frames", () => {
    const expanded = snapshot([1]);
    expanded.status = "completed";
    const player = expanded.players[p1];
    if (player === undefined) {
      throw new Error("Expected perspective player.");
    }
    player.view.self.deck = [publicCard("deck-1", "D1")];
    player.view.self.donDeck = [publicCard("don-deck-1", "DON")];
    player.view.self.life = {
      count: 5,
      faceUpCards: [publicCard("hidden-life-1", "H1")],
    };
    player.view.opponent.hand = [
      { ...publicCard("opponent-hand-1", "H2"), owner: p2, controller: p2 },
    ];
    player.view.opponent.deck = [
      { ...publicCard("opponent-deck-1", "D2"), owner: p2, controller: p2 },
    ];
    player.view.opponent.donDeck = [
      {
        ...publicCard("opponent-don-deck-1", "DON"),
        owner: p2,
        controller: p2,
      },
    ];
    player.view.opponent.life = {
      count: 5,
      faceUpCards: [
        {
          ...publicCard("opponent-hidden-life-1", "H3"),
          owner: p2,
          controller: p2,
        },
      ],
    };

    const result = createReplayDisplayFrameFromSnapshot({
      index: 0,
      actionIndex: null,
      label: "Terminal state",
      snapshot: expanded,
      perspectivePlayerId: p1,
      previousEventSeqByPlayer: new Map(),
    });
    if (result === undefined) {
      throw new Error("Expected display frame.");
    }
    const view = result.frame.snapshot.players[p1]?.view;

    expect(view?.self.deck).toBeUndefined();
    expect(view?.self.donDeck).toBeUndefined();
    expect(view?.self.life.faceUpCards).toEqual([]);
    expect(view?.opponent.hand).toBeUndefined();
    expect(view?.opponent.deck).toBeUndefined();
    expect(view?.opponent.donDeck).toBeUndefined();
    expect(view?.opponent.life.faceUpCards).toEqual([]);
  });

  test("rejects malformed artifacts", () => {
    const validFrame = createReplayDisplayFrameFromSnapshot({
      index: 0,
      actionIndex: null,
      label: "Initial state",
      snapshot: snapshot([1]),
      perspectivePlayerId: p1,
      previousEventSeqByPlayer: new Map(),
    });
    if (validFrame === undefined) {
      throw new Error("Expected display frame.");
    }
    const validArtifact = createReplayDisplayArtifact({
      perspectivePlayerId: p1,
      frames: [validFrame.frame],
    });
    const validPlayer = validFrame.frame.snapshot.players[p1];
    if (validPlayer === undefined) {
      throw new Error("Expected perspective player.");
    }

    expect(
      isReplayDisplayArtifactV1({ replayDisplayVersion: "display-v1" }),
    ).toBe(false);
    expect(
      isReplayDisplayArtifactV1({
        replayDisplayVersion: "display-v1",
        perspectivePlayerId: p1,
        frameCount: 1,
        frames: [{ index: "0" }],
      }),
    ).toBe(false);
    expect(
      isReplayDisplayArtifactV1({
        replayDisplayVersion: "display-v1",
        perspectivePlayerId: p1,
        frameCount: 1,
        frames: [
          {
            index: 0,
            actionIndex: null,
            label: "bad",
            stateSeq: 1,
            actionSeq: 0,
            status: "active",
            activePlayerId: p1,
            perspectivePlayerId: p1,
            snapshot: { players: {} },
          },
        ],
      }),
    ).toBe(false);
    expect(
      isReplayDisplayArtifactV1({
        ...validArtifact,
        frames: [
          {
            ...validFrame.frame,
            snapshot: {
              ...validFrame.frame.snapshot,
              players: {
                [p1]: {
                  ...validPlayer,
                  actions: [{ index: 0, type: "endTurn" }],
                },
              },
            },
          },
        ],
      }),
    ).toBe(false);
    expect(
      isReplayDisplayArtifactV1({
        ...validArtifact,
        frames: [
          {
            ...validFrame.frame,
            snapshot: {
              ...validFrame.frame.snapshot,
              players: {
                [p1]: {
                  ...validPlayer,
                  view: {
                    ...validPlayer.view,
                    legalActions: [{ type: "endTurn" }],
                  },
                },
              },
            },
          },
        ],
      }),
    ).toBe(false);
    expect(
      isReplayDisplayArtifactV1({
        ...validArtifact,
        frames: [
          {
            ...validFrame.frame,
            snapshot: {
              ...validFrame.frame.snapshot,
              players: {
                [p1]: {
                  ...validPlayer,
                  view: { ...validPlayer.view, playerId: p2 },
                },
              },
            },
          },
        ],
      }),
    ).toBe(false);
    expect(
      isReplayDisplayArtifactV1({
        ...validArtifact,
        frames: [
          {
            ...validFrame.frame,
            snapshot: {
              ...validFrame.frame.snapshot,
              players: { [p1]: { actions: [] } },
            },
          },
        ],
      }),
    ).toBe(false);
    expect(
      isReplayDisplayArtifactV1({
        ...validArtifact,
        frames: [
          {
            ...validFrame.frame,
            snapshot: {
              ...validFrame.frame.snapshot,
              players: {
                [p1]: {
                  ...validPlayer,
                  view: {
                    ...validPlayer.view,
                    timers: undefined,
                  },
                },
              },
            },
          },
        ],
      }),
    ).toBe(false);
    expect(
      isReplayDisplayArtifactV1({
        ...validArtifact,
        frames: [
          {
            ...validFrame.frame,
            snapshot: {
              ...validFrame.frame.snapshot,
              players: {
                [p1]: {
                  ...validPlayer,
                  view: {
                    ...validPlayer.view,
                    self: {
                      ...validPlayer.view.self,
                      characters: [{}],
                    },
                  },
                },
              },
            },
          },
        ],
      }),
    ).toBe(false);
    expect(
      isReplayDisplayArtifactV1({
        ...validArtifact,
        frames: [
          {
            ...validFrame.frame,
            snapshot: {
              ...validFrame.frame.snapshot,
              players: {
                [p1]: {
                  ...validPlayer,
                  view: {
                    ...validPlayer.view,
                    self: {
                      ...validPlayer.view.self,
                      deck: [publicCard("deck-1", "D1")],
                    },
                  },
                },
              },
            },
          },
        ],
      }),
    ).toBe(false);
    expect(
      isReplayDisplayArtifactV1({
        ...validArtifact,
        frames: [
          {
            ...validFrame.frame,
            snapshot: {
              ...validFrame.frame.snapshot,
              players: {
                [p1]: {
                  ...validPlayer,
                  view: {
                    ...validPlayer.view,
                    opponent: {
                      ...validPlayer.view.opponent,
                      hand: [
                        {
                          ...publicCard("opponent-hand-1", "H2"),
                          owner: p2,
                          controller: p2,
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        ],
      }),
    ).toBe(false);
    expect(
      isReplayDisplayArtifactV1({
        ...validArtifact,
        frames: [
          {
            ...validFrame.frame,
            status: "completed",
            snapshot: {
              ...validFrame.frame.snapshot,
              status: "completed",
              players: {
                [p1]: {
                  ...validPlayer,
                  view: {
                    ...validPlayer.view,
                    self: {
                      ...validPlayer.view.self,
                      life: {
                        count: 5,
                        faceUpCards: [publicCard("terminal-life-1", "H1")],
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      }),
    ).toBe(false);
    expect(
      isReplayDisplayArtifactV1({
        ...validArtifact,
        frames: [
          {
            ...validFrame.frame,
            status: "gameOver",
            snapshot: {
              ...validFrame.frame.snapshot,
              status: "gameOver",
              players: {
                [p1]: {
                  ...validPlayer,
                  view: {
                    ...validPlayer.view,
                    opponent: {
                      ...validPlayer.view.opponent,
                      life: {
                        count: 5,
                        faceUpCards: [
                          {
                            ...publicCard("opponent-terminal-life-1", "H2"),
                            owner: p2,
                            controller: p2,
                          },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      }),
    ).toBe(false);
    expect(
      isReplayDisplayArtifactV1({
        ...validArtifact,
        frames: [
          {
            ...validFrame.frame,
            status: "active",
            snapshot: {
              ...validFrame.frame.snapshot,
              status: "completed",
              players: {
                [p1]: {
                  ...validPlayer,
                  view: {
                    ...validPlayer.view,
                    self: {
                      ...validPlayer.view.self,
                      life: {
                        count: 5,
                        faceUpCards: [publicCard("mismatched-life-1", "H3")],
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      }),
    ).toBe(false);
  });

  test("reports canonical JSON byte size", () => {
    const frame = createReplayDisplayFrameFromSnapshot({
      index: 0,
      actionIndex: null,
      label: "Initial state",
      snapshot: snapshot([1]),
      perspectivePlayerId: p1,
      previousEventSeqByPlayer: new Map(),
    });
    if (frame === undefined) {
      throw new Error("Expected display frame.");
    }
    const artifact = createReplayDisplayArtifact({
      perspectivePlayerId: p1,
      frames: [frame.frame],
    });

    expect(replayDisplayArtifactByteSize(artifact)).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/replay-display-artifact.test.ts
```

Expected: fail with a missing `replay-display-artifact.js` module.

- [ ] **Step 3: Implement `replay-display-artifact.ts`**

Create `packages/match-server/src/replay-display-artifact.ts`:

```ts
import type { PlayerId, PlayerView } from "@optcg/types";

import { canonicalJson } from "./canonical-json.js";
import type {
  DevMatchSnapshot,
  DevPlayerSnapshot,
} from "./dev-snapshot-types.js";

export interface ReplayDisplayPlayerSnapshotV1 {
  readonly view: PlayerView;
  readonly actions: readonly [];
}

export interface ReplayDisplaySnapshotV1 {
  readonly stateSeq: number;
  readonly actionSeq: number;
  readonly stateHash: string;
  readonly status: string;
  readonly turn: DevMatchSnapshot["turn"];
  readonly activePlayerId: PlayerId;
  readonly playerLabels?: DevMatchSnapshot["playerLabels"];
  readonly players: Readonly<Record<PlayerId, ReplayDisplayPlayerSnapshotV1>>;
}

export interface ReplayDisplayFrameV1 {
  readonly index: number;
  readonly actionIndex: number | null;
  readonly label: string;
  readonly perspectivePlayerId: PlayerId;
  readonly stateSeq: number;
  readonly actionSeq: number;
  readonly status: string;
  readonly activePlayerId: PlayerId;
  readonly snapshot: ReplayDisplaySnapshotV1;
}

export interface ReplayDisplayArtifactV1 {
  readonly replayDisplayVersion: "display-v1";
  readonly perspectivePlayerId: PlayerId;
  readonly frameCount: number;
  readonly frames: readonly ReplayDisplayFrameV1[];
}

export interface ReplayDisplayFrameResult {
  readonly frame: ReplayDisplayFrameV1;
  readonly nextEventSeqByPlayer: ReadonlyMap<PlayerId, number>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const eventSeq = (event: unknown): number | undefined =>
  isRecord(event) && typeof event["seq"] === "number"
    ? event["seq"]
    : undefined;

const isZoneRef = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value["playerId"] === "string" &&
  typeof value["zone"] === "string";

const isOptionalStringList = (value: unknown): boolean =>
  value === undefined ||
  (Array.isArray(value) && value.every((item) => typeof item === "string"));

const isPublicCardView = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value["instanceId"] === "string" &&
  typeof value["cardId"] === "string" &&
  typeof value["owner"] === "string" &&
  typeof value["controller"] === "string" &&
  isZoneRef(value["zone"]) &&
  (value["state"] === undefined || typeof value["state"] === "string") &&
  typeof value["attachedDonCount"] === "number" &&
  Array.isArray(value["attachedDonIds"]) &&
  value["attachedDonIds"].every((item) => typeof item === "string") &&
  isOptionalStringList(value["keywords"]) &&
  isOptionalStringList(value["restrictions"]);

const isTerminalStatus = (status: unknown): boolean =>
  status === "completed" || status === "gameOver";

const isPublicLifeView = (
  value: unknown,
  options: { readonly terminalStatus: boolean },
): boolean =>
  isRecord(value) &&
  typeof value["count"] === "number" &&
  Array.isArray(value["faceUpCards"]) &&
  (options.terminalStatus ? value["faceUpCards"].length === 0 : true) &&
  value["faceUpCards"].every(isPublicCardView);

const isVisiblePlayerState = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value["playerId"] === "string" &&
  typeof value["deckCount"] === "number" &&
  value["deck"] === undefined &&
  typeof value["donDeckCount"] === "number" &&
  value["donDeck"] === undefined &&
  Array.isArray(value["hand"]) &&
  value["hand"].every(isPublicCardView) &&
  Array.isArray(value["trash"]) &&
  value["trash"].every(isPublicCardView) &&
  isPublicCardView(value["leader"]) &&
  Array.isArray(value["characters"]) &&
  value["characters"].every(isPublicCardView) &&
  (value["stage"] === undefined || isPublicCardView(value["stage"])) &&
  Array.isArray(value["costArea"]) &&
  value["costArea"].every(isPublicCardView) &&
  isPublicLifeView(value["life"], { terminalStatus: false }) &&
  typeof value["hasMulliganed"] === "boolean" &&
  typeof value["turnCount"] === "number";

const isOpponentVisibleState = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value["playerId"] === "string" &&
  typeof value["deckCount"] === "number" &&
  value["deck"] === undefined &&
  typeof value["donDeckCount"] === "number" &&
  value["donDeck"] === undefined &&
  typeof value["handCount"] === "number" &&
  value["hand"] === undefined &&
  Array.isArray(value["trash"]) &&
  value["trash"].every(isPublicCardView) &&
  isPublicCardView(value["leader"]) &&
  Array.isArray(value["characters"]) &&
  value["characters"].every(isPublicCardView) &&
  (value["stage"] === undefined || isPublicCardView(value["stage"])) &&
  Array.isArray(value["costArea"]) &&
  value["costArea"].every(isPublicCardView) &&
  isPublicLifeView(value["life"], { terminalStatus: false }) &&
  typeof value["hasMulliganed"] === "boolean" &&
  typeof value["turnCount"] === "number";

const compactViewEvents = (
  view: PlayerView,
  previousMaxSeq: number,
): PlayerView["events"] =>
  view.events.filter((event) => {
    const seq = eventSeq(event);
    return seq === undefined || seq > previousMaxSeq;
  });

const stripTerminalLifeIdentities = (
  status: DevMatchSnapshot["status"],
  life: PlayerView["self"]["life"],
): PlayerView["self"]["life"] =>
  status === "completed" || status === "gameOver"
    ? { count: life.count, faceUpCards: [] }
    : life;

const sanitizeDisplayView = ({
  previousMaxSeq,
  status,
  view,
}: {
  readonly view: PlayerView;
  readonly status: DevMatchSnapshot["status"];
  readonly previousMaxSeq: number;
}): PlayerView => {
  const {
    deck: _selfDeck,
    donDeck: _selfDonDeck,
    ...selfWithoutPrivateDecks
  } = view.self;
  const {
    deck: _opponentDeck,
    donDeck: _opponentDonDeck,
    hand: _opponentHand,
    ...opponentWithoutPrivateZones
  } = view.opponent;
  return {
    ...view,
    self: {
      ...selfWithoutPrivateDecks,
      life: stripTerminalLifeIdentities(status, view.self.life),
    },
    opponent: {
      ...opponentWithoutPrivateZones,
      life: stripTerminalLifeIdentities(status, view.opponent.life),
    },
    legalActions: [],
    events: compactViewEvents(view, previousMaxSeq),
  };
};

const nextEventSeq = (
  player: DevPlayerSnapshot,
  previousMaxSeq: number,
): number =>
  player.view.events.reduce((maxSeq, event) => {
    const seq = eventSeq(event);
    return seq === undefined ? maxSeq : Math.max(maxSeq, seq);
  }, previousMaxSeq);

export const createReplayDisplayFrameFromSnapshot = ({
  actionIndex,
  index,
  label,
  perspectivePlayerId,
  previousEventSeqByPlayer,
  snapshot,
}: {
  readonly index: number;
  readonly actionIndex: number | null;
  readonly label: string;
  readonly perspectivePlayerId: PlayerId;
  readonly snapshot: DevMatchSnapshot;
  readonly previousEventSeqByPlayer: ReadonlyMap<PlayerId, number>;
}): ReplayDisplayFrameResult | undefined => {
  const perspectivePlayer = snapshot.players[perspectivePlayerId];
  if (perspectivePlayer === undefined) {
    return undefined;
  }
  const next = new Map(previousEventSeqByPlayer);
  const previousMaxSeq = previousEventSeqByPlayer.get(perspectivePlayerId) ?? 0;
  next.set(
    perspectivePlayerId,
    nextEventSeq(perspectivePlayer, previousMaxSeq),
  );
  const players: Record<PlayerId, ReplayDisplayPlayerSnapshotV1> = {
    [perspectivePlayerId]: {
      view: {
        ...sanitizeDisplayView({
          view: perspectivePlayer.view,
          status: snapshot.status,
          previousMaxSeq,
        }),
      },
      actions: [],
    },
  };
  const displaySnapshot: ReplayDisplaySnapshotV1 = {
    stateSeq: snapshot.stateSeq,
    actionSeq: snapshot.actionSeq,
    stateHash: snapshot.stateHash,
    status: snapshot.status,
    turn: snapshot.turn,
    activePlayerId: snapshot.activePlayerId,
    ...(snapshot.playerLabels === undefined
      ? {}
      : { playerLabels: snapshot.playerLabels }),
    players,
  };
  return {
    frame: {
      index,
      actionIndex,
      label,
      perspectivePlayerId,
      stateSeq: snapshot.stateSeq,
      actionSeq: snapshot.actionSeq,
      status: snapshot.status,
      activePlayerId: snapshot.activePlayerId,
      snapshot: displaySnapshot,
    },
    nextEventSeqByPlayer: next,
  };
};

export const createReplayDisplayArtifact = ({
  frames,
  perspectivePlayerId,
}: {
  readonly perspectivePlayerId: PlayerId;
  readonly frames: readonly ReplayDisplayFrameV1[];
}): ReplayDisplayArtifactV1 => ({
  replayDisplayVersion: "display-v1",
  perspectivePlayerId,
  frameCount: frames.length,
  frames,
});

const isReplayDisplayPlayerViewV1 = (
  value: unknown,
  perspectivePlayerId: string,
  status: string,
): boolean => {
  if (!isRecord(value)) {
    return false;
  }
  const self = value["self"];
  const opponent = value["opponent"];
  return (
    typeof value["matchId"] === "string" &&
    value["playerId"] === perspectivePlayerId &&
    typeof value["stateSeq"] === "number" &&
    typeof value["actionSeq"] === "number" &&
    isRecord(value["turn"]) &&
    typeof value["turn"]["turnPlayerId"] === "string" &&
    typeof value["turn"]["globalTurn"] === "number" &&
    isRecord(value["turn"]["playerTurnCounts"]) &&
    typeof value["turn"]["phase"] === "string" &&
    isVisiblePlayerState(self) &&
    self["playerId"] === perspectivePlayerId &&
    isPublicLifeView(self["life"], {
      terminalStatus: isTerminalStatus(status),
    }) &&
    isOpponentVisibleState(opponent) &&
    opponent["playerId"] !== perspectivePlayerId &&
    isPublicLifeView(opponent["life"], {
      terminalStatus: isTerminalStatus(status),
    }) &&
    isRecord(value["timers"]) &&
    Array.isArray(value["revealedCards"]) &&
    Array.isArray(value["events"]) &&
    Array.isArray(value["legalActions"]) &&
    value["legalActions"].length === 0
  );
};

const isReplayDisplayPlayerSnapshotV1 = (
  value: unknown,
  perspectivePlayerId: string,
  status: string,
): boolean =>
  isRecord(value) &&
  Array.isArray(value["actions"]) &&
  value["actions"].length === 0 &&
  isReplayDisplayPlayerViewV1(value["view"], perspectivePlayerId, status);

const hasOnlyPerspectivePlayer = (
  players: Record<string, unknown>,
  perspectivePlayerId: string,
  status: string,
): boolean => {
  const playerIds = Object.keys(players);
  return (
    playerIds.length === 1 &&
    playerIds[0] === perspectivePlayerId &&
    isReplayDisplayPlayerSnapshotV1(
      players[perspectivePlayerId],
      perspectivePlayerId,
      status,
    )
  );
};

const isReplayDisplayFrameV1 = (
  value: unknown,
  perspectivePlayerId: string,
): value is ReplayDisplayFrameV1 => {
  if (
    !isRecord(value) ||
    typeof value["index"] !== "number" ||
    (typeof value["actionIndex"] !== "number" &&
      value["actionIndex"] !== null) ||
    typeof value["label"] !== "string" ||
    typeof value["perspectivePlayerId"] !== "string" ||
    value["perspectivePlayerId"] !== perspectivePlayerId ||
    typeof value["stateSeq"] !== "number" ||
    typeof value["actionSeq"] !== "number" ||
    typeof value["status"] !== "string" ||
    typeof value["activePlayerId"] !== "string" ||
    !isRecord(value["snapshot"])
  ) {
    return false;
  }
  const snapshot = value["snapshot"];
  const players = snapshot["players"];
  if (
    typeof snapshot["stateSeq"] !== "number" ||
    typeof snapshot["actionSeq"] !== "number" ||
    typeof snapshot["stateHash"] !== "string" ||
    typeof snapshot["status"] !== "string" ||
    snapshot["status"] !== value["status"] ||
    !isRecord(snapshot["turn"]) ||
    typeof snapshot["activePlayerId"] !== "string"
  ) {
    return false;
  }
  return (
    isRecord(players) &&
    hasOnlyPerspectivePlayer(players, perspectivePlayerId, value["status"])
  );
};

export const isReplayDisplayArtifactV1 = (
  value: unknown,
): value is ReplayDisplayArtifactV1 =>
  isRecord(value) &&
  value["replayDisplayVersion"] === "display-v1" &&
  typeof value["perspectivePlayerId"] === "string" &&
  typeof value["frameCount"] === "number" &&
  Array.isArray(value["frames"]) &&
  value["frameCount"] > 0 &&
  value["frames"].length === value["frameCount"] &&
  value["frames"].every((frame) =>
    isReplayDisplayFrameV1(frame, value["perspectivePlayerId"]),
  );

export const replayDisplayArtifactByteSize = (
  artifact: ReplayDisplayArtifactV1,
): number => Buffer.byteLength(canonicalJson(artifact), "utf8");
```

This intentionally stores exactly one filtered `PlayerView` for the fixed replay perspective, not raw `GameState` and not both players' views. It strips both outer actions and `view.legalActions`, compacts events, and can still include the perspective player's own hand because that is visible to that perspective during live play. Later spectator-only replay privacy can add a separate projection; do not mix that into this rework.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/replay-display-artifact.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/match-server/src/replay-display-artifact.ts packages/match-server/src/replay-display-artifact.test.ts
git commit -m "feat: add replay display artifact contract"
```

---

### Task 2: Attach Display Frames To Deterministic Records At Capture Time

**Files:**

- Modify: `packages/match-server/src/session-types.ts`
- Modify: `packages/match-server/src/deterministic-entry-builder.ts`
- Modify: `packages/match-server/src/match-session.ts`
- Modify: `packages/match-server/src/match-session.test.ts`

- [ ] **Step 1: Add a failing assertion to the existing persistence test**

In `packages/match-server/src/match-session.test.ts`, update the existing test named `persists accepted records and server-only snapshots`. After the assertion that `loadedAfterFlush?.deterministicEntriesSinceSnapshot` has length `1`, add:

```ts
const deterministicRecord =
  loadedAfterFlush?.deterministicEntriesSinceSnapshot?.[0];
expect(deterministicRecord?.replayDisplayFrame).toMatchObject({
  index: 1,
  actionIndex: 0,
  label: "submitAction",
  perspectivePlayerId: expect.any(String),
  snapshot: {
    players: expect.any(Object),
  },
});
expect(JSON.stringify(deterministicRecord?.audit.result)).not.toContain(
  "snapshot",
);
expect(JSON.stringify(deterministicRecord?.deterministicEntry)).not.toContain(
  "snapshot",
);

const displayFrames = runtime.replayDisplayFrames();
expect(displayFrames).toHaveLength(2);
expect(displayFrames[0]).toMatchObject({
  index: 0,
  actionIndex: null,
  label: "Initial state",
  perspectivePlayerId: "p1",
});
expect(displayFrames[1]).toMatchObject({
  index: 1,
  actionIndex: 0,
  label: "submitAction",
  perspectivePlayerId: "p1",
});
```

Also add this focused test in the same file to prevent new zero-action matches from looking like legacy rows:

```ts
test("captures an initial replay display frame before any accepted action", async () => {
  const { runtime } = await createRuntime();

  expect(runtime.deterministicRecords()).toHaveLength(0);
  expect(runtime.replayDisplayFrames()).toHaveLength(1);
  expect(runtime.replayDisplayFrames()[0]).toMatchObject({
    index: 0,
    actionIndex: null,
    label: "Initial state",
    perspectivePlayerId: "p1",
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/match-session.test.ts
```

Expected: fail because `replayDisplayFrame` is undefined.

- [ ] **Step 3: Extend stored deterministic records**

In `packages/match-server/src/session-types.ts`, import the type:

```ts
import type { ReplayDisplayFrameV1 } from "./replay-display-artifact.js";
```

Extend `StoredDeterministicSessionRecord`:

```ts
export interface StoredDeterministicSessionRecord {
  readonly deterministicEntry: DeterministicMatchEntry;
  readonly audit: StoredSessionAuditRecord;
  readonly replayDisplayFrame?: ReplayDisplayFrameV1 | undefined;
}
```

- [ ] **Step 4: Pass the optional frame through the deterministic entry builder**

In `packages/match-server/src/deterministic-entry-builder.ts`, add to `BuildStoredDeterministicSessionRecordInput`:

```ts
readonly replayDisplayFrame?: StoredDeterministicSessionRecord["replayDisplayFrame"];
```

Update `buildStoredDeterministicSessionRecord`:

```ts
export const buildStoredDeterministicSessionRecord = (
  input: BuildStoredDeterministicSessionRecordInput,
): StoredDeterministicSessionRecord => ({
  deterministicEntry: deterministicEntry(input),
  audit: auditRecord(input),
  ...(input.replayDisplayFrame === undefined
    ? {}
    : { replayDisplayFrame: input.replayDisplayFrame }),
});
```

- [ ] **Step 5: Build display frames in `match-session.ts`**

In `packages/match-server/src/match-session.ts`, import:

```ts
import { createReplayDisplayFrameFromSnapshot } from "./replay-display-artifact.js";
import type { ReplayDisplayFrameV1 } from "./replay-display-artifact.js";
```

Also update the existing `@optcg/types` import:

```ts
import type {
  DeterministicCheckpoint,
  GameState,
  PlayerId,
} from "@optcg/types";
```

Inside `createMatchSessionRuntime`, add after `const deterministicCheckpointIds = new Set<string>();`:

```ts
let replayDisplayFrameCount = 0;
let replayDisplayEventSeqByPlayer = new Map<PlayerId, number>();
let replayDisplayPerspectivePlayerId: PlayerId | undefined =
  metadata?.playerIds[0] ??
  (Object.keys(local.state.players)[0] as PlayerId | undefined);
const replayDisplayFrames: ReplayDisplayFrameV1[] = [];
```

Immediately after the initial checkpoint recording calls, capture the initial display frame:

```ts
if (replayDisplayPerspectivePlayerId !== undefined) {
  const initialDisplayFrameResult = createReplayDisplayFrameFromSnapshot({
    index: replayDisplayFrameCount,
    actionIndex: null,
    label: "Initial state",
    snapshot: getLocalDevSnapshot(local),
    perspectivePlayerId: replayDisplayPerspectivePlayerId,
    previousEventSeqByPlayer: replayDisplayEventSeqByPlayer,
  });
  if (initialDisplayFrameResult !== undefined) {
    replayDisplayFrames.push(initialDisplayFrameResult.frame);
    replayDisplayFrameCount += 1;
    replayDisplayEventSeqByPlayer = new Map(
      initialDisplayFrameResult.nextEventSeqByPlayer,
    );
  }
}
```

When calling `buildStoredDeterministicSessionRecord`, compute the optional frame immediately before the call:

```ts
if (
  replayDisplayPerspectivePlayerId === undefined &&
  result.snapshot !== undefined
) {
  replayDisplayPerspectivePlayerId = envelope.playerId;
}
const displayFrameResult =
  replayDisplayPerspectivePlayerId === undefined
    ? undefined
    : (() => {
        const displaySnapshot = result.snapshot ?? getLocalDevSnapshot(local);
        return createReplayDisplayFrameFromSnapshot({
          index: replayDisplayFrameCount,
          actionIndex: entrySeq,
          label: envelope.request.type,
          snapshot: displaySnapshot,
          perspectivePlayerId: replayDisplayPerspectivePlayerId,
          previousEventSeqByPlayer: replayDisplayEventSeqByPlayer,
        });
      })();
if (displayFrameResult !== undefined) {
  replayDisplayFrames.push(displayFrameResult.frame);
  replayDisplayFrameCount += 1;
  replayDisplayEventSeqByPlayer = new Map(
    displayFrameResult.nextEventSeqByPlayer,
  );
}
```

Pass it into the builder:

```ts
replayDisplayFrame: displayFrameResult?.frame,
```

Do not add display frames for rejected actions.

Also add a test that constructs `createMatchSessionRuntime({ local, includeActionSnapshots: false })`, applies one accepted deterministic action, and asserts:

```ts
expect(runtime.replayDisplayFrames()).toHaveLength(2);
expect(runtime.replayDisplayFrames()[1]).toMatchObject({
  actionIndex: 0,
  label: "submitAction",
});
expect(runtime.records()[0]?.result.snapshot).toBeUndefined();
expect(
  runtime.deterministicRecords()[0]?.audit.result.snapshot,
).toBeUndefined();
```

This proves the production HTTP setting captures action display frames without reintroducing persisted action/audit snapshots.

- [ ] **Step 6: Expose display frames and preserve frame data during compaction**

Add to `MatchSessionRuntime`:

```ts
replayDisplayFrames: () => readonly ReplayDisplayFrameV1[];
```

Add the runtime method:

```ts
replayDisplayFrames: () => replayDisplayFrames,
```

Keep action frames attached to deterministic records during compaction:

In `compactStoredDeterministicSessionRecord`, keep the field:

```ts
...(record.replayDisplayFrame === undefined
  ? {}
  : { replayDisplayFrame: record.replayDisplayFrame }),
```

- [ ] **Step 7: Run the session tests**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/match-session.test.ts packages/match-server/src/deterministic-entry-builder.test.ts
```

Expected: pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add packages/match-server/src/session-types.ts packages/match-server/src/deterministic-entry-builder.ts packages/match-server/src/match-session.ts packages/match-server/src/match-session.test.ts
git commit -m "feat: capture replay display frames in session records"
```

---

### Task 3: Persist Display Artifact On Completed Matches And In Replay SQL

**Files:**

- Modify: `contracts/database-schema-v6.sql`
- Modify: `specs/08-replay-rollback-recovery.md`
- Modify: `specs/10-database-schema.md`
- Modify: `specs/spec-manifest.json`
- Modify: `specs/section-index.json`
- Modify: `tests/contracts/database-schema-contract.test.mjs`
- Modify: `packages/match-server/src/local-completed-match-record.ts`
- Modify: `packages/match-server/src/local-completed-match-record.test.ts`
- Modify: `packages/match-server/src/dev-local-match-registry.ts`
- Modify: `packages/match-server/src/postgres-completed-match.ts`
- Modify: `packages/match-server/src/postgres-completed-match.test.ts`

- [ ] **Step 1: Write the failing local completed-match test**

In `packages/match-server/src/local-completed-match-record.test.ts`, add a focused test that builds a completed record with one deterministic record containing `replayDisplayFrame`. Pass the same frame through `replayDisplayFrames: [storedRecord.replayDisplayFrame]`; completed-match persistence must read display frames from that explicit list, not by mining deterministic entries. Use the existing imports and helpers in this file. The assertion must be:

```ts
expect(record?.replay.replayDisplayArtifact).toMatchObject({
  replayDisplayVersion: "display-v1",
  perspectivePlayerId: expect.any(String),
  frameCount: 1,
  frames: [{ label: "submitAction" }],
});
expect(JSON.stringify(record?.replay.deterministicEntries)).not.toContain(
  "replayDisplayFrame",
);
expect(JSON.stringify(record?.replay.deterministicEntries)).not.toContain(
  "snapshot",
);
```

Also add a focused zero-action test. Build one initial frame with `createReplayDisplayFrameFromSnapshot({ actionIndex: null, label: "Initial state", snapshot: getLocalDevSnapshot(match), perspectivePlayerId: setup.playerOrder[0], previousEventSeqByPlayer: new Map() })`, pass it as `replayDisplayFrames`, and pass `deterministicRecords: []`. Assert:

```ts
expect(record?.replay.replayDisplayArtifact).toMatchObject({
  replayDisplayVersion: "display-v1",
  perspectivePlayerId: setup.playerOrder[0],
  frameCount: 1,
  frames: [{ actionIndex: null, label: "Initial state" }],
});
expect(record?.replay.deterministicEntries).toEqual([]);
```

- [ ] **Step 2: Run the failing local completed-match test**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/local-completed-match-record.test.ts
```

Expected: fail because `replayDisplayArtifact` is not written.

- [ ] **Step 3: Write display artifact in `local-completed-match-record.ts`**

Import:

```ts
import { createReplayDisplayArtifact } from "./replay-display-artifact.js";
import type { ReplayDisplayFrameV1 } from "./replay-display-artifact.js";
```

Add to `BuildLocalCompletedMatchRecordInput`:

```ts
readonly replayDisplayFrames: readonly ReplayDisplayFrameV1[];
```

Before the returned object, add:

```ts
const replayDisplayFrames = input.replayDisplayFrames;
const replayDisplayPerspectivePlayerId =
  replayDisplayFrames[0]?.perspectivePlayerId;
const replayDisplayArtifact =
  replayDisplayPerspectivePlayerId === undefined
    ? null
    : createReplayDisplayArtifact({
        perspectivePlayerId: replayDisplayPerspectivePlayerId,
        frames: replayDisplayFrames,
      });
```

Add to `replay`:

```ts
replayDisplayArtifact:
  replayDisplayArtifact === null ? null : jsonObject(replayDisplayArtifact),
```

Update all `buildLocalCompletedMatchRecord(...)` call sites in tests to pass `replayDisplayFrames`. The focused replay-display tests must pass a non-empty initial/display frame list. Existing tests that are explicitly exercising legacy/null replay behavior may pass `replayDisplayFrames: []`; normal new completed-match tests should pass at least the initial frame.

In `packages/match-server/src/dev-local-match-registry.ts`, pass the runtime display frames into completed-match persistence:

```ts
replayDisplayFrames: runtime?.replayDisplayFrames() ?? [],
```

This is the production path for new local completed matches; it must not derive display frames from `deterministicRecords` alone. Add or update a registry/completed-match persistence test so a completed match with no accepted deterministic action records still saves a non-null `display-v1` artifact from `runtime.replayDisplayFrames()`.

Add another registry/server-path test that runs through `createMatchHttpServer(...)`, where sessions use `includeActionSnapshots: false`, completes a match after at least one accepted deterministic action, and asserts the saved replay display artifact has at least two frames:

```ts
expect(savedRecord?.replay.replayDisplayArtifact).toMatchObject({
  replayDisplayVersion: "display-v1",
  frames: [
    { actionIndex: null, label: "Initial state" },
    { actionIndex: 0, label: "submitAction" },
  ],
});
```

This prevents the production path from saving only the initial frame while unit tests with action snapshots pass.

- [ ] **Step 4: Add `replay_display_artifact` to the schema contract**

In `specs/08-replay-rollback-recovery.md`, add a new section after `08-replay-rollback-recovery.s036`:

```md
## Replay display derivative

<!-- SECTION_REF: 08-replay-rollback-recovery.s037 -->

Section Ref: `08-replay-rollback-recovery.s037`

The authoritative replay/audit artifact remains full-information under `08-replay-rollback-recovery.s036`. A replay display artifact such as `display-v1` is a compact client playback derivative, not the authoritative replay artifact. It may store perspective-filtered `PlayerView` frames for cheap UI playback, but it must not replace deterministic entries, checkpoints, full-information audit data, or moderation/report replay data. If a display derivative is missing or invalid, consumers may fall back to legacy reconstruction or authoritative replay tooling according to the route policy.
```

This resolves the apparent conflict between full-information replay storage and the compact display artifact.

In `contracts/database-schema-v6.sql`, add this column to `CREATE TABLE match_replays` after `checkpoints JSONB NOT NULL DEFAULT '[]'::jsonb,`:

```sql
  replay_display_artifact JSONB,
```

Add this check near the existing JSON checks:

```sql
  CHECK (replay_display_artifact IS NULL OR jsonb_typeof(replay_display_artifact) = 'object'),
```

Make the same column/check change in the explanatory snippet in `specs/10-database-schema.md`.

The column must be nullable. Existing/legacy rows must remain distinguishable from new `display-v1` rows; do not use a non-null default empty artifact.

- [ ] **Step 5: Regenerate spec metadata**

Run:

```bash
corepack pnpm run specs:generate-metadata
corepack pnpm run specs:verify-metadata
```

Expected: both commands pass, and `specs/spec-manifest.json` plus `specs/section-index.json` reflect the new `08-replay-rollback-recovery.s037` section and schema-spec edits.

- [ ] **Step 6: Update the database contract test**

In `tests/contracts/database-schema-contract.test.mjs`, add:

```js
assert.match(schemaSql, /replay_display_artifact\s+JSONB/i);
assert.doesNotMatch(schemaSql, /replay_display_artifact\s+JSONB\s+NOT\s+NULL/i);
assert.match(
  schemaSql,
  /CHECK\s*\(\s*replay_display_artifact\s+IS\s+NULL\s+OR\s+jsonb_typeof\s*\(\s*replay_display_artifact\s*\)\s*=\s*'object'\s*\)/i,
);
```

- [ ] **Step 7: Wire `postgres-completed-match.ts` writes**

In `CompletedMatchReplayRecord`, add:

```ts
readonly replayDisplayArtifact: JsonObject | null;
```

In `replayValues`, insert `replay.replayDisplayArtifact === null ? null : jsonParam(replay.replayDisplayArtifact)` after `jsonParam(replay.checkpoints)`.

In `createSaveReplaySql`, add `replay_display_artifact` after `checkpoints`, add one new `$` placeholder cast as `::jsonb`, and renumber the following placeholders by one.

In the `ON CONFLICT` update list, add:

```sql
    replay_display_artifact = EXCLUDED.replay_display_artifact,
```

- [ ] **Step 8: Wire replay detail reads**

In both `replayDetailSql` and `replayPublicDetailSql`, add:

```sql
      'replayDisplayArtifact', replay.replay_display_artifact,
```

to the `jsonb_build_object(...)` replay payload. Public detail must include it because the viewer uses public replay detail.

- [ ] **Step 9: Write and run persistence tests**

In `packages/match-server/src/postgres-completed-match.test.ts`, update the replay fixture object used by the save/read round-trip to include:

```ts
replayDisplayArtifact: {
  replayDisplayVersion: "display-v1",
  perspectivePlayerId: "p1",
  frameCount: 1,
  frames: [
    {
      index: 0,
      actionIndex: null,
      label: "Initial state",
      perspectivePlayerId: "p1",
      stateSeq: 1,
      actionSeq: 0,
      status: "active",
      activePlayerId: "p1",
      snapshot: {
        stateSeq: 1,
        actionSeq: 0,
        stateHash: "hash-1",
        status: "active",
        turn: {
          turnPlayerId: "p1",
          globalTurn: 1,
          playerTurnCounts: { p1: 1, p2: 0 },
          phase: "main",
        },
        activePlayerId: "p1",
        players: {
          p1: {
            view: {
              playerId: "p1",
              matchId: "match-1",
              stateSeq: 1,
              actionSeq: 0,
              turn: {
                turnPlayerId: "p1",
                globalTurn: 1,
                playerTurnCounts: { p1: 1, p2: 0 },
                phase: "main",
              },
              self: {
                playerId: "p1",
                deckCount: 40,
                donDeckCount: 10,
                hand: [],
                trash: [],
                leader: {
                  instanceId: "leader-1",
                  cardId: "L1",
                  owner: "p1",
                  controller: "p1",
                  zone: { playerId: "p1", zone: "leader" },
                  attachedDonCount: 0,
                  attachedDonIds: [],
                },
                characters: [],
                costArea: [],
                life: { count: 5, faceUpCards: [] },
                hasMulliganed: false,
                turnCount: 1,
              },
              opponent: {
                playerId: "p2",
                deckCount: 40,
                donDeckCount: 10,
                handCount: 5,
                trash: [],
                leader: {
                  instanceId: "leader-2",
                  cardId: "L2",
                  owner: "p2",
                  controller: "p2",
                  zone: { playerId: "p2", zone: "leader" },
                  attachedDonCount: 0,
                  attachedDonIds: [],
                },
                characters: [],
                costArea: [],
                life: { count: 5, faceUpCards: [] },
                hasMulliganed: false,
                turnCount: 1,
              },
              timers: { players: {} },
              legalActions: [],
              revealedCards: [],
              events: [],
            },
            actions: [],
          },
        },
      },
    },
  ],
},
```

Assert the read replay contains the same `replayDisplayArtifact`.

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/local-completed-match-record.test.ts packages/match-server/src/dev-local-match-registry.test.ts packages/match-server/src/postgres-completed-match.test.ts tests/contracts/database-schema-contract.test.mjs
```

Expected: pass.

- [ ] **Step 10: Commit**

Run:

```bash
git add contracts/database-schema-v6.sql specs/08-replay-rollback-recovery.md specs/10-database-schema.md specs/spec-manifest.json specs/section-index.json tests/contracts/database-schema-contract.test.mjs packages/match-server/src/local-completed-match-record.ts packages/match-server/src/local-completed-match-record.test.ts packages/match-server/src/dev-local-match-registry.ts packages/match-server/src/postgres-completed-match.ts packages/match-server/src/postgres-completed-match.test.ts
git commit -m "feat: persist replay display artifacts"
```

---

### Task 4: Serve Display Artifact And Stop Detail-Time Frame Reconstruction

**Files:**

- Modify: `packages/match-server/src/replay-route.ts`
- Modify: `packages/match-server/src/replay-frame-cache.ts`
- Modify: `packages/match-server/src/match-http-server-replay.test.ts`
- Modify: `packages/client/src/replay-client.ts`
- Modify: `packages/client/src/replay-client.test.ts`

- [ ] **Step 1: Update replay route tests for display-v1 detail**

In `packages/match-server/src/match-http-server-replay.test.ts`, update `replayDetail()` so `replay.replay` includes:

```ts
replayDisplayArtifact: {
  replayDisplayVersion: "display-v1",
  perspectivePlayerId: "p1",
  frameCount: 1,
  frames: [
    {
      index: 0,
      actionIndex: null,
      label: "Initial state",
      perspectivePlayerId: "p1",
      stateSeq: 1,
      actionSeq: 0,
      status: "active",
      activePlayerId: "p1",
      snapshot: {
        stateSeq: 1,
        actionSeq: 0,
        stateHash: "hash-1",
        status: "active",
        turn: {
          turnPlayerId: "p1",
          globalTurn: 1,
          playerTurnCounts: { p1: 1, p2: 0 },
          phase: "main",
        },
        activePlayerId: "p1",
        players: {
          p1: {
            view: {
              playerId: "p1",
              matchId: "match-1",
              stateSeq: 1,
              actionSeq: 0,
              turn: {
                turnPlayerId: "p1",
                globalTurn: 1,
                playerTurnCounts: { p1: 1, p2: 0 },
                phase: "main",
              },
              self: {
                playerId: "p1",
                deckCount: 40,
                donDeckCount: 10,
                hand: [],
                trash: [],
                leader: {
                  instanceId: "leader-1",
                  cardId: "L1",
                  owner: "p1",
                  controller: "p1",
                  zone: { playerId: "p1", zone: "leader" },
                  attachedDonCount: 0,
                  attachedDonIds: [],
                },
                characters: [],
                costArea: [],
                life: { count: 5, faceUpCards: [] },
                hasMulliganed: false,
                turnCount: 1,
              },
              opponent: {
                playerId: "p2",
                deckCount: 40,
                donDeckCount: 10,
                handCount: 5,
                trash: [],
                leader: {
                  instanceId: "leader-2",
                  cardId: "L2",
                  owner: "p2",
                  controller: "p2",
                  zone: { playerId: "p2", zone: "leader" },
                  attachedDonCount: 0,
                  attachedDonIds: [],
                },
                characters: [],
                costArea: [],
                life: { count: 5, faceUpCards: [] },
                hasMulliganed: false,
                turnCount: 1,
              },
              timers: { players: {} },
              legalActions: [],
              revealedCards: [],
              events: [],
            },
            actions: [],
          },
        },
      },
    },
  ],
},
```

Update `assertReplayDetailBody` so expected public detail includes `replayDisplayArtifact` and still has `frameReconstruction === undefined`.

- [ ] **Step 2: Add a no-frame-endpoint viewer contract test**

In the same test file, add:

```ts
test("display-v1 replay detail does not require frame chunk reconstruction", async () => {
  const repository = createFakeReplayRepository();
  const server = await createMatchHttpServer({
    createDefaultMatch: false,
    replayRepository: repository,
  });
  await server.listen(0, "127.0.0.1");
  try {
    const response = await fetch(`${server.url()}/api/replays/match-1`);
    const body = (await response.json()) as {
      replay?: CompletedMatchReplayDetail;
      frameReconstruction?: unknown;
    };

    assert.equal(response.status, 200);
    assert.equal(body.frameReconstruction, undefined);
    assert.equal(
      body.replay?.replay["replayDisplayArtifact"] !== undefined,
      true,
    );
    assert.deepEqual(repository.detailCalls, []);
  } finally {
    await server.close();
  }
});
```

- [ ] **Step 3: Run the route test**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/match-http-server-replay.test.ts
```

Expected: pass after public replay detail includes `replayDisplayArtifact`. If it fails, fix repository fake expectations and `replay-route.ts`; do not add frame reconstruction to detail.

- [ ] **Step 4: Add display artifact to local public detail projection**

In `packages/match-server/src/replay-frame-cache.ts`, update `publicReplayDetail(...)` so the allowlist includes:

```ts
"replayDisplayArtifact",
```

This keeps fixture/local public replay detail aligned with Postgres public replay detail.

- [ ] **Step 5: Add client replay payload types**

In `packages/client/src/replay-client.ts`, add:

```ts
export interface ReplayDisplayFramePayload {
  readonly index: number;
  readonly actionIndex: number | null;
  readonly label: string;
  readonly perspectivePlayerId: string;
  readonly stateSeq: number;
  readonly actionSeq: number;
  readonly status: string;
  readonly activePlayerId: string;
  readonly snapshot: unknown;
}

export interface ReplayDisplayArtifactPayload {
  readonly replayDisplayVersion: "display-v1";
  readonly perspectivePlayerId: string;
  readonly frameCount: number;
  readonly frames: readonly ReplayDisplayFramePayload[];
}
```

Add to `ReplayPayload`:

```ts
readonly replayDisplayArtifact?: ReplayDisplayArtifactPayload | null | undefined;
```

- [ ] **Step 6: Add client parser test**

In `packages/client/src/replay-client.test.ts`, add a `getReplay` response fixture with `replay.replayDisplayArtifact` and assert:

```ts
assert.equal(
  replay.replay.replayDisplayArtifact?.replayDisplayVersion,
  "display-v1",
);
assert.equal(replay.frameReconstruction, undefined);
```

Run:

```bash
corepack pnpm exec vitest run packages/client/src/replay-client.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/match-server/src/replay-route.ts packages/match-server/src/replay-frame-cache.ts packages/match-server/src/match-http-server-replay.test.ts packages/client/src/replay-client.ts packages/client/src/replay-client.test.ts
git commit -m "feat: serve replay display artifacts"
```

---

### Task 5: Restore One-Load Local Replay Viewer Playback

**Files:**

- Create: `packages/client/src/react/replay-display-frame.ts`
- Create: `packages/client/src/react/replay-display-frame.test.ts`
- Modify: `packages/client/src/react/ReplayViewerPage.tsx`
- Modify: `packages/client/src/react/ReplayViewerPage.test.ts`
- Modify: `packages/client/src/react/replay-match-client.ts`
- Modify: `packages/client/src/react/replay-match-client.test.ts`

- [ ] **Step 1: Write the failing display adapter test**

Create `packages/client/src/react/replay-display-frame.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import {
  isReplayDisplayArtifactPayload,
  replayFramesFromDisplayArtifact,
} from "./replay-display-frame.js";

describe("replay display frame adapter", () => {
  test("converts display-v1 frames into replay frames", () => {
    const frames = replayFramesFromDisplayArtifact({
      matchId: "match-1",
      manifestSnapshot: {
        cards: {
          L1: { cardId: "L1", name: "Leader", category: "leader" },
          L2: { cardId: "L2", name: "Opponent Leader", category: "leader" },
        },
      },
      artifact: {
        replayDisplayVersion: "display-v1",
        perspectivePlayerId: "p1",
        frameCount: 1,
        frames: [
          {
            index: 0,
            actionIndex: null,
            label: "Initial state",
            perspectivePlayerId: "p1",
            stateSeq: 1,
            actionSeq: 0,
            status: "active",
            activePlayerId: "p1",
            snapshot: {
              stateSeq: 1,
              actionSeq: 0,
              stateHash: "hash-1",
              status: "active",
              turn: {
                turnPlayerId: "p1",
                globalTurn: 1,
                playerTurnCounts: { p1: 1, p2: 0 },
                phase: "main",
              },
              activePlayerId: "p1",
              players: {
                p1: {
                  view: {
                    playerId: "p1",
                    matchId: "match-1",
                    stateSeq: 1,
                    actionSeq: 0,
                    turn: {
                      turnPlayerId: "p1",
                      globalTurn: 1,
                      playerTurnCounts: { p1: 1, p2: 0 },
                      phase: "main",
                    },
                    self: {
                      playerId: "p1",
                      deckCount: 40,
                      donDeckCount: 10,
                      hand: [],
                      trash: [],
                      leader: {
                        instanceId: "leader-1",
                        cardId: "L1",
                        owner: "p1",
                        controller: "p1",
                        zone: { playerId: "p1", zone: "leader" },
                        attachedDonCount: 0,
                        attachedDonIds: [],
                      },
                      characters: [],
                      costArea: [],
                      life: { count: 5, faceUpCards: [] },
                      hasMulliganed: false,
                      turnCount: 1,
                    },
                    opponent: {
                      playerId: "p2",
                      deckCount: 40,
                      donDeckCount: 10,
                      handCount: 5,
                      trash: [],
                      leader: {
                        instanceId: "leader-2",
                        cardId: "L2",
                        owner: "p2",
                        controller: "p2",
                        zone: { playerId: "p2", zone: "leader" },
                        attachedDonCount: 0,
                        attachedDonIds: [],
                      },
                      characters: [],
                      costArea: [],
                      life: { count: 5, faceUpCards: [] },
                      hasMulliganed: false,
                      turnCount: 1,
                    },
                    timers: { players: {} },
                    legalActions: [],
                    revealedCards: [],
                    events: [],
                  },
                  actions: [],
                },
              },
            },
          },
        ],
      },
    });

    expect(frames).toHaveLength(1);
    expect(frames[0]?.index).toBe(0);
    expect(frames[0]?.label).toBe("Initial state");
    expect(frames[0]?.clientState.seat.playerId).toBe("p1");
  });

  test("rejects malformed display-v1 artifacts before conversion", () => {
    expect(
      isReplayDisplayArtifactPayload({
        replayDisplayVersion: "display-v1",
        perspectivePlayerId: "p1",
        frameCount: 1,
        frames: [
          {
            index: 0,
            actionIndex: null,
            label: "bad",
            perspectivePlayerId: "p1",
            stateSeq: 1,
            actionSeq: 0,
            status: "active",
            activePlayerId: "p1",
            snapshot: {
              players: {
                p1: {
                  view: {
                    playerId: "p1",
                    turn: {},
                    self: {},
                    opponent: {},
                    timers: { players: {} },
                    legalActions: [{ type: "endTurn" }],
                    events: [],
                  },
                  actions: [],
                },
              },
            },
          },
        ],
      }),
    ).toBe(false);
    expect(
      isReplayDisplayArtifactPayload({
        replayDisplayVersion: "display-v1",
        perspectivePlayerId: "p1",
        frameCount: 1,
        frames: [
          {
            index: 0,
            actionIndex: null,
            label: "bad-card",
            perspectivePlayerId: "p1",
            stateSeq: 1,
            actionSeq: 0,
            status: "active",
            activePlayerId: "p1",
            snapshot: {
              stateSeq: 1,
              actionSeq: 0,
              stateHash: "hash-1",
              status: "active",
              turn: {
                turnPlayerId: "p1",
                globalTurn: 1,
                playerTurnCounts: { p1: 1, p2: 0 },
                phase: "main",
              },
              activePlayerId: "p1",
              players: {
                p1: {
                  view: {
                    playerId: "p1",
                    matchId: "match-1",
                    stateSeq: 1,
                    actionSeq: 0,
                    turn: {
                      turnPlayerId: "p1",
                      globalTurn: 1,
                      playerTurnCounts: { p1: 1, p2: 0 },
                      phase: "main",
                    },
                    self: {
                      playerId: "p1",
                      deckCount: 40,
                      donDeckCount: 10,
                      hand: [],
                      trash: [],
                      leader: {},
                      characters: [],
                      costArea: [],
                      life: { count: 5, faceUpCards: [] },
                      hasMulliganed: false,
                      turnCount: 1,
                    },
                    opponent: {
                      playerId: "p2",
                      deckCount: 40,
                      donDeckCount: 10,
                      handCount: 5,
                      trash: [],
                      leader: {},
                      characters: [],
                      costArea: [],
                      life: { count: 5, faceUpCards: [] },
                      hasMulliganed: false,
                      turnCount: 1,
                    },
                    timers: { players: {} },
                    legalActions: [],
                    revealedCards: [],
                    events: [],
                  },
                  actions: [],
                },
              },
            },
          },
        ],
      }),
    ).toBe(false);
    expect(
      isReplayDisplayArtifactPayload({
        replayDisplayVersion: "display-v1",
        perspectivePlayerId: "p1",
        frameCount: 1,
        frames: [
          {
            index: 0,
            actionIndex: null,
            label: "private-zone",
            perspectivePlayerId: "p1",
            stateSeq: 1,
            actionSeq: 0,
            status: "active",
            activePlayerId: "p1",
            snapshot: {
              stateSeq: 1,
              actionSeq: 0,
              stateHash: "hash-1",
              status: "active",
              turn: {
                turnPlayerId: "p1",
                globalTurn: 1,
                playerTurnCounts: { p1: 1, p2: 0 },
                phase: "main",
              },
              activePlayerId: "p1",
              players: {
                p1: {
                  view: {
                    playerId: "p1",
                    matchId: "match-1",
                    stateSeq: 1,
                    actionSeq: 0,
                    turn: {
                      turnPlayerId: "p1",
                      globalTurn: 1,
                      playerTurnCounts: { p1: 1, p2: 0 },
                      phase: "main",
                    },
                    self: {
                      playerId: "p1",
                      deckCount: 40,
                      deck: [
                        {
                          instanceId: "deck-1",
                          cardId: "D1",
                          owner: "p1",
                          controller: "p1",
                          zone: { playerId: "p1", zone: "deck" },
                          attachedDonCount: 0,
                          attachedDonIds: [],
                        },
                      ],
                      donDeckCount: 10,
                      hand: [],
                      trash: [],
                      leader: {
                        instanceId: "leader-1",
                        cardId: "L1",
                        owner: "p1",
                        controller: "p1",
                        zone: { playerId: "p1", zone: "leader" },
                        attachedDonCount: 0,
                        attachedDonIds: [],
                      },
                      characters: [],
                      costArea: [],
                      life: { count: 5, faceUpCards: [] },
                      hasMulliganed: false,
                      turnCount: 1,
                    },
                    opponent: {
                      playerId: "p2",
                      deckCount: 40,
                      donDeckCount: 10,
                      handCount: 5,
                      trash: [],
                      leader: {
                        instanceId: "leader-2",
                        cardId: "L2",
                        owner: "p2",
                        controller: "p2",
                        zone: { playerId: "p2", zone: "leader" },
                        attachedDonCount: 0,
                        attachedDonIds: [],
                      },
                      characters: [],
                      costArea: [],
                      life: { count: 5, faceUpCards: [] },
                      hasMulliganed: false,
                      turnCount: 1,
                    },
                    timers: { players: {} },
                    legalActions: [],
                    revealedCards: [],
                    events: [],
                  },
                  actions: [],
                },
              },
            },
          },
        ],
      }),
    ).toBe(false);
    expect(
      isReplayDisplayArtifactPayload({
        replayDisplayVersion: "display-v1",
        perspectivePlayerId: "p1",
        frameCount: 1,
        frames: [
          {
            index: 0,
            actionIndex: null,
            label: "terminal-life",
            perspectivePlayerId: "p1",
            stateSeq: 1,
            actionSeq: 0,
            status: "completed",
            activePlayerId: "p1",
            snapshot: {
              stateSeq: 1,
              actionSeq: 0,
              stateHash: "hash-1",
              status: "completed",
              turn: {
                turnPlayerId: "p1",
                globalTurn: 1,
                playerTurnCounts: { p1: 1, p2: 0 },
                phase: "main",
              },
              activePlayerId: "p1",
              players: {
                p1: {
                  view: {
                    playerId: "p1",
                    matchId: "match-1",
                    stateSeq: 1,
                    actionSeq: 0,
                    turn: {
                      turnPlayerId: "p1",
                      globalTurn: 1,
                      playerTurnCounts: { p1: 1, p2: 0 },
                      phase: "main",
                    },
                    self: {
                      playerId: "p1",
                      deckCount: 40,
                      donDeckCount: 10,
                      hand: [],
                      trash: [],
                      leader: {
                        instanceId: "leader-1",
                        cardId: "L1",
                        owner: "p1",
                        controller: "p1",
                        zone: { playerId: "p1", zone: "leader" },
                        attachedDonCount: 0,
                        attachedDonIds: [],
                      },
                      characters: [],
                      costArea: [],
                      life: {
                        count: 5,
                        faceUpCards: [
                          {
                            instanceId: "terminal-life-1",
                            cardId: "H1",
                            owner: "p1",
                            controller: "p1",
                            zone: { playerId: "p1", zone: "life" },
                            attachedDonCount: 0,
                            attachedDonIds: [],
                          },
                        ],
                      },
                      hasMulliganed: false,
                      turnCount: 1,
                    },
                    opponent: {
                      playerId: "p2",
                      deckCount: 40,
                      donDeckCount: 10,
                      handCount: 5,
                      trash: [],
                      leader: {
                        instanceId: "leader-2",
                        cardId: "L2",
                        owner: "p2",
                        controller: "p2",
                        zone: { playerId: "p2", zone: "leader" },
                        attachedDonCount: 0,
                        attachedDonIds: [],
                      },
                      characters: [],
                      costArea: [],
                      life: { count: 5, faceUpCards: [] },
                      hasMulliganed: false,
                      turnCount: 1,
                    },
                    timers: { players: {} },
                    legalActions: [],
                    revealedCards: [],
                    events: [],
                  },
                  actions: [],
                },
              },
            },
          },
        ],
      }),
    ).toBe(false);
    expect(
      isReplayDisplayArtifactPayload({
        replayDisplayVersion: "display-v1",
        perspectivePlayerId: "p1",
        frameCount: 1,
        frames: [
          {
            index: 0,
            actionIndex: null,
            label: "status-mismatch",
            perspectivePlayerId: "p1",
            stateSeq: 1,
            actionSeq: 0,
            status: "active",
            activePlayerId: "p1",
            snapshot: {
              stateSeq: 1,
              actionSeq: 0,
              stateHash: "hash-1",
              status: "completed",
              turn: {
                turnPlayerId: "p1",
                globalTurn: 1,
                playerTurnCounts: { p1: 1, p2: 0 },
                phase: "main",
              },
              activePlayerId: "p1",
              players: {
                p1: {
                  view: {
                    playerId: "p1",
                    matchId: "match-1",
                    stateSeq: 1,
                    actionSeq: 0,
                    turn: {
                      turnPlayerId: "p1",
                      globalTurn: 1,
                      playerTurnCounts: { p1: 1, p2: 0 },
                      phase: "main",
                    },
                    self: {
                      playerId: "p1",
                      deckCount: 40,
                      donDeckCount: 10,
                      hand: [],
                      trash: [],
                      leader: {
                        instanceId: "leader-1",
                        cardId: "L1",
                        owner: "p1",
                        controller: "p1",
                        zone: { playerId: "p1", zone: "leader" },
                        attachedDonCount: 0,
                        attachedDonIds: [],
                      },
                      characters: [],
                      costArea: [],
                      life: {
                        count: 5,
                        faceUpCards: [
                          {
                            instanceId: "mismatched-life-1",
                            cardId: "H3",
                            owner: "p1",
                            controller: "p1",
                            zone: { playerId: "p1", zone: "life" },
                            attachedDonCount: 0,
                            attachedDonIds: [],
                          },
                        ],
                      },
                      hasMulliganed: false,
                      turnCount: 1,
                    },
                    opponent: {
                      playerId: "p2",
                      deckCount: 40,
                      donDeckCount: 10,
                      handCount: 5,
                      trash: [],
                      leader: {
                        instanceId: "leader-2",
                        cardId: "L2",
                        owner: "p2",
                        controller: "p2",
                        zone: { playerId: "p2", zone: "leader" },
                        attachedDonCount: 0,
                        attachedDonIds: [],
                      },
                      characters: [],
                      costArea: [],
                      life: { count: 5, faceUpCards: [] },
                      hasMulliganed: false,
                      turnCount: 1,
                    },
                    timers: { players: {} },
                    legalActions: [],
                    revealedCards: [],
                    events: [],
                  },
                  actions: [],
                },
              },
            },
          },
        ],
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the failing adapter test**

Run:

```bash
corepack pnpm exec vitest run packages/client/src/react/replay-display-frame.test.ts
```

Expected: fail because `replay-display-frame.ts` does not exist.

- [ ] **Step 3: Extract reusable frame/catalog helpers**

Move `replayFrameFromSnapshot` and the manifest catalog helpers it depends on from `packages/client/src/react/replay-match-client.ts` into `packages/client/src/react/replay-display-frame.ts`. Keep `createReplayMatchClient` in `replay-match-client.ts`, and update `replay-match-client.ts` to import the moved helper for legacy `frameReconstruction` conversion.

The new adapter must validate `snapshot.players` before casting:

```ts
const isZoneRef = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value["playerId"] === "string" &&
  typeof value["zone"] === "string";

const isOptionalStringList = (value: unknown): boolean =>
  value === undefined ||
  (Array.isArray(value) && value.every((item) => typeof item === "string"));

const isPublicCardView = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value["instanceId"] === "string" &&
  typeof value["cardId"] === "string" &&
  typeof value["owner"] === "string" &&
  typeof value["controller"] === "string" &&
  isZoneRef(value["zone"]) &&
  (value["state"] === undefined || typeof value["state"] === "string") &&
  typeof value["attachedDonCount"] === "number" &&
  Array.isArray(value["attachedDonIds"]) &&
  value["attachedDonIds"].every((item) => typeof item === "string") &&
  isOptionalStringList(value["keywords"]) &&
  isOptionalStringList(value["restrictions"]);

const isTerminalStatus = (status: unknown): boolean =>
  status === "completed" || status === "gameOver";

const isPublicLifeView = (
  value: unknown,
  options: { readonly terminalStatus: boolean },
): boolean =>
  isRecord(value) &&
  typeof value["count"] === "number" &&
  Array.isArray(value["faceUpCards"]) &&
  (options.terminalStatus ? value["faceUpCards"].length === 0 : true) &&
  value["faceUpCards"].every(isPublicCardView);

const isVisiblePlayerState = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value["playerId"] === "string" &&
  typeof value["deckCount"] === "number" &&
  value["deck"] === undefined &&
  typeof value["donDeckCount"] === "number" &&
  value["donDeck"] === undefined &&
  Array.isArray(value["hand"]) &&
  value["hand"].every(isPublicCardView) &&
  Array.isArray(value["trash"]) &&
  value["trash"].every(isPublicCardView) &&
  isPublicCardView(value["leader"]) &&
  Array.isArray(value["characters"]) &&
  value["characters"].every(isPublicCardView) &&
  (value["stage"] === undefined || isPublicCardView(value["stage"])) &&
  Array.isArray(value["costArea"]) &&
  value["costArea"].every(isPublicCardView) &&
  isPublicLifeView(value["life"], { terminalStatus: false }) &&
  typeof value["hasMulliganed"] === "boolean" &&
  typeof value["turnCount"] === "number";

const isOpponentVisibleState = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value["playerId"] === "string" &&
  typeof value["deckCount"] === "number" &&
  value["deck"] === undefined &&
  typeof value["donDeckCount"] === "number" &&
  value["donDeck"] === undefined &&
  typeof value["handCount"] === "number" &&
  value["hand"] === undefined &&
  Array.isArray(value["trash"]) &&
  value["trash"].every(isPublicCardView) &&
  isPublicCardView(value["leader"]) &&
  Array.isArray(value["characters"]) &&
  value["characters"].every(isPublicCardView) &&
  (value["stage"] === undefined || isPublicCardView(value["stage"])) &&
  Array.isArray(value["costArea"]) &&
  value["costArea"].every(isPublicCardView) &&
  isPublicLifeView(value["life"], { terminalStatus: false }) &&
  typeof value["hasMulliganed"] === "boolean" &&
  typeof value["turnCount"] === "number";

const isReplayDisplayPlayerView = (
  value: unknown,
  perspectivePlayerId: string,
  status: string,
): boolean => {
  if (!isRecord(value)) {
    return false;
  }
  const self = value["self"];
  const opponent = value["opponent"];
  return (
    typeof value["matchId"] === "string" &&
    value["playerId"] === perspectivePlayerId &&
    typeof value["stateSeq"] === "number" &&
    typeof value["actionSeq"] === "number" &&
    isRecord(value["turn"]) &&
    typeof value["turn"]["turnPlayerId"] === "string" &&
    typeof value["turn"]["globalTurn"] === "number" &&
    isRecord(value["turn"]["playerTurnCounts"]) &&
    typeof value["turn"]["phase"] === "string" &&
    isVisiblePlayerState(self) &&
    self["playerId"] === perspectivePlayerId &&
    isPublicLifeView(self["life"], {
      terminalStatus: isTerminalStatus(status),
    }) &&
    isOpponentVisibleState(opponent) &&
    opponent["playerId"] !== perspectivePlayerId &&
    isPublicLifeView(opponent["life"], {
      terminalStatus: isTerminalStatus(status),
    }) &&
    isRecord(value["timers"]) &&
    Array.isArray(value["revealedCards"]) &&
    Array.isArray(value["events"]) &&
    Array.isArray(value["legalActions"]) &&
    value["legalActions"].length === 0
  );
};

export const isReplayDisplayArtifactPayload = (
  value: unknown,
): value is ReplayDisplayArtifactPayload => {
  if (!isRecord(value)) {
    return false;
  }
  const perspectivePlayerId = value["perspectivePlayerId"];
  const frames = value["frames"];
  return (
    value["replayDisplayVersion"] === "display-v1" &&
    typeof perspectivePlayerId === "string" &&
    typeof value["frameCount"] === "number" &&
    Array.isArray(frames) &&
    value["frameCount"] > 0 &&
    frames.length === value["frameCount"] &&
    frames.every((frame) => {
      if (!isRecord(frame)) {
        return false;
      }
      const snapshot = frame["snapshot"];
      if (!isRecord(snapshot)) {
        return false;
      }
      if (
        typeof frame["index"] !== "number" ||
        (typeof frame["actionIndex"] !== "number" &&
          frame["actionIndex"] !== null) ||
        typeof frame["label"] !== "string" ||
        frame["perspectivePlayerId"] !== perspectivePlayerId ||
        typeof frame["stateSeq"] !== "number" ||
        typeof frame["actionSeq"] !== "number" ||
        typeof frame["status"] !== "string" ||
        typeof frame["activePlayerId"] !== "string"
      ) {
        return false;
      }
      if (
        typeof snapshot["stateSeq"] !== "number" ||
        typeof snapshot["actionSeq"] !== "number" ||
        typeof snapshot["stateHash"] !== "string" ||
        typeof snapshot["status"] !== "string" ||
        snapshot["status"] !== frame["status"] ||
        !isRecord(snapshot["turn"]) ||
        typeof snapshot["activePlayerId"] !== "string"
      ) {
        return false;
      }
      const players = snapshot["players"];
      if (!isRecord(players)) {
        return false;
      }
      const playerIds = Object.keys(players);
      const player = players[perspectivePlayerId];
      const view = isRecord(player) ? player["view"] : undefined;
      return (
        playerIds.length === 1 &&
        playerIds[0] === perspectivePlayerId &&
        isRecord(player) &&
        Array.isArray(player["actions"]) &&
        player["actions"].length === 0 &&
        isReplayDisplayPlayerView(view, perspectivePlayerId, frame["status"])
      );
    })
  );
};

export const replayFramesFromDisplayArtifact = (input: {
  readonly matchId: string;
  readonly manifestSnapshot: unknown;
  readonly artifact: ReplayDisplayArtifactPayload;
}): readonly ReplayFrame[] =>
  input.artifact.frames.flatMap((frame) => {
    if (!isRecord(frame.snapshot) || !isRecord(frame.snapshot["players"])) {
      return [];
    }
    return replayFrameFromSnapshot({
      frameIndex: frame.index,
      label: frame.label,
      manifestSnapshot: input.manifestSnapshot,
      matchId: input.matchId,
      snapshot: frame.snapshot as unknown as MatchSnapshot,
    });
  });
```

- [ ] **Step 4: Rewrite `ReplayViewerPage.tsx` to prefer local display-v1 playback and isolate legacy chunk loading**

Move these concerns into a legacy-only hook or helper named `useLegacyReplayFrameLoader`:

- `ReplayFrameChunkPayload`
- `ReplayFrameReconstructionPayload`
- `useRef`
- `initialReplayFrameChunkLimit`
- `playbackReplayFrameChunkLimit`
- `replayFrameWindowForIndex`
- `frameChunkToReplayFrames`
- `mergeReplayFrames`
- `framesByIndex`
- `frameCount`
- `frameError`
- `framesRequestLoading`
- `loadingFrameWindowRef`
- the `useEffect` that calls `client.getReplayFrames(...)`

The normal display-v1 path must not call that hook. Add:

```ts
const replayDisplayArtifact = replay?.replay.replayDisplayArtifact;
const displayArtifact = isReplayDisplayArtifactPayload(replayDisplayArtifact)
  ? replayDisplayArtifact
  : undefined;
const frames = useMemo(
  () =>
    replay === undefined || displayArtifact === undefined
      ? []
      : replayFramesFromDisplayArtifact({
          matchId: replay.matchId,
          manifestSnapshot: replay.replay.manifestSnapshot,
          artifact: displayArtifact,
        }),
  [displayArtifact, replay],
);
const legacyFrames = useLegacyReplayFrameLoader({
  client,
  enabled: replay !== undefined && displayArtifact === undefined,
  matchId: replay?.matchId,
  manifestSnapshot: replay?.replay.manifestSnapshot,
});
const boardFrames =
  displayArtifact === undefined ? legacyFrames.frames : frames;
```

Derive:

```ts
const boardFrameCount = boardFrames.length;
const selectedFrameIndex =
  boardFrameCount === 0 ? 0 : Math.min(frameIndex, boardFrameCount - 1);
const selectedFrame = boardFrames[selectedFrameIndex];
```

Keep the existing play/pause/previous/next/range/speed control behavior, but advance only when `selectedFrame !== undefined`. Display-v1 rows use local frames only. Legacy/null/malformed artifact rows may still load chunks through the isolated legacy hook.

- [ ] **Step 5: Update viewer tests**

In `packages/client/src/react/ReplayViewerPage.test.ts`:

- remove source-scan tests that require `getReplayFrames`
- add a test that renders a display-v1 replay and confirms no frame endpoint call is made
- add a test that renders a replay with `replayDisplayArtifact: null` and confirms the legacy loader calls `getReplayFrames`
- add a test that renders a replay with a malformed `display-v1` artifact and confirms the legacy loader calls `getReplayFrames`
- add a test that selecting a range frame changes local frame state
- keep the existing no-overlap/transport tests if they still apply

The display-v1 network assertion should use the existing fake replay client pattern in the file. It must fail if `getReplayFrames` is called for a valid display artifact. The null/malformed-artifact tests should assert the opposite: only the legacy fallback path calls `getReplayFrames`.

- [ ] **Step 6: Run focused client tests**

Run:

```bash
corepack pnpm exec vitest run packages/client/src/react/replay-display-frame.test.ts packages/client/src/react/replay-match-client.test.ts packages/client/src/react/ReplayViewerPage.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/client/src/react/replay-display-frame.ts packages/client/src/react/replay-display-frame.test.ts packages/client/src/react/replay-match-client.ts packages/client/src/react/replay-match-client.test.ts packages/client/src/react/ReplayViewerPage.tsx packages/client/src/react/ReplayViewerPage.test.ts
git commit -m "feat: play replay display frames locally"
```

---

### Task 6: Isolate Or Remove Legacy Frame Reconstruction

**Files:**

- Modify: `packages/match-server/src/replay-route.ts`
- Modify: `packages/match-server/src/recovery-independent-http-route.ts`
- Modify: `packages/match-server/src/match-http-server-options.ts`
- Modify: `packages/match-server/src/match-http-server.ts`
- Modify/Rename: `packages/match-server/src/replay-frame-cache.ts`
- Modify/Rename: `packages/match-server/src/replay-frame-cache.test.ts`
- Modify/Rename: `packages/match-server/src/replay-frame-worker.ts`
- Modify/Rename: `packages/match-server/src/replay-frame-worker-dispatch.ts`
- Modify: `packages/match-server/src/replay-frame-reconstruction.ts`
- Modify: `packages/match-server/src/replay-frame-reconstruction.test.ts`
- Modify: `packages/client/src/replay-client.ts`

- [ ] **Step 1: Search for remaining normal-frame callers**

Run:

```bash
rg -n "getReplayFrames|/frames|legacyReplayFrameCache|reconstructReplayFramesOffThread|replay-frame-worker|replay-frame-cache" packages
```

Expected after Task 5: `packages/client/src/react/ReplayViewerPage.tsx` display-v1 flow does not call `getReplayFrames`; any remaining call is isolated in `useLegacyReplayFrameLoader` or an equivalent named legacy fallback helper. It is acceptable for `packages/client/src/replay-client.ts`, `packages/client/src/replay-client.test.ts`, and explicit server legacy route/tests to still mention `getReplayFrames` or `/frames`.

- [ ] **Step 2: Keep the legacy fallback explicit and server-only**

Keep old replay support for rows whose `replayDisplayArtifact` is missing, `null`, or fails `isReplayDisplayArtifactV1(...)`. Import the server validator from `replay-display-artifact.ts` and use it in `replay-route.ts`; do not rely on the mere presence of `replayDisplayVersion: "display-v1"`. Rename server-only concepts so the danger is visible:

- `ReplayFrameCache` -> `LegacyReplayFrameCache`
- `createReplayFrameCache` -> `createLegacyReplayFrameCache`
- `reconstructReplayFrames` route usage -> `legacyReplayFrameReconstruction`

Keep the `/api/replays/:matchId/frames` route only for legacy rows without a valid display artifact. It must return `410` for valid display-v1 rows so the viewer cannot accidentally depend on it.

For testability, thread the renamed `LegacyReplayFrameCache` dependency through the HTTP server wrapper:

- add `readonly legacyReplayFrameCache?: LegacyReplayFrameCache | undefined;` to `CreateMatchHttpServerOptions`
- pass `options.legacyReplayFrameCache` from `match-http-server.ts` into `handleRecoveryIndependentHttpRequest(...)`
- add `legacyReplayFrameCache?: LegacyReplayFrameCache` to `handleRecoveryIndependentHttpRequest(...)`
- pass it through to `handleReplayRequest(...)`

- [ ] **Step 3: Add regression test for display-v1 frame route**

In `match-http-server-replay.test.ts`, add:

```ts
test("display-v1 replays do not use the legacy frame endpoint", async () => {
  const repository = createFakeReplayRepository();
  const legacyFrameCacheCalls: MatchId[] = [];
  const server = await createMatchHttpServer({
    createDefaultMatch: false,
    replayRepository: repository,
    legacyReplayFrameCache: {
      async getFrameChunk(replay) {
        legacyFrameCacheCalls.push(replay.matchId);
        return {
          status: "ready",
          frameCount: 0,
          start: 0,
          limit: 1,
          frames: [],
        };
      },
    },
  });
  await server.listen(0, "127.0.0.1");
  try {
    const response = await fetch(
      `${server.url()}/api/replays/match-1/frames?start=0&limit=1`,
    );
    const body = (await response.json()) as { errors?: readonly string[] };

    assert.equal(response.status, 410);
    assert.match(body.errors?.[0] ?? "", /display artifact/i);
    assert.deepEqual(legacyFrameCacheCalls, []);
  } finally {
    await server.close();
  }
});
```

- [ ] **Step 4: Add regression test for malformed display-v1 fallback**

In `match-http-server-replay.test.ts`, add a fake replay detail whose `replayDisplayArtifact` has `replayDisplayVersion: "display-v1"` but no valid `perspectivePlayerId` or frame `snapshot.players` payload. Use an injected fake legacy frame cache so the test proves fallback reconstruction ran.

Use the existing fake repository and replay frame cache injection pattern in this file. The expected assertion shape is:

```ts
const legacyFrameCacheCalls: MatchId[] = [];
const server = await createMatchHttpServer({
  createDefaultMatch: false,
  replayRepository: repository,
  legacyReplayFrameCache: {
    async getFrameChunk(replay, window) {
      legacyFrameCacheCalls.push(replay.matchId);
      return {
        status: "ready",
        frameCount: 1,
        start: window.start,
        limit: window.limit,
        frames: [{ index: 0, label: "legacy fallback" }],
      };
    },
  },
});
const response = await fetch(
  `${server.url()}/api/replays/match-malformed/frames?start=0&limit=1`,
);
const body = (await response.json()) as {
  frameReconstruction?: { frames?: Array<{ label?: string }> };
};

assert.equal(response.status, 200);
assert.deepEqual(legacyFrameCacheCalls, ["match-malformed"]);
assert.equal(body.frameReconstruction?.frames?.[0]?.label, "legacy fallback");
```

The valid display-v1 `410` test must assert `legacyFrameCacheCalls` stays empty.

- [ ] **Step 5: Keep legacy files renamed, not deleted**

Keep the worker/cache files for legacy rows, but rename their exported types/functions and tests to legacy names. Do not import them from normal replay detail. The only route path allowed to call them is `/api/replays/:matchId/frames` after it has confirmed the replay does not have a valid `display-v1` artifact.

- [ ] **Step 6: Run server replay tests**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/match-http-server-replay.test.ts packages/match-server/src/replay-frame-reconstruction.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/match-server/src packages/client/src/replay-client.ts
git commit -m "fix: isolate legacy replay frame reconstruction"
```

---

### Task 7: Add Replay Size And Hidden-Information Guards

**Files:**

- Modify: `packages/match-server/src/replay-display-artifact.ts`
- Modify: `packages/match-server/src/replay-display-artifact.test.ts`
- Modify: `packages/match-server/src/local-completed-match-record.test.ts`

- [ ] **Step 1: Add size helper**

In `replay-display-artifact.ts`, add:

```ts
export const replayDisplayAverageFrameByteSize = (
  artifact: ReplayDisplayArtifactV1,
): number =>
  artifact.frameCount === 0
    ? 0
    : Math.ceil(replayDisplayArtifactByteSize(artifact) / artifact.frameCount);
```

- [ ] **Step 2: Add size budget test**

In `replay-display-artifact.test.ts`, add:

```ts
test("synthetic compact frames stay below the replay display size budget", () => {
  let previousEventSeqByPlayer = new Map<PlayerId, number>();
  const frames = Array.from({ length: 10 }, (_, index) => {
    const result = createReplayDisplayFrameFromSnapshot({
      index,
      actionIndex: index === 0 ? null : index - 1,
      label: index === 0 ? "Initial state" : "submitAction",
      snapshot: snapshot(
        Array.from({ length: index + 1 }, (_, eventIndex) => eventIndex + 1),
      ),
      perspectivePlayerId: p1,
      previousEventSeqByPlayer,
    });
    if (result === undefined) {
      throw new Error("Expected display frame.");
    }
    previousEventSeqByPlayer = new Map(result.nextEventSeqByPlayer);
    return result.frame;
  });
  const artifact = createReplayDisplayArtifact({
    perspectivePlayerId: p1,
    frames,
  });

  expect(frames[0]?.snapshot.players[p1]?.view.events).toHaveLength(1);
  expect(frames[9]?.snapshot.players[p1]?.view.events).toEqual([
    { id: "event-10", seq: 10 },
  ]);
  expect(replayDisplayArtifactByteSize(artifact)).toBeLessThan(25_000);
  expect(replayDisplayAverageFrameByteSize(artifact)).toBeLessThan(2_500);
});
```

- [ ] **Step 3: Add completed-record size assertion**

In `local-completed-match-record.test.ts`, assert the real fixture completed record has a byte size and average frame size logged in the assertion failure:

```ts
const artifact = record?.replay.replayDisplayArtifact;
expect(artifact).toBeDefined();
if (artifact === undefined) {
  throw new Error("Expected replay display artifact.");
}
const byteSize = Buffer.byteLength(JSON.stringify(artifact), "utf8");
expect(byteSize, `display artifact bytes: ${String(byteSize)}`).toBeLessThan(
  250_000,
);
```

Use this as a first guard. If it fails, inspect the artifact and remove repeated data before raising the limit.

- [ ] **Step 4: Add raw-hidden-state string guard**

Add an assertion to the completed-record test:

```ts
const serialized = JSON.stringify(artifact);
const perspectivePlayerId = artifact.perspectivePlayerId;
for (const frame of artifact.frames) {
  expect(frame.perspectivePlayerId).toBe(perspectivePlayerId);
  expect(Object.keys(frame.snapshot.players)).toEqual([perspectivePlayerId]);
  const player = frame.snapshot.players[perspectivePlayerId];
  expect(player?.view.self.deck).toBeUndefined();
  expect(player?.view.self.donDeck).toBeUndefined();
  expect(player?.view.opponent.hand).toBeUndefined();
  expect(player?.view.opponent.deck).toBeUndefined();
  expect(player?.view.opponent.donDeck).toBeUndefined();
  if (frame.status === "completed" || frame.status === "gameOver") {
    expect(player?.view.self.life.faceUpCards).toEqual([]);
    expect(player?.view.opponent.life.faceUpCards).toEqual([]);
  }
}
expect(serialized).not.toContain("rng");
expect(serialized).not.toContain("rngState");
expect(serialized).not.toContain("deckCardIds");
expect(serialized).not.toContain("donDeckCardIds");
expect(serialized).not.toContain("initialDeckOrders");
expect(serialized).not.toContain("rollback");
```

This guard does not ban the selected perspective player's own hand. It bans raw engine/reconstruction fields that should never be needed for display playback.

- [ ] **Step 5: Run size and hidden-info tests**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/replay-display-artifact.test.ts packages/match-server/src/local-completed-match-record.test.ts tests/hidden-info
```

Expected: pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add packages/match-server/src/replay-display-artifact.ts packages/match-server/src/replay-display-artifact.test.ts packages/match-server/src/local-completed-match-record.test.ts
git commit -m "test: guard replay display artifact size"
```

---

### Task 8: Full Verification, Deployment Readiness, And Push

**Files:**

- No planned source edits.

- [ ] **Step 1: Run focused replay checks**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/replay-display-artifact.test.ts packages/match-server/src/match-session.test.ts packages/match-server/src/local-completed-match-record.test.ts packages/match-server/src/dev-local-match-registry.test.ts packages/match-server/src/postgres-completed-match.test.ts packages/match-server/src/match-http-server-replay.test.ts packages/client/src/replay-client.test.ts packages/client/src/react/replay-display-frame.test.ts packages/client/src/react/replay-match-client.test.ts packages/client/src/react/ReplayViewerPage.test.ts tests/contracts/database-schema-contract.test.mjs
```

Expected: all pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
corepack pnpm run typecheck
```

Expected: pass.

- [ ] **Step 3: Run full verify**

Run:

```bash
corepack pnpm run verify
```

Expected: pass.

- [ ] **Step 4: Run coverage or record why it is skipped**

Run:

```bash
corepack pnpm run coverage
```

Expected: pass. If it is too slow or environment-blocked, record the exact reason in the final response and do not claim coverage verification.

- [ ] **Step 5: Record exact replay size numbers**

Run the focused completed-record test with the size assertion enabled and record the artifact byte size and average bytes per frame in the final response. If the test output does not print the number, temporarily inspect the artifact in the test or with a local script, then remove any temporary code before committing.

- [ ] **Step 6: Check worktree**

Run:

```bash
git status --short --branch
```

Expected: no unstaged or uncommitted files.

- [ ] **Step 7: Push current branch**

Run:

```bash
git branch --show-current
git push origin HEAD
```

Expected: first command prints the current branch, and push succeeds without changing branches.

---

## Self-Review Checklist For The Implementer

- [ ] `display-v1` replay detail works without `/frames`.
- [ ] `ReplayViewerPage.tsx` display-v1 path no longer calls `getReplayFrames`; only the named legacy fallback hook may call it for missing/null/malformed artifacts.
- [ ] `reconstructReplayArtifactStates` is not used for display-v1 viewing.
- [ ] `deterministicEntries` still contain only deterministic entry data.
- [ ] `audit.result` still does not persist full snapshots.
- [ ] `replay_display_artifact` is included in contract SQL, spec SQL, save SQL, detail SQL, and public detail SQL.
- [ ] Rollback tests still pass.
- [ ] Hidden-info tests still pass.
- [ ] Full `corepack pnpm run verify` passes.
- [ ] Final response includes replay artifact byte counts.

## Review Loop Notes

This version removed the non-implementable parts from the first draft:

- Removed fake helper names such as `createTestMatchSession`, `validActionForCurrentState`, `requestReplayDetail`, and `replayWithDisplayArtifact`.
- Replaced conditional persistence guidance with an explicit `replay_display_artifact` JSONB column.
- Replaced full `DevMatchSnapshot` storage with compact display snapshots that strip legal actions and store event deltas.
- Anchored tests to real current files and existing test names.
- Added schema/spec/test updates required by the repo authority order.
