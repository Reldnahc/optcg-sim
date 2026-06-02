import assert from "node:assert/strict";

import type {
  CardId,
  EngineEventId,
  EffectDefinition,
  MatchId,
  PlayerId,
  ResolvedCard,
  StateSeq,
} from "@optcg/types";

import { createInitialState } from "./setup/initial-state.js";
import {
  respondToMulliganDecision,
  startMulliganFlow,
} from "./setup/mulligan.js";

export const toMatchId = (value: string): MatchId => value as MatchId;
export const toPlayerId = (value: string): PlayerId => value as PlayerId;
export const toCardId = (value: string): CardId => value as CardId;
export const toEngineEventId = (value: string): EngineEventId =>
  value as EngineEventId;
export const toStateSeq = (value: number): StateSeq => value as StateSeq;

export const p1 = toPlayerId("p1");
export const p2 = toPlayerId("p2");

export const must = <T>(value: T | undefined, label: string): T => {
  assert.ok(value !== undefined, `missing ${label}`);
  return value;
};

export const valueContainsScalar = (
  value: unknown,
  target: string,
): boolean => {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value) === target;
  }
  if (value === null || value === undefined) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((item) => valueContainsScalar(item, target));
  }
  if (typeof value === "object") {
    return Object.values(value).some((item) =>
      valueContainsScalar(item, target),
    );
  }
  return false;
};

export const createInput = () => ({
  matchId: toMatchId("match-actions-1"),
  firstPlayerId: p1,
  rngSeed: "seed-actions-1",
  playerOrder: [p1, p2] as const,
  leaderCardIds: {
    [p1]: toCardId("leader-red"),
    [p2]: toCardId("leader-blue"),
  },
  leaderLifeCounts: {
    [p1]: 2,
    [p2]: 2,
  },
  deckCardIds: {
    [p1]: ["p1-a", "p1-b", "p1-c", "p1-d", "p1-e", "p1-f", "p1-g", "p1-h"].map(
      toCardId,
    ),
    [p2]: ["p2-a", "p2-b", "p2-c", "p2-d", "p2-e", "p2-f", "p2-g", "p2-h"].map(
      toCardId,
    ),
  },
  donDeckCardIds: {
    [p1]: ["p1-don-1", "p1-don-2", "p1-don-3"].map(toCardId),
    [p2]: ["p2-don-1", "p2-don-2", "p2-don-3"].map(toCardId),
  },
  cardManifest: {
    manifestHash: "manifest-actions-1",
    source: "manual-test" as const,
    cardDataVersion: "fixture",
    effectDefinitionsVersion: "fixture",
    customHandlerVersion: "fixture",
    banlistVersion: "fixture",
    createdAt: "2026-05-04T00:00:00.000Z",
    cards: {},
  },
  shuffleDecks: false,
});

export const resolvedCard = (params: {
  cardId: CardId;
  category: "leader" | "character" | "don" | "stage" | "event";
  cost?: number;
  power?: number;
  counter?: number;
  effectText?: string;
  triggerText?: string;
  printedKeywords?: (
    | "rush"
    | "rushCharacter"
    | "doubleAttack"
    | "banish"
    | "blocker"
    | "unblockable"
  )[];
  support?: Partial<ResolvedCard["support"]>;
}): ResolvedCard => {
  const support: ResolvedCard["support"] = {
    cardId: params.cardId,
    status: "vanilla-confirmed",
    tested: true,
    rulesVersion: "r1",
    cardDataVersion: "fixture",
    sourceTextHash: "source-hash",
    behaviorHash: "behavior-hash",
    ...params.support,
  };
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
    types: [],
    printedKeywords: params.printedKeywords ?? [],
    variants: [],
    legality: {},
    officialFaq: [],
    errata: [],
    sourceTextHash: "source-hash",
    behaviorHash: "behavior-hash",
    support,
    ...(params.power !== undefined ? { power: params.power } : {}),
    ...(params.cost !== undefined ? { cost: params.cost } : {}),
    ...(params.counter !== undefined ? { counter: params.counter } : {}),
    ...(params.effectText !== undefined
      ? { effectText: params.effectText }
      : {}),
    ...(params.triggerText !== undefined
      ? { triggerText: params.triggerText }
      : {}),
  } satisfies ResolvedCard;
  return base;
};

export const reviewedOnPlayDrawDefinition = (
  cardId: CardId,
  support: ResolvedCard["support"],
): EffectDefinition => ({
  cardId,
  implementationStatus: "implemented-dsl",
  effects: [
    {
      id: "OP01-015:auto-on-play-1" as EffectDefinition["effects"][number]["id"],
      category: "auto",
      trigger: { type: "onPlay" },
      optional: false,
      oncePerTurn: false,
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: { type: "draw", count: 1, player: "self" },
    },
  ],
  metadata: {
    sourceTextHash: support.sourceTextHash,
    rulesVersion: support.rulesVersion,
    effectDefinitionsVersion: "0.1.0",
    tested: true,
    reviewer: "qa-reviewer",
  },
});

export const reviewedMainEventDrawDefinition = (
  cardId: CardId,
  support: ResolvedCard["support"],
): EffectDefinition => ({
  cardId,
  implementationStatus: "implemented-dsl",
  effects: [
    {
      id: "OP01-099:event-main-1" as EffectDefinition["effects"][number]["id"],
      category: "auto",
      trigger: { type: "main" },
      sourcePresencePolicy: "resolveFromDestinationZone",
      effect: { type: "draw", count: 1, player: "self" },
    },
  ],
  metadata: {
    sourceTextHash: support.sourceTextHash,
    rulesVersion: support.rulesVersion,
    effectDefinitionsVersion: "0.1.0",
    tested: true,
    reviewer: "qa-reviewer",
  },
});

export const createActiveState = () => {
  const setup = createInitialState(createInput());
  const started = startMulliganFlow(setup);
  const first = respondToMulliganDecision(started.state, {
    type: "respondToDecision",
    decisionId: must(started.state.pendingDecision, "first decision").id,
    response: { type: "mulligan", keep: true },
  });
  return respondToMulliganDecision(first.state, {
    type: "respondToDecision",
    decisionId: must(first.state.pendingDecision, "second decision").id,
    response: { type: "mulligan", keep: true },
  }).state;
};

export const addExtraDeckCard = (
  state: ReturnType<typeof createActiveState>,
  playerId: PlayerId = p1,
): void => {
  const player = must(state.players[playerId], "player");
  const topDeck = must(player.deck[0], "top deck");
  player.deck = [
    ...player.deck,
    {
      ...topDeck,
      instanceId:
        `${String(topDeck.instanceId)}:extra` as typeof topDeck.instanceId,
      zone: {
        zone: "deck",
        playerId,
        slot: "deck",
        index: player.deck.length,
      },
    },
  ];
};
