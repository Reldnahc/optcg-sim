import { strict as assert } from "node:assert";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, test } from "vitest";
import type { MatchId } from "@optcg/types";

import { createMatchHttpServer } from "./match-http-server.js";
import { createInMemoryMatchPersistence } from "./match-persistence.js";
import type {
  CompletedMatchReplayDetail,
  CompletedMatchReplayRepository,
  CompletedMatchReplaySummary,
} from "./postgres-completed-match.js";

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const replaySummary = (): CompletedMatchReplaySummary => ({
  matchId: "match-1",
  status: "completed",
  gameType: "dev",
  formatId: "dev",
  lobbyId: "lobby-1",
  winnerUserId: "user-1",
  winnerSeatId: "p1",
  startedAt: "2026-06-13T00:00:00.000Z",
  endedAt: "2026-06-13T00:10:00.000Z",
  turnCount: 4,
  actionCount: 12,
  players: [
    {
      seatId: "p1",
      userId: "user-1",
      displayName: "Winner",
      leaderCardNumber: "OP01-001",
      result: "win",
      isWinner: true,
    },
  ],
});

const replayDisplayArtifact = {
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
};

const replayDetail = (
  displayArtifact: unknown = replayDisplayArtifact,
): CompletedMatchReplayDetail => ({
  ...replaySummary(),
  replay: {
    replayFormatVersion: "dev-local-v1",
    manifestSnapshot: {
      cards: {
        "OP01-001": {
          cardId: "OP01-001",
          name: "Leader",
          category: "leader",
          imageUrl: "https://cdn.example/OP01-001.png",
        },
      },
    },
    checkpoints: [
      {
        stateHash: "hash-1",
        state: { players: { p1: { hidden: "server-only" } } },
      },
    ],
    initialDeckOrders: {
      players: { p1: { deckCardIds: ["OP01-001"] } },
    },
    deterministicEntries: [
      {
        envelope: { request: { type: "playCard" } },
        result: {
          snapshot: {
            stateSeq: 1,
            actionSeq: 1,
            stateHash: "hash-1",
            status: "main",
            activePlayerId: "p1",
            players: {
              p1: {
                view: { self: {}, opponent: {}, timers: { players: {} } },
                actions: [],
              },
            },
          },
        },
      },
    ],
    replayDisplayArtifact: displayArtifact,
  },
});

const assertReplayDetailBody = async (response: Response): Promise<void> => {
  const body = (await response.json()) as {
    replay: CompletedMatchReplayDetail;
    frameReconstruction?: unknown;
  };
  assert.equal(body.replay.matchId, "match-1");
  const replay = body.replay;
  assert.deepEqual(replay.replay, {
    replayFormatVersion: "dev-local-v1",
    manifestSnapshot: {
      cards: {
        "OP01-001": {
          cardId: "OP01-001",
          name: "Leader",
          category: "leader",
          imageUrl: "https://cdn.example/OP01-001.png",
        },
      },
    },
  });
  assert.equal(body.frameReconstruction, undefined);
};

const assertReplayFrameChunkBody = async (
  response: Response,
): Promise<void> => {
  const body = (await response.json()) as {
    frameReconstruction?: {
      status?: string;
      frameCount?: number;
      start?: number;
      limit?: number;
      frames?: Array<{ label?: string }>;
    };
  };
  assert.deepEqual(body.frameReconstruction, {
    status: "ready",
    frameCount: 1,
    start: 0,
    limit: 1,
    frames: [
      {
        index: 0,
        actionIndex: 0,
        label: "playCard",
        snapshot: {
          stateSeq: 1,
          actionSeq: 1,
          stateHash: "hash-1",
          status: "main",
          activePlayerId: "p1",
          players: {
            p1: {
              view: { self: {}, opponent: {}, timers: { players: {} } },
              actions: [],
            },
          },
        },
      },
    ],
  });
};

interface FakeReplayRepository extends CompletedMatchReplayRepository {
  readonly listCalls: number[];
  readonly publicDetailCalls: MatchId[];
  readonly detailCalls: MatchId[];
  readonly getPublicReplay: (
    matchId: MatchId,
  ) => Promise<CompletedMatchReplayDetail | undefined>;
}

const createFakeReplayRepository = (
  options: { readonly replayDisplayArtifact?: unknown } = {},
): FakeReplayRepository => {
  const listCalls: number[] = [];
  const publicDetailCalls: MatchId[] = [];
  const detailCalls: MatchId[] = [];
  const replayDisplayArtifactValue =
    "replayDisplayArtifact" in options
      ? options.replayDisplayArtifact
      : replayDisplayArtifact;
  return {
    listCalls,
    publicDetailCalls,
    detailCalls,
    listReplays(limit = 25) {
      listCalls.push(limit);
      return Promise.resolve([replaySummary()]);
    },
    getPublicReplay(matchId) {
      publicDetailCalls.push(matchId);
      if (matchId !== "match-1") {
        return Promise.resolve(undefined);
      }
      return Promise.resolve({
        ...replaySummary(),
        replay: {
          replayFormatVersion: "dev-local-v1",
          manifestSnapshot: {
            cards: {
              "OP01-001": {
                cardId: "OP01-001",
                name: "Leader",
                category: "leader",
                imageUrl: "https://cdn.example/OP01-001.png",
              },
            },
          },
          replayDisplayArtifact: replayDisplayArtifactValue,
        },
      });
    },
    getReplay(matchId) {
      detailCalls.push(matchId);
      if (matchId !== "match-1") {
        return Promise.resolve(undefined);
      }
      return Promise.resolve(replayDetail(replayDisplayArtifactValue));
    },
  };
};

describe("match HTTP server replay routes", () => {
  test("lists replays without account auth", async () => {
    const repository = createFakeReplayRepository();
    const server = await createMatchHttpServer({
      createDefaultMatch: false,
      replayRepository: repository,
    });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/api/replays`);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { replays: [replaySummary()] });
      assert.deepEqual(repository.listCalls, [25]);
    } finally {
      await server.close();
    }
  });

  test("lists replays for the authenticated user", async () => {
    const repository = createFakeReplayRepository();
    const server = await createMatchHttpServer({
      createDefaultMatch: false,
      replayRepository: repository,
    });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/api/replays`, {
        headers: { "x-optcg-session-token": "user:user-1:session-1" },
      });

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { replays: [replaySummary()] });
      assert.deepEqual(repository.listCalls, [25]);
    } finally {
      await server.close();
    }
  });

  test("lists replays without waiting for active match recovery", async () => {
    const repository = createFakeReplayRepository();
    const basePersistence = createInMemoryMatchPersistence();
    let listStartedResolve: () => void = () => undefined;
    let releaseListResolve: () => void = () => undefined;
    const listStarted = new Promise<void>((resolve) => {
      listStartedResolve = resolve;
    });
    const releaseList = new Promise<void>((resolve) => {
      releaseListResolve = resolve;
    });
    const server = await createMatchHttpServer({
      createDefaultMatch: false,
      replayRepository: repository,
      matchPersistence: {
        ...basePersistence,
        async listActiveMatchIds() {
          listStartedResolve();
          await releaseList;
          return [];
        },
      },
    });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/api/replays`);
      const recoveryStarted = await Promise.race([
        listStarted.then(() => true),
        delay(25).then(() => false),
      ]);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { replays: [replaySummary()] });
      assert.equal(recoveryStarted, false);
    } finally {
      releaseListResolve();
      await server.close();
    }
  });

  test("returns replay detail for a participating user", async () => {
    const repository = createFakeReplayRepository();
    const server = await createMatchHttpServer({
      createDefaultMatch: false,
      replayRepository: repository,
    });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/api/replays/match-1`, {
        headers: { "x-optcg-session-token": "user:user-1:session-1" },
      });

      assert.equal(response.status, 200);
      await assertReplayDetailBody(response);
      assert.deepEqual(repository.publicDetailCalls, ["match-1"]);
      assert.deepEqual(repository.detailCalls, []);
    } finally {
      await server.close();
    }
  });

  test("returns legacy replay frame chunks separately from replay detail", async () => {
    const repository = createFakeReplayRepository({
      replayDisplayArtifact: null,
    });
    const server = await createMatchHttpServer({
      createDefaultMatch: false,
      replayRepository: repository,
    });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(
        `${server.url()}/api/replays/match-1/frames?start=0&limit=1`,
      );

      assert.equal(response.status, 200);
      await assertReplayFrameChunkBody(response);
      assert.deepEqual(repository.detailCalls, ["match-1"]);
    } finally {
      await server.close();
    }
  });

  test("display-v1 replay detail omits display frame artifacts", async () => {
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
      assert.equal(body.replay?.replay["replayDisplayArtifact"], undefined);
      assert.deepEqual(repository.detailCalls, []);
    } finally {
      await server.close();
    }
  });

  test("display-v1 replays serve display frame chunks without legacy reconstruction", async () => {
    const repository = createFakeReplayRepository();
    const legacyFrameCacheCalls: MatchId[] = [];
    const server = await createMatchHttpServer({
      createDefaultMatch: false,
      replayRepository: repository,
      legacyReplayFrameCache: {
        getFrameChunk(replay) {
          legacyFrameCacheCalls.push(replay.matchId as MatchId);
          return Promise.resolve({
            status: "ready",
            frameCount: 0,
            start: 0,
            limit: 1,
            frames: [],
          });
        },
      },
    });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(
        `${server.url()}/api/replays/match-1/frames?start=0&limit=1`,
      );
      const body = (await response.json()) as {
        frameReconstruction?: {
          status?: string;
          frameCount?: number;
          start?: number;
          limit?: number;
          frames?: Array<{ label?: string; actionIndex?: number | null }>;
        };
      };

      assert.equal(response.status, 200);
      assert.deepEqual(body.frameReconstruction, {
        status: "ready",
        frameCount: 1,
        start: 0,
        limit: 1,
        frames: [
          {
            index: 0,
            actionIndex: null,
            label: "Initial state",
            snapshot: replayDisplayArtifact.frames[0]?.snapshot,
          },
        ],
      });
      assert.deepEqual(legacyFrameCacheCalls, []);
    } finally {
      await server.close();
    }
  });

  test("malformed display-v1 artifacts use the legacy frame endpoint", async () => {
    const repository = createFakeReplayRepository({
      replayDisplayArtifact: { replayDisplayVersion: "display-v1" },
    });
    const legacyFrameCacheCalls: MatchId[] = [];
    const server = await createMatchHttpServer({
      createDefaultMatch: false,
      replayRepository: repository,
      legacyReplayFrameCache: {
        getFrameChunk(replay, window) {
          legacyFrameCacheCalls.push(replay.matchId as MatchId);
          return Promise.resolve({
            status: "ready",
            frameCount: 1,
            start: window.start,
            limit: window.limit,
            frames: [
              {
                index: 0,
                actionIndex: 0,
                label: "legacy fallback",
                snapshot: {},
              },
            ],
          });
        },
      },
    });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(
        `${server.url()}/api/replays/match-1/frames?start=0&limit=1`,
      );
      const body = (await response.json()) as {
        frameReconstruction?: { frames?: Array<{ label?: string }> };
      };

      assert.equal(response.status, 200);
      assert.deepEqual(legacyFrameCacheCalls, ["match-1"]);
      assert.equal(
        body.frameReconstruction?.frames?.[0]?.label,
        "legacy fallback",
      );
    } finally {
      await server.close();
    }
  });

  test("reuses legacy replay artifact detail across frame chunk requests", async () => {
    const repository = createFakeReplayRepository({
      replayDisplayArtifact: null,
    });
    const server = await createMatchHttpServer({
      createDefaultMatch: false,
      replayRepository: repository,
    });
    await server.listen(0, "127.0.0.1");
    try {
      const first = await fetch(
        `${server.url()}/api/replays/match-1/frames?start=0&limit=1`,
      );
      const second = await fetch(
        `${server.url()}/api/replays/match-1/frames?start=0&limit=1`,
      );

      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.deepEqual(repository.detailCalls, ["match-1"]);
    } finally {
      await server.close();
    }
  });

  test("returns replay detail for a non-participant", async () => {
    const repository = createFakeReplayRepository();
    const server = await createMatchHttpServer({
      createDefaultMatch: false,
      replayRepository: repository,
    });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/api/replays/match-1`, {
        headers: { "x-optcg-session-token": "user:user-2:session-1" },
      });

      assert.equal(response.status, 200);
      await assertReplayDetailBody(response);
      assert.deepEqual(repository.publicDetailCalls, ["match-1"]);
      assert.deepEqual(repository.detailCalls, []);
    } finally {
      await server.close();
    }
  });

  test("serves a local replay fixture when configured", async () => {
    const directory = await mkdtemp(join(tmpdir(), "optcg-replay-fixture-"));
    const fixturePath = join(directory, "replay.json");
    const previousFixturePath =
      process.env["PONEGLYPH_SIM_REPLAY_FIXTURE_PATH"];
    process.env["PONEGLYPH_SIM_REPLAY_FIXTURE_PATH"] = fixturePath;
    await writeFile(
      fixturePath,
      JSON.stringify({ replay: replayDetail() }),
      "utf8",
    );
    const server = await createMatchHttpServer({
      createDefaultMatch: false,
    });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/api/replays/match-1`);

      assert.equal(response.status, 200);
      await assertReplayDetailBody(response);
    } finally {
      await server.close();
      if (previousFixturePath === undefined) {
        delete process.env["PONEGLYPH_SIM_REPLAY_FIXTURE_PATH"];
      } else {
        process.env["PONEGLYPH_SIM_REPLAY_FIXTURE_PATH"] = previousFixturePath;
      }
      await rm(directory, { recursive: true, force: true });
    }
  });
});
