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

const publicCard = (instanceId: string, cardId: string, playerId = p1) => ({
  instanceId,
  cardId,
  owner: playerId,
  controller: playerId,
  zone: { playerId, zone: "leader" },
  attachedDonCount: 0,
  attachedDonIds: [],
});

const selfState = () => ({
  playerId: p1,
  deckCount: 40,
  donDeckCount: 10,
  hand: [],
  trash: [],
  leader: publicCard("leader-1", "L1", p1),
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
  leader: publicCard("leader-2", "L2", p2),
  characters: [],
  costArea: [],
  life: { count: 5, faceUpCards: [] },
  hasMulliganed: false,
  turnCount: 1,
});

const turn = {
  turnPlayerId: p1,
  globalTurn: 1,
  playerTurnCounts: { [p1]: 1, [p2]: 0 },
  phase: "main",
} as const;

const snapshot = (eventSeqs: readonly number[]): DevMatchSnapshot =>
  ({
    stateSeq: 10,
    actionSeq: 4,
    stateHash: "hash-10",
    status: "active",
    turn,
    activePlayerId: p1,
    players: {
      [p1]: {
        view: {
          matchId: "match-1",
          playerId: p1,
          stateSeq: 10,
          actionSeq: 4,
          turn,
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
          turn,
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

const oneFrameArtifact = () => {
  const result = createReplayDisplayFrameFromSnapshot({
    index: 0,
    actionIndex: null,
    label: "Initial state",
    snapshot: snapshot([1]),
    perspectivePlayerId: p1,
    previousEventSeqByPlayer: new Map(),
  });
  if (result === undefined) {
    throw new Error("Expected display frame.");
  }
  return createReplayDisplayArtifact({
    perspectivePlayerId: p1,
    frames: [result.frame],
  });
};

describe("replay display artifact", () => {
  test("creates versioned single-perspective display-v1 artifacts", () => {
    const artifact = oneFrameArtifact();

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

  test("stores per-frame event deltas and strips legal actions", () => {
    const first = createReplayDisplayFrameFromSnapshot({
      index: 0,
      actionIndex: null,
      label: "Initial state",
      snapshot: snapshot([1, 2]),
      perspectivePlayerId: p1,
      previousEventSeqByPlayer: new Map(),
    });
    if (first === undefined) {
      throw new Error("Expected first display frame.");
    }
    const second = createReplayDisplayFrameFromSnapshot({
      index: 1,
      actionIndex: 0,
      label: "submitAction",
      snapshot: snapshot([1, 2, 3]),
      perspectivePlayerId: p1,
      previousEventSeqByPlayer: first.nextEventSeqByPlayer,
    });
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
    player.view.opponent.hand = [publicCard("opponent-hand-1", "H2", p2)];
    player.view.opponent.deck = [publicCard("opponent-deck-1", "D2", p2)];
    player.view.opponent.donDeck = [
      publicCard("opponent-don-deck-1", "DON", p2),
    ];
    player.view.opponent.life = {
      count: 5,
      faceUpCards: [publicCard("opponent-hidden-life-1", "H3", p2)],
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

  test("rejects malformed display artifacts", () => {
    const artifact = oneFrameArtifact();
    const frame = artifact.frames[0];
    const player = frame?.snapshot.players[p1];
    if (frame === undefined || player === undefined) {
      throw new Error("Expected display frame.");
    }

    expect(
      isReplayDisplayArtifactV1({ replayDisplayVersion: "display-v1" }),
    ).toBe(false);
    expect(
      isReplayDisplayArtifactV1({
        ...artifact,
        frames: [{ ...frame, snapshot: { ...frame.snapshot, players: {} } }],
      }),
    ).toBe(false);
    expect(
      isReplayDisplayArtifactV1({
        ...artifact,
        frames: [
          {
            ...frame,
            snapshot: {
              ...frame.snapshot,
              players: {
                [p1]: { ...player, actions: [{ index: 0, type: "endTurn" }] },
              },
            },
          },
        ],
      }),
    ).toBe(false);
    expect(
      isReplayDisplayArtifactV1({
        ...artifact,
        frames: [
          {
            ...frame,
            snapshot: {
              ...frame.snapshot,
              players: {
                [p1]: {
                  ...player,
                  view: {
                    ...player.view,
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
        ...artifact,
        frames: [
          {
            ...frame,
            snapshot: {
              ...frame.snapshot,
              players: {
                [p1]: {
                  ...player,
                  view: {
                    ...player.view,
                    self: { ...player.view.self, characters: [{}] },
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
        ...artifact,
        frames: [
          {
            ...frame,
            snapshot: {
              ...frame.snapshot,
              players: {
                [p1]: {
                  ...player,
                  view: {
                    ...player.view,
                    self: {
                      ...player.view.self,
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
        ...artifact,
        frames: [
          {
            ...frame,
            status: "active",
            snapshot: {
              ...frame.snapshot,
              status: "completed",
              players: {
                [p1]: {
                  ...player,
                  view: {
                    ...player.view,
                    self: {
                      ...player.view.self,
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
    const artifact = oneFrameArtifact();

    expect(replayDisplayArtifactByteSize(artifact)).toBeGreaterThan(0);
  });
});
