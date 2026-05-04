import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  MatchCardManifest,
  MatchId,
  PlayerId,
} from "@optcg/types";

import { applyAction } from "./actions.js";
import { hashCanonicalStateValue } from "./canonical-state.js";
import { createInitialState } from "./initial-state.js";
import { respondToMulliganDecision, startMulliganFlow } from "./mulligan.js";

const toCardId = (value: string): CardId => value as CardId;
const toMatchId = (value: string): MatchId => value as MatchId;
const toPlayerId = (value: string): PlayerId => value as PlayerId;
const must = <T>(value: T | undefined, label: string): T => {
  assert.ok(value !== undefined, `missing ${label}`);
  return value;
};

type SetupStep =
  | { type: "setMainPhase"; turnPlayerId: string; globalTurn: number }
  | {
      type: "addCharacterFromHand";
      playerId: string;
      handIndex: number;
      state: "active" | "rested";
      turnPlayed: number;
    }
  | { type: "setLeaderLifeCount"; playerId: string; lifeCount: number }
  | { type: "setDeckEmpty"; playerId: string }
  | {
      type: "setCardPower";
      cardId: string;
      category: "leader" | "character";
      power: number;
    };

type ActionStep =
  | { type: "concede"; playerId: string }
  | { type: "endMainPhase" }
  | {
      type: "declareAttack";
      attacker: "p1Leader" | "p2Leader" | "p1Character0" | "p2Character0";
      target: "p1Leader" | "p2Leader" | "p1Character0" | "p2Character0";
    };

type ExpectedCheckpoint = {
  stateSeq: number;
  actionSeq: number;
  turnNumber: number;
  fullStateHash: string;
  snapshotRef?: string;
};

type ScenarioFixture = {
  id: string;
  setupScript: SetupStep[];
  actionScript: ActionStep[];
  expected: {
    checkpoints: ExpectedCheckpoint[];
    finalStateHash: string;
    finalStatus: { type: "active" } | { type: "completed"; winner: string };
  };
};

type LocalReplayFixture = {
  fixtureType: "engineCoreReplaySmokeLocalV2";
  description: string;
  setupInput: {
    matchId: string;
    firstPlayerId: string;
    rngSeed: string;
    playerOrder: readonly [string, string];
    leaderCardIds: Record<string, string>;
    leaderLifeCounts: Record<string, number>;
    deckCardIds: Record<string, string[]>;
    donDeckCardIds: Record<string, string[]>;
    cardManifest: {
      manifestHash: string;
      source: "poneglyph" | "poneglyph-fixture" | "manual-test";
      cardDataVersion: string;
      effectDefinitionsVersion: string;
      customHandlerVersion: string;
      banlistVersion: string;
      cards: Record<string, unknown>;
      createdAt: string;
    };
    shuffleDecks: boolean;
  };
  mulliganResponses: ReadonlyArray<{ playerId: string; keep: boolean }>;
  scenarios: ScenarioFixture[];
};

type LocalReplayFixtureV1 = {
  fixtureType: "engineCoreReplaySmokeLocalV1";
  description: string;
  setupInput: LocalReplayFixture["setupInput"];
  mulliganResponses: ReadonlyArray<{ playerId: string; keep: boolean }>;
  actionScript: ReadonlyArray<{ type: "concede"; playerId: string }>;
  expected: {
    checkpoints: ReadonlyArray<{ label: string; stateHash: string }>;
    finalStateHash: string;
  };
};

const fixturePathV2 = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/replays/eng-003e-vanilla-combat.local.json",
);
const fixturePathV1 = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/replays/eng-002-smoke.local.json",
);

const forbiddenFixtureKeyPatterns = [
  /timestamp/i,
  /receivedAt/i,
  /connectionId/i,
  /clientActionId/i,
  /signature/i,
  /transport/i,
  /userId/i,
  /server/i,
  /metadata/i,
];

const loadFixtureV2 = (): LocalReplayFixture => {
  const parsed = JSON.parse(readFileSync(fixturePathV2, "utf8")) as unknown;
  return parsed as LocalReplayFixture;
};
const loadFixtureV1 = (): LocalReplayFixtureV1 => {
  const parsed = JSON.parse(readFileSync(fixturePathV1, "utf8")) as unknown;
  return parsed as LocalReplayFixtureV1;
};

const collectForbiddenKeys = (value: unknown, pathPrefix: string): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectForbiddenKeys(item, `${pathPrefix}[${String(index)}]`),
    );
  }
  if (value === null || typeof value !== "object") {
    return [];
  }
  return Object.entries(value).flatMap(([key, nestedValue]) => {
    const keyPath = pathPrefix.length > 0 ? `${pathPrefix}.${key}` : key;
    const matched = forbiddenFixtureKeyPatterns.some((pattern) =>
      pattern.test(key),
    )
      ? [keyPath]
      : [];
    return [...matched, ...collectForbiddenKeys(nestedValue, keyPath)];
  });
};

const runMulliganAndStart = (fixture: LocalReplayFixture) => {
  const setupInput = fixture.setupInput;
  const p1 = toPlayerId(setupInput.playerOrder[0]);
  const p2 = toPlayerId(setupInput.playerOrder[1]);
  const setup = createInitialState({
    matchId: toMatchId(setupInput.matchId),
    firstPlayerId: toPlayerId(setupInput.firstPlayerId),
    rngSeed: setupInput.rngSeed,
    playerOrder: [p1, p2],
    leaderCardIds: {
      [p1]: toCardId(must(setupInput.leaderCardIds[p1], "p1 leaderCardId")),
      [p2]: toCardId(must(setupInput.leaderCardIds[p2], "p2 leaderCardId")),
    },
    leaderLifeCounts: {
      [p1]: must(setupInput.leaderLifeCounts[p1], "p1 leaderLifeCounts"),
      [p2]: must(setupInput.leaderLifeCounts[p2], "p2 leaderLifeCounts"),
    },
    deckCardIds: {
      [p1]: must(setupInput.deckCardIds[p1], "p1 deckCardIds").map(toCardId),
      [p2]: must(setupInput.deckCardIds[p2], "p2 deckCardIds").map(toCardId),
    },
    donDeckCardIds: {
      [p1]: must(setupInput.donDeckCardIds[p1], "p1 donDeckCardIds").map(
        toCardId,
      ),
      [p2]: must(setupInput.donDeckCardIds[p2], "p2 donDeckCardIds").map(
        toCardId,
      ),
    },
    cardManifest: setupInput.cardManifest as MatchCardManifest,
    shuffleDecks: setupInput.shuffleDecks,
  });
  const started = startMulliganFlow(setup);
  let state = started.state;
  fixture.mulliganResponses.forEach((response, index) => {
    const pending = state.pendingDecision;
    assert.ok(
      pending,
      `missing pending mulligan decision at index ${String(index)}`,
    );
    assert.equal(
      pending.playerId,
      toPlayerId(response.playerId),
      `mulligan responder drift at index ${String(index)}`,
    );
    const result = respondToMulliganDecision(state, {
      type: "respondToDecision",
      decisionId: pending.id,
      response: { type: "mulligan", keep: response.keep },
    });
    assert.equal(result.errors, undefined);
    state = result.state;
  });
  return state;
};

const reindexHand = (cards: CardInstance[], playerId: PlayerId) =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "hand" as const, playerId, slot: "hand" as const, index },
  }));

const applySetupScript = (
  state: ReturnType<typeof runMulliganAndStart>,
  script: SetupStep[],
) => {
  for (const step of script) {
    if (step.type === "setMainPhase") {
      state.turn.phase = "main";
      state.turn.turnPlayerId = toPlayerId(step.turnPlayerId);
      state.turn.globalTurn = step.globalTurn;
      const p1 = toPlayerId("p1");
      const p2 = toPlayerId("p2");
      state.turn.playerTurnCounts[p1] = Math.max(
        state.turn.playerTurnCounts[p1] ?? 0,
        2,
      );
      state.turn.playerTurnCounts[p2] = Math.max(
        state.turn.playerTurnCounts[p2] ?? 0,
        1,
      );
      for (const player of Object.values(state.players)) {
        player.leader.state = "active";
        player.characters = player.characters.map((character) => ({
          ...character,
          state: "active",
        }));
      }
      continue;
    }
    if (step.type === "addCharacterFromHand") {
      const playerId = toPlayerId(step.playerId);
      const player = must(state.players[playerId], `player ${playerId}`);
      const fromHand = must(
        player.hand[step.handIndex],
        `${playerId} hand index ${String(step.handIndex)}`,
      );
      player.characters.push({
        ...fromHand,
        zone: {
          zone: "characterArea",
          playerId,
          slot: "character",
          index: player.characters.length,
        },
        state: step.state,
        attachedDon: [],
        turnPlayed: step.turnPlayed,
      });
      player.hand = reindexHand(
        player.hand.filter((_, index) => index !== step.handIndex),
        playerId,
      );
      continue;
    }
    if (step.type === "setLeaderLifeCount") {
      const playerId = toPlayerId(step.playerId);
      const player = must(state.players[playerId], `player ${playerId}`);
      player.life = player.life.slice(0, step.lifeCount).map((life, index) => ({
        ...life,
        card: {
          ...life.card,
          zone: { zone: "life", playerId, slot: "life", index },
        },
      }));
      continue;
    }
    if (step.type === "setDeckEmpty") {
      const playerId = toPlayerId(step.playerId);
      const player = must(state.players[playerId], `player ${playerId}`);
      player.deck = [];
      continue;
    }
    const cardId = toCardId(step.cardId);
    const existing = state.cardManifest.cards[cardId];
    assert.ok(existing !== undefined, `missing manifest card ${step.cardId}`);
    state.cardManifest.cards[cardId] = {
      ...existing,
      power: step.power,
    };
  }
};

const toCheckpoint = (
  state: ReturnType<typeof runMulliganAndStart>,
  snapshotRef?: string,
): ExpectedCheckpoint => ({
  stateSeq: Number(state.seq),
  actionSeq: state.actionSeq,
  turnNumber: state.turn.globalTurn,
  fullStateHash: hashCanonicalStateValue(state),
  ...(snapshotRef !== undefined ? { snapshotRef } : {}),
});

const getCombatRef = (
  state: ReturnType<typeof runMulliganAndStart>,
  actor: "p1Leader" | "p2Leader" | "p1Character0" | "p2Character0",
) => {
  const map = {
    p1Leader: () => must(state.players[toPlayerId("p1")], "p1").leader,
    p2Leader: () => must(state.players[toPlayerId("p2")], "p2").leader,
    p1Character0: () =>
      must(
        must(state.players[toPlayerId("p1")], "p1").characters[0],
        "p1 character 0",
      ),
    p2Character0: () =>
      must(
        must(state.players[toPlayerId("p2")], "p2").characters[0],
        "p2 character 0",
      ),
  } as const;
  const card = map[actor]();
  return {
    instanceId: card.instanceId,
    cardId: card.cardId,
    playerId: toPlayerId(actor.startsWith("p1") ? "p1" : "p2"),
  };
};

const replayScenario = (
  fixture: LocalReplayFixture,
  scenario: ScenarioFixture,
) => {
  const state = runMulliganAndStart(fixture);
  applySetupScript(state, scenario.setupScript);
  const checkpoints: ExpectedCheckpoint[] = [
    toCheckpoint(state, `${scenario.id}:setup`),
  ];
  let current = state;
  for (const [index, action] of scenario.actionScript.entries()) {
    const parsedAction =
      action.type === "concede"
        ? { type: "concede" as const, playerId: toPlayerId(action.playerId) }
        : action.type === "endMainPhase"
          ? { type: "endMainPhase" as const }
          : {
              type: "declareAttack" as const,
              attacker: getCombatRef(current, action.attacker),
              target: getCombatRef(current, action.target),
            };
    const result = applyAction(current, parsedAction);
    assert.equal(result.errors, undefined);
    current = result.state;
    checkpoints.push(
      toCheckpoint(current, `${scenario.id}:action-${String(index + 1)}`),
    );
  }
  return {
    checkpoints,
    finalStateHash: hashCanonicalStateValue(current),
    finalStatus: current.status,
  };
};

const replayFixtureV1 = (fixture: LocalReplayFixtureV1) => {
  const setupInput = fixture.setupInput;
  const p1 = toPlayerId(setupInput.playerOrder[0]);
  const p2 = toPlayerId(setupInput.playerOrder[1]);
  const checkpoints: Array<{ label: string; stateHash: string }> = [];
  const setup = createInitialState({
    matchId: toMatchId(setupInput.matchId),
    firstPlayerId: toPlayerId(setupInput.firstPlayerId),
    rngSeed: setupInput.rngSeed,
    playerOrder: [p1, p2],
    leaderCardIds: {
      [p1]: toCardId(must(setupInput.leaderCardIds[p1], "p1 leaderCardId")),
      [p2]: toCardId(must(setupInput.leaderCardIds[p2], "p2 leaderCardId")),
    },
    leaderLifeCounts: {
      [p1]: must(setupInput.leaderLifeCounts[p1], "p1 leaderLifeCounts"),
      [p2]: must(setupInput.leaderLifeCounts[p2], "p2 leaderLifeCounts"),
    },
    deckCardIds: {
      [p1]: must(setupInput.deckCardIds[p1], "p1 deckCardIds").map(toCardId),
      [p2]: must(setupInput.deckCardIds[p2], "p2 deckCardIds").map(toCardId),
    },
    donDeckCardIds: {
      [p1]: must(setupInput.donDeckCardIds[p1], "p1 donDeckCardIds").map(
        toCardId,
      ),
      [p2]: must(setupInput.donDeckCardIds[p2], "p2 donDeckCardIds").map(
        toCardId,
      ),
    },
    cardManifest: setupInput.cardManifest as MatchCardManifest,
    shuffleDecks: setupInput.shuffleDecks,
  });
  checkpoints.push({
    label: "setup",
    stateHash: hashCanonicalStateValue(setup),
  });
  const started = startMulliganFlow(setup);
  checkpoints.push({ label: "mulligan-started", stateHash: started.stateHash });
  let state = started.state;
  fixture.mulliganResponses.forEach((response, index) => {
    const pending = state.pendingDecision;
    assert.ok(
      pending,
      `missing pending mulligan decision at index ${String(index)}`,
    );
    assert.equal(
      pending.playerId,
      toPlayerId(response.playerId),
      `mulligan responder drift at index ${String(index)}`,
    );
    const result = respondToMulliganDecision(state, {
      type: "respondToDecision",
      decisionId: pending.id,
      response: { type: "mulligan", keep: response.keep },
    });
    assert.equal(result.errors, undefined);
    state = result.state;
    checkpoints.push({
      label: `mulligan-response-${String(index + 1)}`,
      stateHash: result.stateHash,
    });
  });
  fixture.actionScript.forEach((action, index) => {
    const result = applyAction(state, {
      type: "concede",
      playerId: toPlayerId(action.playerId),
    });
    assert.equal(result.errors, undefined);
    state = result.state;
    checkpoints.push({
      label: `action-${String(index + 1)}-${action.type}`,
      stateHash: result.stateHash,
    });
  });
  return { checkpoints, finalStateHash: checkpoints.at(-1)?.stateHash };
};

test("ENG-002F replay smoke fixture reproduces expected checkpoint and final hashes", () => {
  const fixture = loadFixtureV1();
  const replayed = replayFixtureV1(fixture);
  assert.deepEqual(replayed.checkpoints, fixture.expected.checkpoints);
  assert.equal(replayed.finalStateHash, fixture.expected.finalStateHash);
});

test("ENG-002F action-script drift changes final hash from fixture expectation", () => {
  const fixture = loadFixtureV1();
  const replayed = replayFixtureV1({
    ...fixture,
    actionScript: [{ type: "concede", playerId: "p2" }],
  });
  assert.notEqual(replayed.finalStateHash, fixture.expected.finalStateHash);
});

test("ENG-002F mulligan responder drift is rejected before replaying decisions", () => {
  const fixture = loadFixtureV1();
  const firstResponse = must(
    fixture.mulliganResponses[0],
    "first mulligan response",
  );
  const secondResponse = must(
    fixture.mulliganResponses[1],
    "second mulligan response",
  );
  assert.throws(
    () =>
      replayFixtureV1({
        ...fixture,
        mulliganResponses: [
          { ...firstResponse, playerId: secondResponse.playerId },
          { ...secondResponse, playerId: firstResponse.playerId },
        ],
      }),
    /mulligan responder drift at index 0/,
  );
});

test("ENG-002F fixture rejects timestamp-like and transport-only metadata keys", () => {
  const fixture = loadFixtureV1();
  assert.equal(
    fixture.setupInput.cardManifest.createdAt,
    "2026-05-04T00:00:00.000Z",
  );
  assert.deepEqual(collectForbiddenKeys(fixture, ""), []);
  assert.deepEqual(
    collectForbiddenKeys(
      {
        ...fixture,
        receivedAt: "2026-05-04T00:00:00.000Z",
        connectionId: "conn-1",
        actionScript: [
          {
            ...fixture.actionScript[0],
            clientActionId: "client-action-1",
          },
        ],
      },
      "",
    ).sort(),
    ["actionScript[0].clientActionId", "connectionId", "receivedAt"],
  );
});

test("replay smoke fixture reproduces expected hashes for vanilla Leader damage, Character K.O., and terminal defeats", () => {
  const fixture = loadFixtureV2();
  for (const scenario of fixture.scenarios) {
    const replayed = replayScenario(fixture, scenario);
    assert.deepEqual(replayed.checkpoints, scenario.expected.checkpoints);
    assert.equal(replayed.finalStateHash, scenario.expected.finalStateHash);
    assert.deepEqual(replayed.finalStatus, scenario.expected.finalStatus);
  }
});

test("action-script drift changes final hash from fixture expectation", () => {
  const fixture = loadFixtureV2();
  const scenario = must(fixture.scenarios[0], "scenario 0");
  const replayed = replayScenario(fixture, {
    ...scenario,
    actionScript: [{ type: "endMainPhase" }],
  });
  assert.notEqual(replayed.finalStateHash, scenario.expected.finalStateHash);
});

test("manifest-stat drift changes final hash from fixture expectation", () => {
  const fixture = loadFixtureV2();
  const scenario = must(fixture.scenarios[0], "scenario 0");
  const replayed = replayScenario(fixture, {
    ...scenario,
    setupScript: [
      ...scenario.setupScript,
      {
        type: "setCardPower",
        cardId: "leader-red",
        category: "leader",
        power: 1000,
      },
    ],
  });
  assert.notEqual(replayed.finalStateHash, scenario.expected.finalStateHash);
});

test("fixture determinism rejects transport/audit keys and allows deterministic manifest createdAt", () => {
  const fixture = loadFixtureV2();
  assert.equal(
    fixture.setupInput.cardManifest.createdAt,
    "2026-05-04T00:00:00.000Z",
  );
  assert.deepEqual(collectForbiddenKeys(fixture, ""), []);
  assert.deepEqual(
    collectForbiddenKeys(
      {
        ...fixture,
        connectionId: "conn-1",
        receivedAt: "2026-05-04T00:00:00.000Z",
        scenarios: [
          { ...fixture.scenarios[0], clientActionId: "client-action-1" },
        ],
      },
      "",
    ).sort(),
    ["connectionId", "receivedAt", "scenarios[0].clientActionId"],
  );
});
