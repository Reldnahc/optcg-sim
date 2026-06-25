import { describe, expect, test } from "vitest";
import {
  hashReplayStateForScope,
  replayEntryAfterCheckpointId,
} from "@optcg/engine-core";

import {
  buildLocalCompletedMatchRecord,
  type CompletedMatchSeatContext,
} from "./local-completed-match-record.js";
import {
  createLocalDevMatch,
  createPremadeDevMatchSetup,
  getLocalDevSnapshot,
  type DevMatchSetup,
  type LocalDevMatch,
} from "./local-match.js";
import type { CardId, MatchId, StateSeq } from "@optcg/types";
import type { ReadyDeckSubmission } from "./deck-submission.js";
import { createDefaultDevFixtureFetch } from "./default-dev-fixture-fetch.test-support.js";
import { requestHash } from "./action-envelope.js";
import { createReplayDisplayFrameFromSnapshot } from "./replay-display-artifact.js";
import type { VerifiedSimHandoff } from "./sim-handoff.js";
import type {
  StoredDeterministicCheckpointRecord,
  StoredDeterministicSessionRecord,
} from "./session-types.js";

const readySubmission = (
  hash: string,
  leaderCardNumber: string,
): ReadyDeckSubmission => ({
  source: "deckHash",
  hash,
  status: "ready",
  decoded: {
    leader: { cardId: leaderCardNumber as CardId, count: 1 },
    main: [{ cardId: "OP01-016" as CardId, count: 50 }],
  },
  donDeckCount: 10,
});

const verifiedHandoff = (hash: string): VerifiedSimHandoff => ({
  claims: {
    jti: "token-id",
    sub: "00000000-0000-0000-0000-000000000001",
    sid: "00000000-0000-0000-0000-0000000000aa",
    loadout_id: "10000000-0000-0000-0000-000000000001",
    lobby_id: "lobby-1",
    seat_id: "p1",
    aud: "optcg-sim",
    iat: 1,
    exp: 2,
  },
  resolvedLoadout: {
    loadoutId: "10000000-0000-0000-0000-000000000001",
    userId: "00000000-0000-0000-0000-000000000001",
    mainDeck: {
      deckId: "10000000-0000-0000-0000-000000000001",
      hash,
    },
    donDeck: {
      donDeckId: null,
      count: 10,
    },
    cosmetics: {
      playmatId: "playmat-1",
      donSleeveId: "don-sleeve-1",
      deckSleeveId: "deck-sleeve-1",
    },
  },
});

const jsonRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected JSON record.");
  }
  return value as Record<string, unknown>;
};

const replayDisplayFrame = (
  match: LocalDevMatch,
  setup: DevMatchSetup,
  input: {
    readonly actionIndex: number | null;
    readonly label: string;
  },
) => {
  const result = createReplayDisplayFrameFromSnapshot({
    actionIndex: input.actionIndex,
    index: input.actionIndex === null ? 0 : input.actionIndex + 1,
    label: input.label,
    snapshot: getLocalDevSnapshot(match),
    perspectivePlayerId: setup.playerOrder[0],
    previousEventSeqByPlayer: new Map(),
  });
  if (result === undefined) {
    throw new Error("Expected replay display frame.");
  }
  return result.frame;
};

describe("local completed match record mapping", () => {
  test("stores reconstructable replay state for completed matches", async () => {
    const setup = await createPremadeDevMatchSetup({
      matchId: "22222222-2222-2222-2222-222222222222" as MatchId,
      fetchCard: createDefaultDevFixtureFetch(),
    });
    const match = createLocalDevMatch(setup);
    match.state.status = { type: "completed", winner: setup.playerOrder[0] };

    const record = buildLocalCompletedMatchRecord({
      match,
      setup,
      seats: {
        [setup.playerOrder[0]]: {
          playerId: setup.playerOrder[0],
          deckSubmission: readySubmission("first-hash", "OP01-001"),
        },
        [setup.playerOrder[1]]: {
          playerId: setup.playerOrder[1],
          deckSubmission: readySubmission("second-hash", "OP05-060"),
        },
      },
      firstPlayerChoice: {
        source: "game-one-random-chooser",
        chooserPlayerId: setup.playerOrder[0],
        choice: "goFirst",
        resolvedFirstPlayerId: setup.playerOrder[0],
      },
      deterministicRecords: [],
      deterministicCheckpoints: [],
      replayDisplayFrames: [],
      endedAt: "2026-06-08T00:10:00.000Z",
    });

    const firstSetupPlayer = setup.players[0];
    const secondSetupPlayer = setup.players[1];
    expect(record).toBeDefined();
    expect(record?.replay.initialSnapshot).toBeNull();
    expect(record?.replay.finalState).toBeNull();
    expect(record?.replay.initialDeckOrders).toEqual({
      playerOrder: setup.playerOrder,
      firstPlayerId: setup.firstPlayerId,
      shuffleDecks: setup.shuffleDecks ?? false,
      players: {
        [setup.playerOrder[0]]: {
          leaderCardId: firstSetupPlayer.leaderCardId,
          leaderLifeCount: firstSetupPlayer.leaderLifeCount,
          deckCardIds: firstSetupPlayer.deckCardIds.map(String),
          donDeckCardIds: firstSetupPlayer.donDeckCardIds.map(String),
        },
        [setup.playerOrder[1]]: {
          leaderCardId: secondSetupPlayer.leaderCardId,
          leaderLifeCount: secondSetupPlayer.leaderLifeCount,
          deckCardIds: secondSetupPlayer.deckCardIds.map(String),
          donDeckCardIds: secondSetupPlayer.donDeckCardIds.map(String),
        },
      },
    });
    expect(record?.replay.initialStateHash).toBeTruthy();
    expect(record?.replay.finalStateHash).toBeTruthy();
    expect(record?.cardManifestSnapshot).toMatchObject({
      customHandlerVersion: setup.cardManifest.customHandlerVersion,
      banlistVersion: setup.cardManifest.banlistVersion,
      effectDefinitions: setup.cardManifest.effectDefinitions,
    });
    expect(record?.replay.manifestSnapshot).toEqual({
      manifestHash: record?.replay.manifestHash,
    });
    const compactManifestCards = record?.cardManifestSnapshot["cards"];
    const leaderSnapshot =
      typeof compactManifestCards === "object" &&
      compactManifestCards !== null &&
      !Array.isArray(compactManifestCards)
        ? (compactManifestCards as Record<string, unknown>)[
            String(firstSetupPlayer.leaderCardId)
          ]
        : undefined;
    const leaderImageUrl =
      typeof leaderSnapshot === "object" &&
      leaderSnapshot !== null &&
      !Array.isArray(leaderSnapshot)
        ? (leaderSnapshot as Record<string, unknown>)["imageUrl"]
        : undefined;
    expect(leaderImageUrl).toMatch(/^https:\/\//u);
    expect(JSON.stringify(record?.cardManifestSnapshot)).toContain(
      "generated-dev-support",
    );
  });

  test("preserves verified account loadout snapshots for completed matches", async () => {
    const setup = await createPremadeDevMatchSetup({
      matchId: "11111111-1111-1111-1111-111111111111" as MatchId,
      lobbyId: "lobby-1",
      fetchCard: createDefaultDevFixtureFetch(),
    });
    const match = createLocalDevMatch(setup);
    match.state.status = { type: "completed", winner: setup.playerOrder[0] };
    const firstSeat: CompletedMatchSeatContext = {
      playerId: setup.playerOrder[0],
      subject: {
        type: "user",
        userId: "00000000-0000-0000-0000-000000000001",
        sessionId: "00000000-0000-0000-0000-0000000000aa",
        displayName: "Account Player",
      },
      deckSubmission: readySubmission("account-hash", "OP01-001"),
      verifiedHandoff: verifiedHandoff("account-hash"),
    };
    const secondSeat: CompletedMatchSeatContext = {
      playerId: setup.playerOrder[1],
      deckSubmission: readySubmission("local-hash", "OP05-060"),
    };

    const record = buildLocalCompletedMatchRecord({
      match,
      setup,
      seats: {
        [setup.playerOrder[0]]: firstSeat,
        [setup.playerOrder[1]]: secondSeat,
      },
      firstPlayerChoice: {
        source: "game-one-random-chooser",
        chooserPlayerId: setup.playerOrder[0],
        choice: "goFirst",
        resolvedFirstPlayerId: setup.playerOrder[0],
      },
      deterministicRecords: [],
      deterministicCheckpoints: [],
      replayDisplayFrames: [],
      endedAt: "2026-06-08T00:10:00.000Z",
    });

    expect(record).toBeDefined();
    expect(record?.matchId).toBe("11111111-1111-1111-1111-111111111111");
    expect(record?.lobbyId).toBe("lobby-1");
    expect(record?.creationSource).toMatchObject({
      type: "customLobby",
      lobbyId: "lobby-1",
    });
    const firstPlayer = record?.players[0];
    expect(firstPlayer?.userId).toBe("00000000-0000-0000-0000-000000000001");
    expect(firstPlayer?.savedDeckId).toBe(
      "10000000-0000-0000-0000-000000000001",
    );
    expect(firstPlayer?.deckHash).toBe("account-hash");
    expect(firstPlayer?.resolvedLoadoutSnapshot).toMatchObject({
      loadoutId: "10000000-0000-0000-0000-000000000001",
      cosmetics: {
        deckSleeveId: "deck-sleeve-1",
      },
    });
    expect(firstPlayer?.deckSnapshot).toMatchObject({
      hash: "account-hash",
      decoded: {
        leader: { cardId: "OP01-001" },
      },
    });
  });

  test("does not persist synthetic bot ids as account UUIDs", async () => {
    const setup = await createPremadeDevMatchSetup({
      matchId: "33333333-3333-3333-3333-333333333333" as MatchId,
      lobbyId: "lobby-bot",
      fetchCard: createDefaultDevFixtureFetch(),
    });
    const match = createLocalDevMatch(setup);
    match.state.status = { type: "completed", winner: setup.playerOrder[1] };

    const record = buildLocalCompletedMatchRecord({
      match,
      setup,
      seats: {
        [setup.playerOrder[0]]: {
          playerId: setup.playerOrder[0],
          subject: {
            type: "user",
            userId: "00000000-0000-0000-0000-000000000001",
            sessionId: "00000000-0000-0000-0000-0000000000aa",
            displayName: "Account Player",
          },
          deckSubmission: readySubmission("account-hash", "OP01-001"),
        },
        [setup.playerOrder[1]]: {
          playerId: setup.playerOrder[1],
          subject: {
            type: "user",
            userId: "bot",
            sessionId: "bot",
            displayName: "Bot",
          },
          deckSubmission: readySubmission("bot-hash", "OP13-079"),
        },
      },
      firstPlayerChoice: {
        source: "game-one-random-chooser",
        chooserPlayerId: setup.playerOrder[0],
        choice: "goSecond",
        resolvedFirstPlayerId: setup.playerOrder[1],
      },
      deterministicRecords: [],
      deterministicCheckpoints: [],
      replayDisplayFrames: [],
      endedAt: "2026-06-08T00:10:00.000Z",
    });

    expect(record?.winnerUserId).toBeNull();
    expect(record?.players[1]).toMatchObject({
      seatId: setup.playerOrder[1],
      userId: null,
      displayName: "Bot",
      isWinner: true,
    });
  });

  test("stores exact deterministic entries without replay-frame checkpoints", async () => {
    const setup = await createPremadeDevMatchSetup({
      matchId: "44444444-4444-4444-4444-444444444444" as MatchId,
      fetchCard: createDefaultDevFixtureFetch(),
    });
    const match = createLocalDevMatch(setup);
    match.state.status = { type: "completed", winner: setup.playerOrder[0] };
    const request = {
      type: "submitAction" as const,
      playerId: setup.playerOrder[0],
      actionIndex: 0,
      expectedStateSeq: 0,
    };
    const storedRecord: StoredDeterministicSessionRecord = {
      deterministicEntry: {
        formatVersion: "deterministic-entry-v1",
        matchId: setup.matchId,
        entrySeq: 0,
        kind: "action",
        playerId: setup.playerOrder[0],
        action: { type: "endMainPhase" },
        verification: {
          stateSeqBefore: 0 as StateSeq,
          actionSeqBefore: 0,
          stateHashBefore: "before-hash",
          stateSeqAfter: 1 as StateSeq,
          actionSeqAfter: 1,
          stateHashAfter: "after-hash",
          hashScope: "gameplay-v1",
        },
      },
      audit: {
        type: "clientEnvelope",
        envelope: {
          protocolVersion: "dev-http-v1",
          matchId: setup.matchId,
          playerId: setup.playerOrder[0],
          clientActionId: "accepted-action-1",
          expectedStateSeq: 0,
          requestHash: requestHash(request),
          request,
        },
        result: {
          type: "actionResult",
          matchId: setup.matchId,
          clientActionId: "accepted-action-1",
          accepted: true,
          stateSeq: 1,
          actionSeq: 1,
          errors: [],
        },
        recordedAt: "2026-06-08T00:00:01.000Z",
      },
    };
    const replayCheckpoint: StoredDeterministicCheckpointRecord = {
      checkpoint: {
        checkpointVersion: "deterministic-checkpoint-v1",
        matchId: setup.matchId,
        checkpointId: replayEntryAfterCheckpointId(0),
        reason: "replayFrame",
        stateSeq: match.state.seq,
        actionSeq: match.state.actionSeq,
        stateHash: hashReplayStateForScope(match.state, "gameplay-v1"),
        hashScope: "gameplay-v1",
        snapshot: match.state,
      },
      recordedAt: "2026-06-08T00:00:01.000Z",
    };

    const record = buildLocalCompletedMatchRecord({
      match,
      setup,
      seats: {
        [setup.playerOrder[0]]: {
          playerId: setup.playerOrder[0],
          deckSubmission: readySubmission("first-hash", "OP01-001"),
        },
        [setup.playerOrder[1]]: {
          playerId: setup.playerOrder[1],
          deckSubmission: readySubmission("second-hash", "OP05-060"),
        },
      },
      firstPlayerChoice: {
        source: "game-one-random-chooser",
        chooserPlayerId: setup.playerOrder[0],
        choice: "goFirst",
        resolvedFirstPlayerId: setup.playerOrder[0],
      },
      deterministicRecords: [storedRecord],
      deterministicCheckpoints: [replayCheckpoint],
      replayDisplayFrames: [],
      endedAt: "2026-06-08T00:10:00.000Z",
    });

    expect(record).toBeDefined();
    const deterministicEntry = record?.replay.deterministicEntries[0] as
      | Record<string, unknown>
      | undefined;
    expect(record?.replay.replayFormatVersion).toBe("dev-local-v2");
    expect(deterministicEntry?.["kind"]).toBe("action");
    expect(Object.hasOwn(deterministicEntry ?? {}, "envelope")).toBe(false);
    expect(record?.replay.auditEntries).toEqual([]);
    expect(record?.replay.checkpoints).toEqual([]);
  });

  test("stores replay display artifacts from the explicit frame list", async () => {
    const setup = await createPremadeDevMatchSetup({
      matchId: "66666666-6666-6666-6666-666666666666" as MatchId,
      fetchCard: createDefaultDevFixtureFetch(),
    });
    const match = createLocalDevMatch(setup);
    match.state.status = { type: "completed", winner: setup.playerOrder[0] };
    const frame = replayDisplayFrame(match, setup, {
      actionIndex: 0,
      label: "submitAction",
    });
    const request = {
      type: "submitAction" as const,
      playerId: setup.playerOrder[0],
      actionIndex: 0,
      expectedStateSeq: match.state.seq,
    };
    const storedRecord: StoredDeterministicSessionRecord = {
      deterministicEntry: {
        formatVersion: "deterministic-entry-v1",
        matchId: setup.matchId,
        entrySeq: 0,
        kind: "action",
        playerId: setup.playerOrder[0],
        action: { type: "endMainPhase" },
        verification: {
          stateSeqBefore: match.state.seq,
          actionSeqBefore: match.state.actionSeq,
          stateHashBefore: hashReplayStateForScope(match.state, "gameplay-v1"),
          stateSeqAfter: match.state.seq,
          actionSeqAfter: match.state.actionSeq,
          stateHashAfter: hashReplayStateForScope(match.state, "gameplay-v1"),
          hashScope: "gameplay-v1",
        },
      },
      audit: {
        type: "clientEnvelope",
        envelope: {
          protocolVersion: "dev-http-v1",
          matchId: setup.matchId,
          playerId: setup.playerOrder[0],
          clientActionId: "display-action-1",
          expectedStateSeq: match.state.seq,
          requestHash: requestHash(request),
          request,
        },
        result: {
          type: "actionResult",
          matchId: setup.matchId,
          clientActionId: "display-action-1",
          accepted: true,
          stateSeq: match.state.seq,
          actionSeq: match.state.actionSeq,
          errors: [],
        },
        recordedAt: "2026-06-08T00:00:01.000Z",
      },
      replayDisplayFrame: frame,
    };

    const record = buildLocalCompletedMatchRecord({
      match,
      setup,
      seats: {
        [setup.playerOrder[0]]: {
          playerId: setup.playerOrder[0],
          deckSubmission: readySubmission("first-hash", "OP01-001"),
        },
        [setup.playerOrder[1]]: {
          playerId: setup.playerOrder[1],
          deckSubmission: readySubmission("second-hash", "OP05-060"),
        },
      },
      firstPlayerChoice: {
        source: "game-one-random-chooser",
        chooserPlayerId: setup.playerOrder[0],
        choice: "goFirst",
        resolvedFirstPlayerId: setup.playerOrder[0],
      },
      deterministicRecords: [storedRecord],
      deterministicCheckpoints: [],
      replayDisplayFrames: [frame],
      endedAt: "2026-06-08T00:10:00.000Z",
    });

    expect(record?.replay.replayDisplayArtifact).toMatchObject({
      replayDisplayVersion: "display-v1",
      perspectivePlayerId: setup.playerOrder[0],
      frameCount: 1,
      frames: [{ label: "submitAction" }],
    });
    expect(JSON.stringify(record?.replay.deterministicEntries)).not.toContain(
      "replayDisplayFrame",
    );
    expect(JSON.stringify(record?.replay.deterministicEntries)).not.toContain(
      "snapshot",
    );
  });

  test("stores an initial replay display artifact for zero-action matches", async () => {
    const setup = await createPremadeDevMatchSetup({
      matchId: "77777777-7777-7777-7777-777777777777" as MatchId,
      fetchCard: createDefaultDevFixtureFetch(),
    });
    const match = createLocalDevMatch(setup);
    match.state.status = { type: "completed", winner: setup.playerOrder[0] };
    const initialFrame = replayDisplayFrame(match, setup, {
      actionIndex: null,
      label: "Initial state",
    });

    const record = buildLocalCompletedMatchRecord({
      match,
      setup,
      seats: {
        [setup.playerOrder[0]]: {
          playerId: setup.playerOrder[0],
          deckSubmission: readySubmission("first-hash", "OP01-001"),
        },
        [setup.playerOrder[1]]: {
          playerId: setup.playerOrder[1],
          deckSubmission: readySubmission("second-hash", "OP05-060"),
        },
      },
      firstPlayerChoice: {
        source: "game-one-random-chooser",
        chooserPlayerId: setup.playerOrder[0],
        choice: "goFirst",
        resolvedFirstPlayerId: setup.playerOrder[0],
      },
      deterministicRecords: [],
      deterministicCheckpoints: [],
      replayDisplayFrames: [initialFrame],
      endedAt: "2026-06-08T00:10:00.000Z",
    });

    expect(record?.replay.replayDisplayArtifact).toMatchObject({
      replayDisplayVersion: "display-v1",
      perspectivePlayerId: setup.playerOrder[0],
      frameCount: 1,
      frames: [{ actionIndex: null, label: "Initial state" }],
    });
    expect(record?.replay.deterministicEntries).toEqual([]);

    const artifact = record?.replay.replayDisplayArtifact;
    if (artifact === undefined || artifact === null) {
      throw new Error("Expected replay display artifact.");
    }
    const byteSize = Buffer.byteLength(JSON.stringify(artifact), "utf8");
    expect(
      byteSize,
      `display artifact bytes: ${String(byteSize)}`,
    ).toBeLessThan(250_000);
    const serialized = JSON.stringify(artifact);
    const perspectivePlayerId = artifact["perspectivePlayerId"];
    if (typeof perspectivePlayerId !== "string") {
      throw new Error("Expected display perspective player id.");
    }
    const frames = artifact["frames"];
    if (!Array.isArray(frames)) {
      throw new Error("Expected display frames.");
    }
    for (const frameValue of frames) {
      const frame = jsonRecord(frameValue);
      expect(frame["perspectivePlayerId"]).toBe(perspectivePlayerId);
      const snapshot = jsonRecord(frame["snapshot"]);
      const players = jsonRecord(snapshot["players"]);
      expect(Object.keys(players)).toEqual([perspectivePlayerId]);
      const player = jsonRecord(players[perspectivePlayerId]);
      const view = jsonRecord(player["view"]);
      const self = jsonRecord(view["self"]);
      const opponent = jsonRecord(view["opponent"]);
      expect(self["deck"]).toBeUndefined();
      expect(self["donDeck"]).toBeUndefined();
      expect(opponent["hand"]).toBeUndefined();
      expect(opponent["deck"]).toBeUndefined();
      expect(opponent["donDeck"]).toBeUndefined();
      if (frame["status"] === "completed" || frame["status"] === "gameOver") {
        expect(jsonRecord(self["life"])["faceUpCards"]).toEqual([]);
        expect(jsonRecord(opponent["life"])["faceUpCards"]).toEqual([]);
      }
    }
    expect(serialized).not.toContain("rng");
    expect(serialized).not.toContain("rngState");
    expect(serialized).not.toContain("deckCardIds");
    expect(serialized).not.toContain("donDeckCardIds");
    expect(serialized).not.toContain("initialDeckOrders");
    expect(serialized).not.toContain("rollback");
  });

  test("stores rollback restore checkpoints required for replay reconstruction", async () => {
    const setup = await createPremadeDevMatchSetup({
      matchId: "55555555-5555-5555-5555-555555555555" as MatchId,
      fetchCard: createDefaultDevFixtureFetch(),
    });
    const match = createLocalDevMatch(setup);
    match.state.status = { type: "completed", winner: setup.playerOrder[0] };
    const rollbackPointId = "rollback:0:0:event-1";
    const request = {
      type: "submitAction" as const,
      playerId: setup.playerOrder[0],
      actionIndex: 0,
      expectedStateSeq: match.state.seq,
    };
    const storedRecord: StoredDeterministicSessionRecord = {
      deterministicEntry: {
        formatVersion: "deterministic-entry-v1",
        matchId: setup.matchId,
        entrySeq: 0,
        kind: "system",
        operation: {
          type: "restoreRollbackPoint",
          rollbackPointId,
          requestedBy: setup.playerOrder[0],
          approvedBy: setup.playerOrder[1],
          restoredStateHash: hashReplayStateForScope(
            match.state,
            "gameplay-v1",
          ),
          restoredStateSeq: match.state.seq,
          restoredActionSeq: match.state.actionSeq,
        },
        verification: {
          stateSeqBefore: match.state.seq,
          actionSeqBefore: match.state.actionSeq,
          stateHashBefore: hashReplayStateForScope(match.state, "gameplay-v1"),
          stateSeqAfter: match.state.seq,
          actionSeqAfter: match.state.actionSeq,
          stateHashAfter: hashReplayStateForScope(match.state, "gameplay-v1"),
          hashScope: "gameplay-v1",
        },
      },
      audit: {
        type: "clientEnvelope",
        envelope: {
          protocolVersion: "dev-http-v1",
          matchId: setup.matchId,
          playerId: setup.playerOrder[0],
          clientActionId: "rollback-restore-action-1",
          expectedStateSeq: match.state.seq,
          requestHash: requestHash(request),
          request,
        },
        result: {
          type: "actionResult",
          matchId: setup.matchId,
          clientActionId: "rollback-restore-action-1",
          accepted: true,
          stateSeq: match.state.seq,
          actionSeq: match.state.actionSeq,
          errors: [],
        },
        recordedAt: "2026-06-08T00:00:01.000Z",
      },
    };
    const rollbackCheckpoint: StoredDeterministicCheckpointRecord = {
      checkpoint: {
        checkpointVersion: "deterministic-checkpoint-v1",
        matchId: setup.matchId,
        checkpointId: rollbackPointId,
        reason: "rollbackPoint",
        stateSeq: match.state.seq,
        actionSeq: match.state.actionSeq,
        stateHash: hashReplayStateForScope(match.state, "gameplay-v1"),
        hashScope: "gameplay-v1",
        snapshot: match.state,
      },
      recordedAt: "2026-06-08T00:00:01.000Z",
    };
    const redundantFrameCheckpoint: StoredDeterministicCheckpointRecord = {
      checkpoint: {
        ...rollbackCheckpoint.checkpoint,
        checkpointId: replayEntryAfterCheckpointId(0),
        reason: "replayFrame",
      },
      recordedAt: "2026-06-08T00:00:02.000Z",
    };

    const record = buildLocalCompletedMatchRecord({
      match,
      setup,
      seats: {
        [setup.playerOrder[0]]: {
          playerId: setup.playerOrder[0],
          deckSubmission: readySubmission("first-hash", "OP01-001"),
        },
        [setup.playerOrder[1]]: {
          playerId: setup.playerOrder[1],
          deckSubmission: readySubmission("second-hash", "OP05-060"),
        },
      },
      firstPlayerChoice: {
        source: "game-one-random-chooser",
        chooserPlayerId: setup.playerOrder[0],
        choice: "goFirst",
        resolvedFirstPlayerId: setup.playerOrder[0],
      },
      deterministicRecords: [storedRecord],
      deterministicCheckpoints: [rollbackCheckpoint, redundantFrameCheckpoint],
      replayDisplayFrames: [],
      endedAt: "2026-06-08T00:10:00.000Z",
    });

    expect(record?.replay.checkpoints).toHaveLength(1);
    const checkpointEntry = record?.replay.checkpoints[0] as
      | Record<string, unknown>
      | undefined;
    expect(checkpointEntry?.["checkpointId"]).toBe(rollbackPointId);
  });
});
