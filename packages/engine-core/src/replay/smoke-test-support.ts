import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  Action,
  CardId,
  CardInstance,
  GameState,
  InstanceId,
  MatchCardManifest,
  MatchId,
  PlayerId,
} from "@optcg/types";

import { applyAction } from "../actions.js";
import { hashCanonicalStateValue } from "../state/canonical-state.js";
import { createInitialState } from "../initial-state.js";
import { assertGameStateInvariants } from "../state/invariants.js";
import { respondToMulliganDecision, startMulliganFlow } from "../mulligan.js";

export const toCardId = (value: string): CardId => value as CardId;
const toMatchId = (value: string): MatchId => value as MatchId;
const toPlayerId = (value: string): PlayerId => value as PlayerId;
export const must = <T>(value: T | undefined, label: string): T => {
  assert.ok(value !== undefined, `missing ${label}`);
  return value;
};

export type SetupStep =
  | { type: "setMainPhase"; turnPlayerId: string; globalTurn: number }
  | { type: "setCostAreaFromDonDeck"; playerId: string; count: number }
  | { type: "setHandFromCardIds"; playerId: string; cardIds: string[] }
  | { type: "setCardAsVanillaMainEvent"; cardId: string; cost: number }
  | {
      type: "addCharacterFromHand";
      playerId: string;
      handIndex: number;
      state: "active" | "rested";
      turnPlayed: number;
    }
  | {
      type: "setCharacters";
      playerId: string;
      cardIds: string[];
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

export type ActionStep =
  | { type: "concede"; playerId: string }
  | { type: "endMainPhase" }
  | { type: "respondToCounterPass" }
  | { type: "playCardFromHand"; playerId: string; handIndex: number }
  | {
      type: "respondToPayment";
      playerId: string;
      costAreaIndices: number[];
    }
  | {
      type: "respondToOverflow";
      playerId: string;
      characterIndex: number;
    }
  | {
      type: "declareAttack";
      attacker: "p1Leader" | "p2Leader" | "p1Character0" | "p2Character0";
      target: "p1Leader" | "p2Leader" | "p1Character0" | "p2Character0";
    };

export type ExpectedCheckpoint = {
  stateSeq: number;
  actionSeq: number;
  turnNumber: number;
  fullStateHash: string;
  snapshotRef?: string;
};

export type ScenarioFixture = {
  id: string;
  setupScript: SetupStep[];
  actionScript: ActionStep[];
  expected: {
    checkpoints: ExpectedCheckpoint[];
    finalStateHash: string;
    finalStatus: { type: "active" } | { type: "completed"; winner: string };
  };
};

export type PlayCardExpectedState = {
  paidDonIndices: number[];
  characters: string[];
  stage?: string;
  trash: string[];
  absentFromCharacters?: string[];
};

export type PlayCardScenarioFixture = ScenarioFixture & {
  expected: ScenarioFixture["expected"] & {
    finalState: PlayCardExpectedState;
  };
};

export type LocalReplayFixture = {
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

export type LocalPlayCardReplayFixture = Omit<
  LocalReplayFixture,
  "fixtureType" | "scenarios"
> & {
  fixtureType: "engineCorePlayCardReplaySmokeLocalV1";
  scenarios: PlayCardScenarioFixture[];
};

export type LocalReplayFixtureV1 = {
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

type ReplaySetupFixture = Pick<
  LocalReplayFixture,
  "setupInput" | "mulliganResponses"
>;

const fixturePathV2 = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../fixtures/replays/eng-003e-vanilla-combat.local.json",
);
const fixturePathEng005C = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../fixtures/replays/eng-005c-play-card.local.json",
);
const fixturePathV1 = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../fixtures/replays/eng-002-smoke.local.json",
);

const forbiddenFixtureKeyPatterns = [
  /timestamp/i,
  /receivedAt/i,
  /connectionId/i,
  /client[-_]?id/i,
  /clientActionId/i,
  /signature/i,
  /transport/i,
  /userId/i,
  /server/i,
  /metadata/i,
];

export const loadFixtureV2 = (): LocalReplayFixture => {
  const parsed = JSON.parse(readFileSync(fixturePathV2, "utf8")) as unknown;
  return parsed as LocalReplayFixture;
};
export const loadPlayCardFixture = (): LocalPlayCardReplayFixture => {
  const parsed = JSON.parse(
    readFileSync(fixturePathEng005C, "utf8"),
  ) as unknown;
  return parsed as LocalPlayCardReplayFixture;
};
export const loadFixtureV1 = (): LocalReplayFixtureV1 => {
  const parsed = JSON.parse(readFileSync(fixturePathV1, "utf8")) as unknown;
  return parsed as LocalReplayFixtureV1;
};

export const collectForbiddenKeys = (
  value: unknown,
  pathPrefix: string,
): string[] => {
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

const runMulliganAndStart = (fixture: ReplaySetupFixture) => {
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

const createSetupHandCard = (
  playerId: PlayerId,
  cardId: CardId,
  index: number,
): CardInstance => ({
  instanceId:
    `setup:${String(playerId)}:hand:${String(cardId)}:${String(index)}` as InstanceId,
  cardId,
  owner: playerId,
  controller: playerId,
  zone: { zone: "hand", playerId, slot: "hand", index },
  attachedDon: [],
});

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
    if (step.type === "setCostAreaFromDonDeck") {
      const playerId = toPlayerId(step.playerId);
      const player = must(state.players[playerId], `player ${playerId}`);
      const moved = player.donDeck.slice(0, step.count).map((card, index) => ({
        ...card,
        zone: {
          zone: "costArea" as const,
          playerId,
          slot: "cost" as const,
          index,
        },
        state: "active" as const,
      }));
      player.costArea = moved;
      player.donDeck = player.donDeck.slice(step.count).map((card, index) => ({
        ...card,
        zone: {
          zone: "donDeck" as const,
          playerId,
          slot: "donDeck" as const,
          index,
        },
      }));
      continue;
    }
    if (step.type === "setHandFromCardIds") {
      const playerId = toPlayerId(step.playerId);
      const player = must(state.players[playerId], `player ${playerId}`);
      player.hand = step.cardIds.map((cardIdValue, index) => {
        const cardId = toCardId(cardIdValue);
        assert.ok(
          state.cardManifest.cards[cardId] !== undefined,
          `missing manifest card ${cardIdValue}`,
        );
        return createSetupHandCard(playerId, cardId, index);
      });
      continue;
    }
    if (step.type === "setCardAsVanillaMainEvent") {
      const cardId = toCardId(step.cardId);
      const existing = state.cardManifest.cards[cardId];
      assert.ok(existing !== undefined, `missing manifest card ${step.cardId}`);
      state.cardManifest.cards[cardId] = {
        ...existing,
        category: "event",
        cost: step.cost,
        effectText: "[Main]",
        triggerText: "",
      };
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
    if (step.type === "setCharacters") {
      const playerId = toPlayerId(step.playerId);
      const player = must(state.players[playerId], `player ${playerId}`);
      player.characters = step.cardIds.map((cardIdValue, index) => {
        const cardId = toCardId(cardIdValue);
        assert.ok(
          state.cardManifest.cards[cardId] !== undefined,
          `missing manifest card ${cardIdValue}`,
        );
        return {
          instanceId:
            `setup:${step.playerId}:character:${cardIdValue}:${String(index)}` as InstanceId,
          cardId,
          owner: playerId,
          controller: playerId,
          zone: {
            zone: "characterArea" as const,
            playerId,
            slot: "character" as const,
            index,
          },
          state: step.state,
          attachedDon: [],
          turnPlayed: step.turnPlayed,
        };
      });
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

export const replayScenario = (
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
          : action.type === "respondToCounterPass"
            ? toCounterPassAction(current)
            : action.type === "declareAttack"
              ? {
                  type: "declareAttack" as const,
                  attacker: getCombatRef(current, action.attacker),
                  target: getCombatRef(current, action.target),
                }
              : null;
    assert.ok(
      parsedAction !== null,
      `unsupported combat replay action ${action.type}`,
    );
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
    finalState: current,
  };
};

const toPaymentAction = (
  state: GameState,
  step: Extract<ActionStep, { type: "respondToPayment" }>,
): Extract<Action, { type: "respondToDecision" }> => {
  const playerId = toPlayerId(step.playerId);
  const player = must(state.players[playerId], `player ${playerId}`);
  const decision = must(state.pendingDecision, "payment decision");
  assert.equal(decision.type, "payCost");
  assert.equal(decision.playerId, playerId);
  return {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: step.costAreaIndices.map(
        (index) =>
          must(player.costArea[index], `costArea ${String(index)}`).instanceId,
      ),
    },
  };
};

const toOverflowAction = (
  state: GameState,
  step: Extract<ActionStep, { type: "respondToOverflow" }>,
): Extract<Action, { type: "respondToDecision" }> => {
  const playerId = toPlayerId(step.playerId);
  const player = must(state.players[playerId], `player ${playerId}`);
  const decision = must(state.pendingDecision, "overflow decision");
  assert.equal(decision.type, "selectCards");
  assert.equal(decision.playerId, playerId);
  const character = must(
    player.characters[step.characterIndex],
    `character ${String(step.characterIndex)}`,
  );
  return {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "cards",
      cards: [
        {
          instanceId: character.instanceId,
          cardId: character.cardId,
          playerId,
          zone: character.zone,
        },
      ],
    },
  };
};

const toCounterPassAction = (
  state: GameState,
): Extract<Action, { type: "respondToDecision" }> => {
  const decision = must(state.pendingDecision, "counter pass decision");
  assert.equal(decision.type, "selectCards");
  assert.equal(decision.prompt, "Use counter or end step.");
  return {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [] },
  };
};

const toPlayCardAction = (
  state: GameState,
  step: Extract<ActionStep, { type: "playCardFromHand" }>,
): Extract<Action, { type: "playCard" }> => {
  const player = must(
    state.players[toPlayerId(step.playerId)],
    `player ${step.playerId}`,
  );
  return {
    type: "playCard",
    cardInstanceId: must(
      player.hand[step.handIndex],
      `hand ${String(step.handIndex)}`,
    ).instanceId,
  };
};

export const replayPlayCardScenario = (
  fixture: LocalPlayCardReplayFixture,
  scenario: PlayCardScenarioFixture,
) => {
  const state = runMulliganAndStart(fixture);
  applySetupScript(state, scenario.setupScript);
  assertGameStateInvariants(state);
  const checkpoints: ExpectedCheckpoint[] = [
    toCheckpoint(state, `${scenario.id}:setup`),
  ];
  let current: GameState = state;
  for (const [index, action] of scenario.actionScript.entries()) {
    const parsedAction =
      action.type === "playCardFromHand"
        ? toPlayCardAction(current, action)
        : action.type === "respondToPayment"
          ? toPaymentAction(current, action)
          : action.type === "respondToOverflow"
            ? toOverflowAction(current, action)
            : action.type === "concede"
              ? {
                  type: "concede" as const,
                  playerId: toPlayerId(action.playerId),
                }
              : action.type === "endMainPhase"
                ? { type: "endMainPhase" as const }
                : action.type === "respondToCounterPass"
                  ? toCounterPassAction(current)
                  : {
                      type: "declareAttack" as const,
                      attacker: getCombatRef(current, action.attacker),
                      target: getCombatRef(current, action.target),
                    };
    const result = applyAction(current, parsedAction);
    assert.equal(result.errors, undefined);
    current = result.state;
    assertGameStateInvariants(current);
    checkpoints.push(
      toCheckpoint(current, `${scenario.id}:action-${String(index + 1)}`),
    );
  }
  return {
    checkpoints,
    finalStateHash: hashCanonicalStateValue(current),
    finalStatus: current.status,
    finalState: current,
  };
};

export const assertPlayCardFinalState = (
  state: GameState,
  expected: PlayCardExpectedState,
) => {
  const p1State = must(state.players[toPlayerId("p1")], "p1");
  for (const index of expected.paidDonIndices) {
    assert.equal(p1State.costArea[index]?.state, "rested");
  }
  assert.deepEqual(
    p1State.characters.map((card) => String(card.cardId)),
    expected.characters,
  );
  assert.equal(p1State.stage?.cardId, expected.stage);
  assert.deepEqual(
    p1State.trash.map((card) => String(card.cardId)),
    expected.trash,
  );
  for (const cardId of expected.absentFromCharacters ?? []) {
    assert.equal(
      p1State.characters.some((card) => String(card.cardId) === cardId),
      false,
    );
  }
  const located = [
    p1State.leader,
    ...p1State.life.map((entry) => entry.card),
    ...p1State.hand,
    ...p1State.deck,
    ...p1State.donDeck,
    ...p1State.costArea,
    ...p1State.characters,
    ...(p1State.stage !== undefined ? [p1State.stage] : []),
    ...p1State.trash,
  ];
  assert.equal(
    new Set(located.map((card) => card.instanceId)).size,
    located.length,
  );
};

export const assertPlayCardReplayDrifts = (
  fixture: LocalPlayCardReplayFixture,
  scenario: PlayCardScenarioFixture,
) => {
  let replayed: ReturnType<typeof replayPlayCardScenario>;
  try {
    replayed = replayPlayCardScenario(fixture, scenario);
  } catch (error) {
    assert.match(
      (error as Error).message,
      /AssertionError|missing|invalid|mismatch|unsupported|illegal/i,
    );
    return;
  }
  assert.notEqual(replayed.finalStateHash, scenario.expected.finalStateHash);
};

export const replayFixtureV1 = (fixture: LocalReplayFixtureV1) => {
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
