import { strict as assert } from "node:assert";
import { beforeAll, test } from "vitest";

import type { MatchId, PlayerId } from "@optcg/types";

import { requestHash } from "./action-envelope.js";
import { createFixtureDevMatchSetup } from "./default-dev-fixture-fetch.test-support.js";
import {
  createLocalDevMatchRegistry,
  type CreatedDevMatchResponse,
  type LocalDevMatchRegistry,
  type LocalDevMatchSeat,
} from "./dev-local-match-registry.js";
import type { AuthContext } from "./dev-auth.js";
import type { DevMatchSetup } from "./local-match.js";
import type { CompletedMatchRepository } from "./postgres-completed-match.js";
import type { SessionActionRequest } from "./session-types.js";
import type {
  CompletedMatchStatSink,
  CompletedMatchStatSinkInput,
} from "./stat-sink.js";
import { statKeys } from "./user-stat-keys.js";

let premadeSetup: DevMatchSetup;

const firstUserId = "00000000-0000-4000-8000-000000000001";
const secondUserId = "00000000-0000-4000-8000-000000000002";

beforeAll(async () => {
  premadeSetup = await createFixtureDevMatchSetup();
});

const authContext = (
  userId: string,
  sessionId: string,
  displayName: string,
): AuthContext => ({
  subject: {
    type: "user",
    userId,
    sessionId,
    displayName,
  },
});

const waitForScheduledPersistence = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  await Promise.resolve();
};

const seatsWithUsers = (
  setup: DevMatchSetup,
): Record<string, LocalDevMatchSeat> =>
  Object.fromEntries(
    setup.playerOrder.map((playerId, index) => [
      playerId,
      {
        matchId: setup.matchId,
        playerId,
        subject:
          index === 0
            ? authContext(firstUserId, "session-1", "First User").subject
            : authContext(secondUserId, "session-2", "Second User").subject,
      },
    ]),
  );

const createRecordingSink = (): {
  readonly calls: CompletedMatchStatSinkInput[];
  readonly sink: CompletedMatchStatSink;
} => {
  const calls: CompletedMatchStatSinkInput[] = [];
  return {
    calls,
    sink: {
      async recordCompletedMatchStats(input) {
        calls.push(input);
      },
    },
  };
};

const createSavingRepository = (): {
  readonly savedMatchIds: MatchId[];
  readonly repository: CompletedMatchRepository;
} => {
  const savedMatchIds: MatchId[] = [];
  return {
    savedMatchIds,
    repository: {
      async saveCompletedMatch(record) {
        savedMatchIds.push(record.matchId);
      },
    },
  };
};

const firstSetupPlayerId = (setup: DevMatchSetup): PlayerId => {
  const playerId = setup.playerOrder[0];
  if (playerId === undefined) {
    throw new Error("Expected fixture setup to include a first player.");
  }
  return playerId;
};

const startMatch = async (
  matchId: MatchId,
  options: {
    readonly completedMatchRepository?: CompletedMatchRepository;
    readonly statSink?: CompletedMatchStatSink;
  },
): Promise<{
  readonly registry: LocalDevMatchRegistry;
  readonly snapshot: NonNullable<CreatedDevMatchResponse["snapshot"]>;
}> => {
  const setup = { ...structuredClone(premadeSetup), matchId };
  const registry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    {
      createDefaultMatch: false,
      ...(options.completedMatchRepository === undefined
        ? {}
        : { completedMatchRepository: options.completedMatchRepository }),
      ...(options.statSink === undefined ? {} : { statSink: options.statSink }),
    },
  );
  const firstPlayerId = firstSetupPlayerId(setup);
  const created = await registry.createMatch(setup, {
    firstPlayerChoice: {
      source: "game-one-random-chooser",
      chooserPlayerId: firstPlayerId,
      choice: "goFirst",
      resolvedFirstPlayerId: firstPlayerId,
    },
    seats: seatsWithUsers(setup),
  });
  if (created.snapshot === undefined) {
    throw new Error("Expected active match snapshot.");
  }
  return { registry, snapshot: created.snapshot };
};

const completeByConcession = async (
  registry: LocalDevMatchRegistry,
  matchId: MatchId,
  initialSnapshot: NonNullable<CreatedDevMatchResponse["snapshot"]>,
  options: { readonly submitEventStatAction?: boolean } = {},
): Promise<{ readonly submittedEventStatAction: boolean }> => {
  let snapshot = initialSnapshot;
  let submittedEventStatAction = false;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (options.submitEventStatAction === true && !submittedEventStatAction) {
      const eventActionOwner = Object.entries(snapshot.players).find(
        ([, player]) =>
          player.actions.some((action) => action.type === "attachDon"),
      );
      const eventPlayerId = eventActionOwner?.[0] as PlayerId | undefined;
      const eventActionIndex = eventActionOwner?.[1].actions.find(
        (action) => action.type === "attachDon",
      )?.index;
      if (eventPlayerId !== undefined && eventActionIndex !== undefined) {
        const request: SessionActionRequest = {
          type: "submitAction",
          playerId: eventPlayerId,
          actionIndex: eventActionIndex,
          expectedStateSeq: snapshot.stateSeq,
        };
        const result = await registry.applyEnvelope({
          protocolVersion: "dev",
          matchId,
          playerId: eventPlayerId,
          clientActionId: `stats-event-action-${String(attempt)}`,
          expectedStateSeq: snapshot.stateSeq,
          requestHash: requestHash(request),
          request,
        });
        if (result === "matchNotFound" || !result.accepted) {
          throw new Error("Expected event-stat action to be accepted.");
        }
        if (result.snapshot === undefined) {
          throw new Error("Expected event-stat action snapshot.");
        }
        submittedEventStatAction = true;
        snapshot = result.snapshot;
        continue;
      }
    }

    const concedeOwner = Object.entries(snapshot.players).find(([, player]) =>
      player.actions.some((action) => action.type === "concede"),
    );
    const concedePlayerId = concedeOwner?.[0] as PlayerId | undefined;
    const concedeActionIndex = concedeOwner?.[1].actions.find(
      (action) => action.type === "concede",
    )?.index;
    if (concedePlayerId !== undefined && concedeActionIndex !== undefined) {
      const request: SessionActionRequest = {
        type: "submitAction",
        playerId: concedePlayerId,
        actionIndex: concedeActionIndex,
        expectedStateSeq: snapshot.stateSeq,
      };
      const result = await registry.applyEnvelope({
        protocolVersion: "dev",
        matchId,
        playerId: concedePlayerId,
        clientActionId: `stats-concede-${String(attempt)}`,
        expectedStateSeq: snapshot.stateSeq,
        requestHash: requestHash(request),
        request,
      });
      if (result === "matchNotFound" || !result.accepted) {
        throw new Error("Expected concession action to be accepted.");
      }
      return { submittedEventStatAction };
    }

    const pendingPlayerId = Object.values(snapshot.players).find(
      (player) => player.view.pendingDecision !== undefined,
    )?.view.pendingDecision?.playerId;
    if (pendingPlayerId === undefined) {
      throw new Error("Expected pending setup before concede action.");
    }
    const setupAction = snapshot.players[pendingPlayerId]?.actions[0];
    if (setupAction?.index === undefined) {
      throw new Error("Expected visible setup action.");
    }
    const request: SessionActionRequest = {
      type: "submitAction",
      playerId: pendingPlayerId,
      actionIndex: setupAction.index,
      expectedStateSeq: snapshot.stateSeq,
    };
    const result = await registry.applyEnvelope({
      protocolVersion: "dev",
      matchId,
      playerId: pendingPlayerId,
      clientActionId: `stats-setup-${String(attempt)}`,
      expectedStateSeq: snapshot.stateSeq,
      requestHash: requestHash(request),
      request,
    });
    if (result === "matchNotFound" || !result.accepted) {
      throw new Error("Expected setup action to be accepted.");
    }
    if (result.snapshot === undefined) {
      throw new Error("Expected setup action snapshot.");
    }
    snapshot = result.snapshot;
  }
  throw new Error("Timed out advancing setup to concession.");
};

test("records completed-match stats after saving the completed match", async () => {
  const { repository, savedMatchIds } = createSavingRepository();
  const { sink, calls } = createRecordingSink();
  const matchId = "stats-recorded-after-save" as MatchId;
  const { registry, snapshot } = await startMatch(matchId, {
    completedMatchRepository: repository,
    statSink: sink,
  });

  const completed = await completeByConcession(registry, matchId, snapshot, {
    submitEventStatAction: true,
  });
  await waitForScheduledPersistence();

  assert.equal(completed.submittedEventStatAction, true);
  assert.deepEqual(savedMatchIds, [matchId]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.matchId, matchId);
  assert.equal(
    calls[0]?.operations.some(
      (operation) =>
        operation.userId === firstUserId &&
        operation.statKey === "matches_completed",
    ),
    true,
  );
  assert.equal(
    calls[0]?.operations.some(
      (operation) =>
        operation.userId === firstUserId &&
        operation.statKey === statKeys.donAttached,
    ),
    true,
  );
});

test("does not record stats without a completed-match repository", async () => {
  const { sink, calls } = createRecordingSink();
  const matchId = "stats-no-repository" as MatchId;
  const { registry, snapshot } = await startMatch(matchId, { statSink: sink });

  await completeByConcession(registry, matchId, snapshot);
  await waitForScheduledPersistence();

  assert.deepEqual(calls, []);
});

test("does not record stats when completed-match save fails", async () => {
  const { sink, calls } = createRecordingSink();
  const repository: CompletedMatchRepository = {
    async saveCompletedMatch() {
      throw new Error("save failed");
    },
  };
  const matchId = "stats-save-fails" as MatchId;
  const { registry, snapshot } = await startMatch(matchId, {
    completedMatchRepository: repository,
    statSink: sink,
  });

  await completeByConcession(registry, matchId, snapshot);
  await waitForScheduledPersistence();

  assert.deepEqual(calls, []);
});

test("records completed-match stats once when completion persistence is scheduled repeatedly", async () => {
  const { repository } = createSavingRepository();
  const { sink, calls } = createRecordingSink();
  const matchId = "stats-once" as MatchId;
  const { registry, snapshot } = await startMatch(matchId, {
    completedMatchRepository: repository,
    statSink: sink,
  });

  await completeByConcession(registry, matchId, snapshot);
  await completeByConcession(registry, matchId, snapshot).catch(
    () => undefined,
  );
  await waitForScheduledPersistence();
  await waitForScheduledPersistence();

  assert.equal(calls.length, 1);
});
