import { strict as assert } from "node:assert";
import { Buffer } from "node:buffer";
import { beforeAll, test } from "vitest";

import { hashReplayStateForScope } from "@optcg/engine-core";
import type { MatchId, PlayerId } from "@optcg/types";

import { requestHash } from "./action-envelope.js";
import { createFixtureDevMatchSetup } from "./default-dev-fixture-fetch.test-support.js";
import {
  createLocalDevMatchRegistry,
  type CreatedDevMatchResponse,
} from "./dev-local-match-registry.js";
import type { DevVisibleAction } from "./dev-snapshot-types.js";
import { getLocalDevSnapshot, type DevMatchSetup } from "./local-match.js";
import { createInMemoryMatchPersistence } from "./match-persistence.js";
import type {
  CompletedMatchRecord,
  CompletedMatchRepository,
} from "./postgres-completed-match.js";
import { reconstructReplayFrames } from "./replay-frame-reconstruction.js";
import type {
  ClientActionEnvelope,
  MatchPersistence,
  SessionActionRequest,
} from "./session-types.js";

let premadeSetup: DevMatchSetup;
type CreatedSnapshot = NonNullable<CreatedDevMatchResponse["snapshot"]>;

beforeAll(async () => {
  premadeSetup = await createFixtureDevMatchSetup();
});

const waitForBotMicrotasks = async (): Promise<void> => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

const deferredVoid = (): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
} => {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve() {
      if (resolvePromise === undefined) {
        throw new Error("Deferred promise was not initialized.");
      }
      resolvePromise();
    },
  };
};

const firstVisibleAction = (
  snapshot: CreatedSnapshot,
  predicate: (action: DevVisibleAction) => boolean = () => true,
): { readonly playerId: PlayerId; readonly action: DevVisibleAction } => {
  for (const [playerId, player] of Object.entries(snapshot.players)) {
    const action = player.actions.find(predicate);
    if (action !== undefined) {
      return { playerId: playerId as PlayerId, action };
    }
  }
  throw new Error("Expected a visible action.");
};

const envelopeForRequest = (
  matchId: MatchId,
  request: SessionActionRequest,
  expectedStateSeq: number,
  clientActionId: string,
): ClientActionEnvelope => ({
  protocolVersion: "dev",
  matchId,
  playerId: request.playerId,
  clientActionId,
  expectedStateSeq,
  ...(request.type !== "respondToDecision"
    ? {}
    : { expectedDecisionId: request.decisionId }),
  requestHash: requestHash(request),
  request,
});

const submitFirstVisibleAction = async (
  registry: Awaited<ReturnType<typeof createLocalDevMatchRegistry>>,
  matchId: MatchId,
  snapshot: CreatedSnapshot,
  clientActionId: string,
  predicate?: (action: DevVisibleAction) => boolean,
): Promise<CreatedSnapshot> => {
  const { playerId, action } = firstVisibleAction(snapshot, predicate);
  const request: SessionActionRequest = {
    type: "submitAction",
    playerId,
    actionIndex: action.index,
    expectedStateSeq: snapshot.stateSeq,
  };
  const result = await registry.applyEnvelope(
    envelopeForRequest(matchId, request, snapshot.stateSeq, clientActionId),
  );
  if (result === "matchNotFound" || !result.accepted) {
    throw new Error("Expected visible action to be accepted.");
  }
  if (result.snapshot === undefined) {
    throw new Error("Expected accepted action snapshot.");
  }
  return result.snapshot;
};

const snapshotFromRegistry = (
  registry: Awaited<ReturnType<typeof createLocalDevMatchRegistry>>,
  matchId: MatchId,
): CreatedSnapshot => {
  const match = registry.getMatch(matchId);
  if (match === undefined) {
    throw new Error("Expected live match snapshot.");
  }
  return getLocalDevSnapshot(match);
};

test("active recovery ignores drifted audit envelope action indexes", async () => {
  const persistence = createInMemoryMatchPersistence();
  const matchId = "active-deterministic-audit-drift-match" as MatchId;
  const firstRegistry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    { createDefaultMatch: false, matchPersistence: persistence },
  );
  const created = await firstRegistry.createMatch(
    { ...structuredClone(premadeSetup), matchId },
    {
      firstPlayerChoice: {
        source: "game-one-random-chooser",
        chooserPlayerId: premadeSetup.playerOrder[0],
        choice: "goFirst",
        resolvedFirstPlayerId: premadeSetup.playerOrder[0],
      },
    },
  );
  if (created.snapshot === undefined) {
    throw new Error("Expected an active match snapshot.");
  }
  const advanced = await submitFirstVisibleAction(
    firstRegistry,
    matchId,
    created.snapshot,
    "audit-drift-action",
  );
  const liveMatch = firstRegistry.getMatch(matchId);
  if (liveMatch === undefined) {
    throw new Error("Expected live match.");
  }
  const expectedHash = hashReplayStateForScope(liveMatch.state, "gameplay-v1");

  const driftedPersistence: MatchPersistence = {
    ...persistence,
    async loadSnapshot(requestedMatchId) {
      const snapshot = await persistence.loadSnapshot(requestedMatchId);
      if (snapshot === undefined || requestedMatchId !== matchId) {
        return snapshot;
      }
      const records = snapshot.deterministicEntriesSinceSnapshot ?? [];
      return {
        ...snapshot,
        deterministicEntriesSinceSnapshot: records.map((record, index) => {
          if (
            index !== 0 ||
            record.audit.envelope.request.type !== "submitAction"
          ) {
            return record;
          }
          return {
            ...record,
            audit: {
              ...record.audit,
              envelope: {
                ...record.audit.envelope,
                request: {
                  ...record.audit.envelope.request,
                  actionIndex:
                    record.audit.envelope.request.actionIndex + 10_000,
                },
              },
            },
          };
        }),
      };
    },
  };

  const recoveredRegistry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    { createDefaultMatch: false, matchPersistence: driftedPersistence },
  );
  const recoveredMatch = recoveredRegistry.getMatch(matchId);

  assert.ok(recoveredMatch !== undefined);
  assert.equal(advanced.stateSeq, liveMatch.state.seq);
  assert.equal(
    hashReplayStateForScope(recoveredMatch.state, "gameplay-v1"),
    expectedHash,
  );
});

test("rollback restore recovery uses deterministic entries and checkpoints", async () => {
  const persistence = createInMemoryMatchPersistence();
  const matchId = "active-deterministic-rollback-recovery-match" as MatchId;
  const registry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    { createDefaultMatch: false, matchPersistence: persistence },
  );
  const created = await registry.createMatch(
    { ...structuredClone(premadeSetup), matchId },
    {
      firstPlayerChoice: {
        source: "game-one-random-chooser",
        chooserPlayerId: premadeSetup.playerOrder[0],
        choice: "goFirst",
        resolvedFirstPlayerId: premadeSetup.playerOrder[0],
      },
    },
  );
  if (created.snapshot === undefined) {
    throw new Error("Expected an active match snapshot.");
  }
  let snapshot = snapshotFromRegistry(registry, matchId);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const endTurn = Object.values(snapshot.players).some((player) =>
      player.actions.some((action) => action.label === "End turn"),
    );
    if (endTurn) {
      break;
    }
    snapshot = await submitFirstVisibleAction(
      registry,
      matchId,
      snapshot,
      `rollback-setup-${String(attempt)}`,
    );
  }
  const selected = firstVisibleAction(
    snapshot,
    (action) => action.label === "End turn",
  );
  const submitted = await submitFirstVisibleAction(
    registry,
    matchId,
    snapshot,
    "rollback-source-action",
    (action) => action.index === selected.action.index,
  );
  const rollbackPoint = submitted.rollback?.points[0];
  if (rollbackPoint === undefined) {
    throw new Error("Expected accepted action to create a rollback point.");
  }
  const rollbackRequest: SessionActionRequest = {
    type: "requestRollback",
    playerId: selected.playerId,
    rollbackPointId: rollbackPoint.rollbackPointId,
    expectedStateSeq: submitted.stateSeq,
  };
  const requested = await registry.applyEnvelope(
    envelopeForRequest(
      matchId,
      rollbackRequest,
      submitted.stateSeq,
      "rollback-request",
    ),
  );
  if (
    requested === "matchNotFound" ||
    !requested.accepted ||
    requested.snapshot === undefined
  ) {
    throw new Error("Expected rollback request to be accepted.");
  }
  const pendingDecision = Object.values(requested.snapshot.players)
    .map((player) => player.view.pendingDecision)
    .find((decision) => decision?.type === "rollbackConsent");
  if (pendingDecision?.type !== "rollbackConsent") {
    throw new Error("Expected rollback consent decision.");
  }
  const approveRequest: SessionActionRequest = {
    type: "respondToDecision",
    playerId: pendingDecision.playerId,
    decisionId: pendingDecision.id,
    response: { type: "rollbackConsent", allow: true },
  };
  const approved = await registry.applyEnvelope(
    envelopeForRequest(
      matchId,
      approveRequest,
      requested.snapshot.stateSeq,
      "rollback-approve",
    ),
  );
  if (
    approved === "matchNotFound" ||
    !approved.accepted ||
    approved.snapshot === undefined
  ) {
    throw new Error("Expected rollback approval to be accepted.");
  }
  const liveMatch = registry.getMatch(matchId);
  const persistedSnapshot = await persistence.loadSnapshot(matchId);
  const deterministicEntries =
    persistedSnapshot?.deterministicEntriesSinceSnapshot?.map(
      (record) => record.deterministicEntry,
    ) ?? [];
  const restoreEntry = deterministicEntries.find(
    (entry) =>
      entry.kind === "system" &&
      entry.operation.type === "restoreRollbackPoint",
  );
  const checkpoint = persistedSnapshot?.deterministicCheckpoints
    ?.map((record) => record.checkpoint)
    .find(
      (candidate) => candidate.checkpointId === rollbackPoint.rollbackPointId,
    );

  assert.ok(liveMatch !== undefined);
  assert.ok(restoreEntry !== undefined);
  assert.ok(checkpoint?.snapshot !== undefined);

  const recoveredRegistry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    { createDefaultMatch: false, matchPersistence: persistence },
  );
  const recoveredMatch = recoveredRegistry.getMatch(matchId);

  assert.ok(recoveredMatch !== undefined);
  assert.equal(
    hashReplayStateForScope(recoveredMatch.state, "gameplay-v1"),
    hashReplayStateForScope(liveMatch.state, "gameplay-v1"),
  );
});

test("completed match replays reconstruct from compact deterministic entries", async () => {
  const saveStarted = deferredVoid();
  const saveFinished = deferredVoid();
  let savedRecord: CompletedMatchRecord | undefined;
  const completedMatchRepository: CompletedMatchRepository = {
    async saveCompletedMatch(record) {
      savedRecord = record;
      saveStarted.resolve();
      await saveFinished.promise;
    },
  };
  const registry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    { completedMatchRepository, createDefaultMatch: false },
  );
  const matchId = "deterministic-completed-replay" as MatchId;
  const created = await registry.createMatch({
    ...structuredClone(premadeSetup),
    matchId,
  });
  const ready = await registry.chooseFirstPlayer(
    created.matchId,
    created.firstPlayerChoice.chooserPlayerId,
    "goFirst",
  );
  if (typeof ready === "string" || ready.snapshot === undefined) {
    throw new Error("Unable to start match.");
  }
  let snapshot = ready.snapshot;
  let playerId: PlayerId | undefined;
  let actionIndex: number | undefined;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const concedeOwner = Object.entries(snapshot.players).find(([, player]) =>
      player.actions.some((action) => action.type === "concede"),
    );
    playerId = concedeOwner?.[0] as PlayerId | undefined;
    actionIndex = concedeOwner?.[1].actions.find(
      (action) => action.type === "concede",
    )?.index;
    if (playerId !== undefined && actionIndex !== undefined) {
      break;
    }
    snapshot = await submitFirstVisibleAction(
      registry,
      matchId,
      snapshot,
      `completed-replay-setup-${String(attempt)}`,
    );
  }
  if (playerId === undefined || actionIndex === undefined) {
    throw new Error("Timed out advancing setup to concession.");
  }
  const request: SessionActionRequest = {
    type: "submitAction",
    playerId,
    actionIndex,
    expectedStateSeq: snapshot.stateSeq,
  };
  const actionPromise = registry.applyEnvelope(
    envelopeForRequest(matchId, request, snapshot.stateSeq, "completed-replay"),
  );
  await saveStarted.promise;
  await waitForBotMicrotasks();
  saveFinished.resolve();
  const result = await actionPromise;

  assert.notEqual(result, "matchNotFound");
  assert.equal(typeof result, "object");
  if (typeof result === "object") {
    assert.equal(result.accepted, true);
  }
  assert.ok(savedRecord !== undefined);
  assert.equal(
    savedRecord.replay.deterministicEntries.some(
      (entry) =>
        typeof entry === "object" && entry !== null && "envelope" in entry,
    ),
    false,
  );
  const frameReconstruction = reconstructReplayFrames({
    matchId: savedRecord.matchId,
    status: savedRecord.status,
    gameType: savedRecord.gameType,
    formatId: savedRecord.formatId,
    lobbyId: savedRecord.lobbyId,
    winnerUserId: savedRecord.winnerUserId,
    winnerSeatId: savedRecord.winnerSeatId,
    startedAt: savedRecord.startedAt,
    endedAt: savedRecord.endedAt,
    turnCount: savedRecord.turnCount,
    actionCount: savedRecord.actionCount,
    players: savedRecord.players.map((player) => ({
      seatId: player.seatId,
      userId: player.userId,
      displayName: player.displayName,
      leaderCardNumber: player.leaderCardNumber,
      result: player.result,
      isWinner: player.isWinner,
    })),
    replay: {
      ...(JSON.parse(JSON.stringify(savedRecord.replay)) as Record<
        string,
        unknown
      >),
      manifestSnapshot: savedRecord.cardManifestSnapshot,
    },
  });
  if (frameReconstruction.status !== "ready") {
    throw new Error(frameReconstruction.reason);
  }
  assert.equal(
    frameReconstruction.frames.length,
    savedRecord.replay.deterministicEntries.length + 1,
  );
  const completedMatch = registry.getMatch(matchId);
  if (completedMatch === undefined) {
    throw new Error("Expected completed match for replay size check.");
  }
  const compactBytes = Buffer.byteLength(
    JSON.stringify(savedRecord.replay),
    "utf8",
  );
  const fullSnapshotBytes = Buffer.byteLength(
    JSON.stringify({
      ...savedRecord.replay,
      initialSnapshot: completedMatch.state,
      finalState: completedMatch.state,
      deterministicEntries: savedRecord.replay.deterministicEntries.map(
        (entry) =>
          typeof entry === "object" && entry !== null
            ? {
                ...entry,
                result: { snapshot: completedMatch.state },
              }
            : { entry, result: { snapshot: completedMatch.state } },
      ),
    }),
    "utf8",
  );
  assert.ok(
    compactBytes < fullSnapshotBytes * 0.25,
    `expected compact replay ${String(compactBytes)} bytes to stay below 25% of full snapshot replay ${String(fullSnapshotBytes)} bytes`,
  );
});

test("completed bot matches reconstruct from compact deterministic entries", async () => {
  const saveStarted = deferredVoid();
  const saveFinished = deferredVoid();
  let savedRecord: CompletedMatchRecord | undefined;
  const completedMatchRepository: CompletedMatchRepository = {
    async saveCompletedMatch(record) {
      savedRecord = record;
      saveStarted.resolve();
      await saveFinished.promise;
    },
  };
  let botChoicesRemaining = 20;
  const botPlayerId = premadeSetup.playerOrder[1];
  const registry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    {
      botActionDelayMs: 0,
      botStrategy: {
        chooseAction({ snapshot, botPlayerId: activeBotPlayerId }) {
          if (botChoicesRemaining <= 0) {
            return undefined;
          }
          const botView = snapshot.players[activeBotPlayerId];
          const endTurn = botView?.actions.find(
            (action) => action.label === "End turn",
          );
          const action = endTurn ?? botView?.actions[0];
          if (action === undefined) {
            return undefined;
          }
          botChoicesRemaining -= 1;
          return { type: "submitAction", actionIndex: action.index };
        },
      },
      completedMatchRepository,
      createDefaultMatch: false,
    },
  );
  const matchId = "deterministic-completed-bot-replay" as MatchId;
  const created = await registry.createMatch(
    {
      ...structuredClone(premadeSetup),
      matchId,
    },
    {
      firstPlayerChoice: {
        source: "game-one-random-chooser",
        chooserPlayerId: premadeSetup.playerOrder[0],
        choice: "goFirst",
        resolvedFirstPlayerId: premadeSetup.playerOrder[0],
      },
      botPlayerIds: [botPlayerId],
    },
  );
  if (created.snapshot === undefined) {
    throw new Error("Expected active bot match snapshot.");
  }
  await waitForBotMicrotasks();

  let snapshot = snapshotFromRegistry(registry, matchId);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const liveMatch = registry.getMatch(matchId);
    if (liveMatch?.state.status.type === "completed") {
      break;
    }
    const humanAction = Object.entries(snapshot.players)
      .flatMap(([playerId, player]) =>
        playerId === String(botPlayerId)
          ? []
          : player.actions.map((action) => ({
              playerId: playerId as PlayerId,
              action,
            })),
      )
      .find((candidate) => candidate.action.type === "concede");
    if (humanAction === undefined) {
      const setupAction = Object.entries(snapshot.players)
        .flatMap(([playerId, player]) =>
          playerId === String(botPlayerId)
            ? []
            : player.actions.map((action) => ({
                playerId: playerId as PlayerId,
                action,
              })),
        )
        .find((candidate) => candidate.action.type !== "concede");
      if (setupAction === undefined) {
        throw new Error("Expected a human setup action.");
      }
      const request: SessionActionRequest = {
        type: "submitAction",
        playerId: setupAction.playerId,
        actionIndex: setupAction.action.index,
        expectedStateSeq: snapshot.stateSeq,
      };
      const result = await registry.applyEnvelope(
        envelopeForRequest(
          matchId,
          request,
          snapshot.stateSeq,
          `completed-bot-replay-setup-${String(attempt)}`,
        ),
      );
      if (result === "matchNotFound" || !result.accepted) {
        throw new Error("Expected human setup action to be accepted.");
      }
      await waitForBotMicrotasks();
      snapshot = snapshotFromRegistry(registry, matchId);
      continue;
    }
    const request: SessionActionRequest = {
      type: "submitAction",
      playerId: humanAction.playerId,
      actionIndex: humanAction.action.index,
      expectedStateSeq: snapshot.stateSeq,
    };
    const actionPromise = registry.applyEnvelope(
      envelopeForRequest(
        matchId,
        request,
        snapshot.stateSeq,
        "completed-bot-replay",
      ),
    );
    await saveStarted.promise;
    await waitForBotMicrotasks();
    saveFinished.resolve();
    const result = await actionPromise;
    assert.notEqual(result, "matchNotFound");
    assert.equal(typeof result, "object");
    if (typeof result === "object") {
      assert.equal(result.accepted, true);
    }
    break;
  }

  assert.ok(savedRecord !== undefined);
  assert.equal(
    savedRecord.replay.deterministicEntries.some(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        "playerId" in entry &&
        entry.playerId === botPlayerId,
    ),
    true,
  );
  const frameReconstruction = reconstructReplayFrames({
    matchId: savedRecord.matchId,
    status: savedRecord.status,
    gameType: savedRecord.gameType,
    formatId: savedRecord.formatId,
    lobbyId: savedRecord.lobbyId,
    winnerUserId: savedRecord.winnerUserId,
    winnerSeatId: savedRecord.winnerSeatId,
    startedAt: savedRecord.startedAt,
    endedAt: savedRecord.endedAt,
    turnCount: savedRecord.turnCount,
    actionCount: savedRecord.actionCount,
    players: savedRecord.players.map((player) => ({
      seatId: player.seatId,
      userId: player.userId,
      displayName: player.displayName,
      leaderCardNumber: player.leaderCardNumber,
      result: player.result,
      isWinner: player.isWinner,
    })),
    replay: {
      ...(JSON.parse(JSON.stringify(savedRecord.replay)) as Record<
        string,
        unknown
      >),
      manifestSnapshot: savedRecord.cardManifestSnapshot,
    },
  });
  if (frameReconstruction.status !== "ready") {
    throw new Error(frameReconstruction.reason);
  }
  assert.equal(
    frameReconstruction.frames.length,
    savedRecord.replay.deterministicEntries.length + 1,
  );
});
