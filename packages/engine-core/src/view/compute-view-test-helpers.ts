import assert from "node:assert/strict";

import type {
  CardId,
  CardInstance,
  ContinuousEffectRecord,
  MatchCardManifest,
  MatchId,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

import { createInitialState } from "../setup/initial-state.js";

export const toMatchId = (value: string): MatchId => value as MatchId;
export const toPlayerId = (value: string): PlayerId => value as PlayerId;
export const toCardId = (value: string): CardId => value as CardId;

export const p1 = toPlayerId("p1");
export const p2 = toPlayerId("p2");

export const must = <T>(value: T | undefined, label: string): T => {
  assert.ok(value !== undefined, `missing ${label}`);
  return value;
};

const resolvedCard = (params: {
  cardId: CardId;
  category: "leader" | "character" | "don";
  power?: number;
  printedKeywords?: ResolvedCard["printedKeywords"];
  types?: string[];
}): ResolvedCard => {
  const base = {
    cardId: params.cardId,
    language: "en",
    name: String(params.cardId),
    category: params.category,
    set: "TEST",
    setName: "Test Set",
    released: true,
    colors: ["red"],
    attributes: [],
    types: params.types ?? [],
    printedKeywords: params.printedKeywords ?? [],
    variants: [],
    legality: {},
    officialFaq: [],
    errata: [],
    sourceTextHash: "source-hash",
    behaviorHash: "behavior-hash",
    support: {
      cardId: params.cardId,
      status: "vanilla-confirmed",
      tested: true,
      rulesVersion: "r1",
      cardDataVersion: "fixture",
      sourceTextHash: "source-hash",
      behaviorHash: "behavior-hash",
    },
    ...(params.power !== undefined ? { power: params.power } : {}),
  } satisfies ResolvedCard;
  return base;
};

export const createManifest = (): MatchCardManifest => {
  const cardsById = {
    [toCardId("leader-red")]: resolvedCard({
      cardId: toCardId("leader-red"),
      category: "leader",
      power: 5000,
    }),
    [toCardId("leader-blue")]: resolvedCard({
      cardId: toCardId("leader-blue"),
      category: "leader",
      power: 5000,
    }),
    [toCardId("char-vanilla")]: resolvedCard({
      cardId: toCardId("char-vanilla"),
      category: "character",
      power: 3000,
      types: ["Test Pirates"],
    }),
    [toCardId("char-rush")]: resolvedCard({
      cardId: toCardId("char-rush"),
      category: "character",
      power: 3000,
      printedKeywords: ["rush"],
    }),
    [toCardId("char-rush-character")]: resolvedCard({
      cardId: toCardId("char-rush-character"),
      category: "character",
      power: 3000,
      printedKeywords: ["rushCharacter"],
    }),
    [toCardId("char-blocker")]: resolvedCard({
      cardId: toCardId("char-blocker"),
      category: "character",
      power: 3000,
      printedKeywords: ["blocker"],
    }),
    [toCardId("don-1")]: resolvedCard({
      cardId: toCardId("don-1"),
      category: "don",
    }),
  } as MatchCardManifest["cards"];

  return {
    manifestHash: "manifest-hash",
    source: "manual-test",
    cardDataVersion: "fixture",
    effectDefinitionsVersion: "fixture",
    customHandlerVersion: "fixture",
    banlistVersion: "fixture",
    createdAt: "2026-05-04T00:00:00.000Z",
    cards: cardsById,
  };
};

export const createState = () =>
  createInitialState({
    matchId: toMatchId("match-compute-view-1"),
    firstPlayerId: p1,
    rngSeed: "seed-compute-view-1",
    playerOrder: [p1, p2],
    leaderCardIds: {
      [p1]: toCardId("leader-red"),
      [p2]: toCardId("leader-blue"),
    },
    leaderLifeCounts: {
      [p1]: 0,
      [p2]: 0,
    },
    deckCardIds: {
      [p1]: [
        "char-vanilla",
        "char-rush",
        "char-rush-character",
        "char-vanilla",
        "char-vanilla",
      ].map(toCardId),
      [p2]: [
        "char-vanilla",
        "char-rush",
        "char-rush-character",
        "char-vanilla",
        "char-vanilla",
      ].map(toCardId),
    },
    donDeckCardIds: {
      [p1]: ["don-1", "don-1", "don-1", "don-1", "don-1"].map(toCardId),
      [p2]: ["don-1", "don-1", "don-1", "don-1", "don-1"].map(toCardId),
    },
    cardManifest: createManifest(),
    shuffleDecks: false,
  });

export type EngineInternalBattleState = NonNullable<
  ReturnType<typeof createState>["battle"]
> & { counterPower?: number; damageProcess?: unknown };

export const withCharacter = (
  playerId: PlayerId,
  cardId: CardId,
  index: number,
  options?: { state?: CardInstance["state"]; turnPlayed?: number },
): CardInstance => {
  const card: CardInstance = {
    instanceId:
      `${playerId}:char:${String(index)}:${cardId}` as CardInstance["instanceId"],
    cardId,
    owner: playerId,
    controller: playerId,
    zone: { zone: "characterArea", playerId, slot: "character", index },
    state: options?.state ?? "active",
    attachedDon: [],
  };
  if (options?.turnPlayed !== undefined) {
    card.turnPlayed = options.turnPlayed;
  }
  return card;
};

export const battleRef = (card: CardInstance) => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId: card.controller,
});

export const setMainTurnAfterFirstTurn = (
  state: ReturnType<typeof createState>,
  turnPlayerId: PlayerId = p1,
) => {
  state.turn.phase = "main";
  state.turn.turnPlayerId = turnPlayerId;
  state.turn.globalTurn = 3;
  state.turn.playerTurnCounts[p1] = 2;
  state.turn.playerTurnCounts[p2] = 1;
};

export const continuousPowerEffectRecord = (
  state: ReturnType<typeof createState>,
  options?: {
    id?: string;
    source?: CardInstance;
    modifier?: ContinuousEffectRecord["modifier"];
    duration?: ContinuousEffectRecord["duration"];
    condition?: ContinuousEffectRecord["condition"];
  },
): ContinuousEffectRecord => {
  const source = options?.source ?? must(state.players[p1], "p1 state").leader;
  const sourceCategory =
    source.zone.zone === "leaderArea" ? "leader" : "character";
  const record: ContinuousEffectRecord = {
    id: options?.id ?? "continuous-power-1000",
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: source.controller,
      zone: source.zone,
    },
    sourceSnapshot: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      ownerId: source.owner,
      controllerId: source.controller,
      zone: source.zone,
      category: sourceCategory,
      colors: ["red"],
      power: 5000,
      keywords: [],
    },
    controller: p1,
    modifier: options?.modifier ?? {
      layer: "powerAdd",
      target: { type: "self" },
      operation: { type: "addPower", value: 1000 },
    },
    duration: options?.duration ?? { type: "permanent" },
    createdBy: { type: "ruleProcess", name: "compute-view-test" },
    createdAtStateSeq: state.seq,
  };
  if (options?.condition !== undefined) {
    record.condition = options.condition;
  }
  return record;
};
