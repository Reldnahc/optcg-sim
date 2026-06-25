import { describe, expect, test } from "vitest";

import {
  isReplayDisplayArtifactPayload,
  replayFramesFromDisplayArtifact,
} from "./replay-display-frame.js";

const publicCard = (instanceId: string, cardId: string, playerId = "p1") => ({
  instanceId,
  cardId,
  owner: playerId,
  controller: playerId,
  zone: { playerId, zone: "leader" },
  attachedDonCount: 0,
  attachedDonIds: [],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const record = (value: unknown): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new Error("Expected record.");
  }
  return value;
};

const firstFrame = (artifact: unknown): Record<string, unknown> => {
  const frames = record(artifact)["frames"];
  if (!Array.isArray(frames)) {
    throw new Error("Expected frames.");
  }
  return record(frames[0]);
};

const firstFrameSnapshot = (artifact: unknown): Record<string, unknown> =>
  record(firstFrame(artifact)["snapshot"]);

const perspectiveView = (artifact: unknown): Record<string, unknown> => {
  const players = record(firstFrameSnapshot(artifact)["players"]);
  return record(record(players["p1"])["view"]);
};

const selfState = (artifact: unknown): Record<string, unknown> =>
  record(perspectiveView(artifact)["self"]);

const displayArtifact = (): unknown => ({
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
                leader: publicCard("leader-1", "L1"),
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
                leader: publicCard("leader-2", "L2", "p2"),
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
});

describe("replay display frame adapter", () => {
  test("converts display-v1 frames into replay frames", () => {
    const artifact = displayArtifact();
    expect(isReplayDisplayArtifactPayload(artifact)).toBe(true);
    if (!isReplayDisplayArtifactPayload(artifact)) {
      throw new Error("Expected valid display artifact.");
    }
    const frames = replayFramesFromDisplayArtifact({
      matchId: "match-1",
      manifestSnapshot: {
        cards: {
          L1: { cardId: "L1", name: "Leader", category: "leader" },
          L2: { cardId: "L2", name: "Opponent Leader", category: "leader" },
        },
      },
      artifact,
    });

    expect(frames).toHaveLength(1);
    expect(frames[0]?.index).toBe(0);
    expect(frames[0]?.label).toBe("Initial state");
    expect(frames[0]?.clientState.seat.playerId).toBe("p1");
  });

  test("rejects malformed display-v1 artifacts before conversion", () => {
    const withLegalActions = displayArtifact();
    perspectiveView(withLegalActions)["legalActions"] = [{ type: "endTurn" }];
    const withBadCard = displayArtifact();
    selfState(withBadCard)["leader"] = {};
    const withPrivateDeck = displayArtifact();
    selfState(withPrivateDeck)["deck"] = [publicCard("deck-1", "D1")];
    const withTerminalLife = displayArtifact();
    firstFrame(withTerminalLife)["status"] = "completed";
    firstFrameSnapshot(withTerminalLife)["status"] = "completed";
    record(selfState(withTerminalLife)["life"])["faceUpCards"] = [
      publicCard("life-1", "H1"),
    ];
    const withStatusMismatch = displayArtifact();
    firstFrameSnapshot(withStatusMismatch)["status"] = "completed";

    expect(isReplayDisplayArtifactPayload(withLegalActions)).toBe(false);
    expect(isReplayDisplayArtifactPayload(withBadCard)).toBe(false);
    expect(isReplayDisplayArtifactPayload(withPrivateDeck)).toBe(false);
    expect(isReplayDisplayArtifactPayload(withTerminalLife)).toBe(false);
    expect(isReplayDisplayArtifactPayload(withStatusMismatch)).toBe(false);
  });
});
