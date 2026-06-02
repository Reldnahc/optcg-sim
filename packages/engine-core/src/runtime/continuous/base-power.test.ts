import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  EffectDefinition,
  MatchCardManifest,
  MatchId,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

import { computeView } from "../../compute-view.js";
import { deriveImplementedDslPermanentContinuousEffects } from "./continuous.js";
import { createInitialState } from "../../initial-state.js";

const toMatchId = (value: string): MatchId => value as MatchId;
const toPlayerId = (value: string): PlayerId => value as PlayerId;
const toCardId = (value: string): CardId => value as CardId;

const p1 = toPlayerId("p1");
const p2 = toPlayerId("p2");

const must = <T>(value: T | undefined, label: string): T => {
  assert.ok(value !== undefined, `missing ${label}`);
  return value;
};

const resolvedCard = (params: {
  cardId: CardId;
  category: "leader" | "character" | "don";
  power?: number;
  types?: string[];
}): ResolvedCard => ({
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
  printedKeywords: [],
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
  ...(params.power === undefined ? {} : { power: params.power }),
});

const createManifest = (): MatchCardManifest => ({
  manifestHash: "manifest-hash",
  source: "manual-test",
  cardDataVersion: "fixture",
  effectDefinitionsVersion: "fixture",
  customHandlerVersion: "fixture",
  banlistVersion: "fixture",
  createdAt: "2026-05-04T00:00:00.000Z",
  cards: {
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
    }),
    [toCardId("char-straw-hat")]: resolvedCard({
      cardId: toCardId("char-straw-hat"),
      category: "character",
      power: 1000,
      types: ["Straw Hat Crew"],
    }),
    [toCardId("char-heart")]: resolvedCard({
      cardId: toCardId("char-heart"),
      category: "character",
      power: 4000,
      types: ["Heart Pirates"],
    }),
    [toCardId("don-1")]: resolvedCard({
      cardId: toCardId("don-1"),
      category: "don",
    }),
  },
});

const createState = () =>
  createInitialState({
    matchId: toMatchId("match-effect-runtime-continuous-base-power"),
    firstPlayerId: p1,
    rngSeed: "seed-effect-runtime-continuous-base-power",
    playerOrder: [p1, p2],
    leaderCardIds: {
      [p1]: toCardId("leader-red"),
      [p2]: toCardId("leader-blue"),
    },
    leaderLifeCounts: { [p1]: 0, [p2]: 0 },
    deckCardIds: {
      [p1]: [
        "char-vanilla",
        "char-straw-hat",
        "char-heart",
        "char-vanilla",
        "char-heart",
      ].map(toCardId),
      [p2]: [
        "char-vanilla",
        "char-straw-hat",
        "char-heart",
        "char-vanilla",
        "char-heart",
      ].map(toCardId),
    },
    donDeckCardIds: {
      [p1]: ["don-1", "don-1", "don-1"].map(toCardId),
      [p2]: ["don-1", "don-1", "don-1"].map(toCardId),
    },
    cardManifest: createManifest(),
    shuffleDecks: false,
  });

const withCharacter = (
  playerId: PlayerId,
  cardId: CardId,
  index: number,
): CardInstance => ({
  instanceId:
    `${playerId}:char:${String(index)}:${cardId}` as CardInstance["instanceId"],
  cardId,
  owner: playerId,
  controller: playerId,
  zone: { zone: "characterArea", playerId, slot: "character", index },
  state: "active",
  attachedDon: [],
});

type SetBasePowerEffect = Extract<
  EffectDefinition["effects"][number]["effect"],
  { type: "setBasePower" }
>;
type SetBasePowerAllTarget = Extract<
  SetBasePowerEffect["target"],
  { type: "all" }
>;

const reviewedBasePowerSetDefinition = (params: {
  cardId: CardId;
  threshold: number;
  typeName: string;
  basePower: number;
  filter?: SetBasePowerAllTarget["filter"];
  target?: SetBasePowerEffect["target"];
  duration?: SetBasePowerEffect["duration"];
}): EffectDefinition => ({
  cardId: params.cardId,
  implementationStatus: "implemented-dsl",
  effects: [
    {
      id: "perm:set-base-power" as EffectDefinition["effects"][number]["id"],
      category: "permanent",
      trigger: { type: "permanent" },
      effect: {
        type: "setBasePower",
        target:
          params.target ??
          ({
            type: "all",
            zone: "characterArea",
            player: "self",
            filter: params.filter ?? {
              categories: ["character"],
              typesAny: [params.typeName],
            },
          } satisfies SetBasePowerAllTarget),
        value: params.basePower,
        duration:
          params.duration ??
          ({
            type: "whileConditionTrue",
            condition: {
              type: "trashCount",
              player: "self",
              op: "gte",
              value: params.threshold,
            },
          } as const),
      },
    },
  ],
  metadata: {
    sourceTextHash: "source-hash",
    rulesVersion: "r1",
    effectDefinitionsVersion: "fixture",
    tested: true,
    reviewer: "reviewer",
  },
});

const installPermanentDslCandidate = (
  state: ReturnType<typeof createState>,
  source: CardInstance,
  definition: EffectDefinition,
): void => {
  state.cardManifest.cards[source.cardId] = {
    ...must(state.cardManifest.cards[source.cardId], "source card"),
    support: {
      cardId: source.cardId,
      status: "implemented-dsl",
      effectDefinitionId: "def:perm:test",
      tested: true,
      rulesVersion: "r1",
      cardDataVersion: "fixture",
      sourceTextHash: "source-hash",
      behaviorHash: "behavior-hash",
    },
  };
  state.cardManifest.effectDefinitions = {
    "def:perm:test": definition,
  };
};

const addTrashMarkers = (
  state: ReturnType<typeof createState>,
  count: number,
): void => {
  const p1State = must(state.players[p1], "p1");
  p1State.trash = Array.from({ length: count }, (_, index) => ({
    ...withCharacter(p1, toCardId("char-heart"), index + 10),
    zone: { zone: "trash", playerId: p1, slot: "trash", index },
  }));
};

test("trash-count-gated setBasePower applies to all matching self typed Characters only", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const source = withCharacter(p1, toCardId("char-vanilla"), 0);
  const matchingFirst = withCharacter(p1, toCardId("char-straw-hat"), 1);
  const matchingSecond = withCharacter(p1, toCardId("char-straw-hat"), 2);
  const nonMatchingType = withCharacter(p1, toCardId("char-heart"), 3);
  const opponentMatching = withCharacter(p2, toCardId("char-straw-hat"), 0);
  p1State.characters = [source, matchingFirst, matchingSecond, nonMatchingType];
  p2State.characters = [opponentMatching];
  addTrashMarkers(state, 7);
  installPermanentDslCandidate(
    state,
    source,
    reviewedBasePowerSetDefinition({
      cardId: source.cardId,
      threshold: 7,
      typeName: "Straw Hat Crew",
      basePower: 5000,
    }),
  );

  const view = computeView(state);

  assert.equal(view.cards[matchingFirst.instanceId]?.basePower, 5000);
  assert.equal(view.cards[matchingFirst.instanceId]?.currentPower, 5000);
  assert.equal(view.cards[matchingSecond.instanceId]?.basePower, 5000);
  assert.equal(view.cards[nonMatchingType.instanceId]?.basePower, 4000);
  assert.equal(view.cards[opponentMatching.instanceId]?.basePower, 1000);
  assert.equal(state.cardManifest.cards[matchingFirst.cardId]?.power, 1000);
});

test("setBasePower is generic over trash threshold, type, and target value", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const source = withCharacter(p1, toCardId("char-vanilla"), 0);
  const strawHat = withCharacter(p1, toCardId("char-straw-hat"), 1);
  const heart = withCharacter(p1, toCardId("char-heart"), 2);
  p1State.characters = [source, strawHat, heart];
  addTrashMarkers(state, 4);
  installPermanentDslCandidate(
    state,
    source,
    reviewedBasePowerSetDefinition({
      cardId: source.cardId,
      threshold: 4,
      typeName: "Heart Pirates",
      basePower: 7000,
      filter: { typesAny: ["Heart Pirates"] },
    }),
  );

  const view = computeView(state);

  assert.equal(view.cards[heart.instanceId]?.basePower, 7000);
  assert.equal(view.cards[heart.instanceId]?.currentPower, 7000);
  assert.equal(view.cards[strawHat.instanceId]?.basePower, 1000);
});

test("setBasePower modifier disappears when trash condition fails or source leaves field", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const source = withCharacter(p1, toCardId("char-vanilla"), 0);
  const matching = withCharacter(p1, toCardId("char-straw-hat"), 1);
  p1State.characters = [source, matching];
  addTrashMarkers(state, 7);
  installPermanentDslCandidate(
    state,
    source,
    reviewedBasePowerSetDefinition({
      cardId: source.cardId,
      threshold: 7,
      typeName: "Straw Hat Crew",
      basePower: 5000,
    }),
  );
  assert.equal(computeView(state).cards[matching.instanceId]?.basePower, 5000);

  p1State.trash.pop();
  assert.equal(computeView(state).cards[matching.instanceId]?.basePower, 1000);

  addTrashMarkers(state, 7);
  p1State.characters = [matching];
  p1State.trash.push({
    ...source,
    zone: { zone: "trash", playerId: p1, slot: "trash", index: 7 },
  });
  assert.equal(computeView(state).cards[matching.instanceId]?.basePower, 1000);
});

test("setBasePower fails closed for unsupported filter keys and target or duration shapes", () => {
  const cases: Array<{
    label: string;
    mutate: (definition: EffectDefinition) => void;
  }> = [
    {
      label: "unsupported color filter",
      mutate: (definition) => {
        const effect = must(definition.effects[0], "effect").effect;
        if (effect.type === "setBasePower" && effect.target.type === "all") {
          effect.target.filter = {
            typesAny: ["Straw Hat Crew"],
            colorsAny: ["red"],
          };
        }
      },
    },
    {
      label: "opponent target",
      mutate: (definition) => {
        const effect = must(definition.effects[0], "effect").effect;
        if (effect.type === "setBasePower") {
          effect.target = {
            type: "all",
            zone: "characterArea",
            player: "opponent",
            filter: { typesAny: ["Straw Hat Crew"] },
          };
        }
      },
    },
    {
      label: "non-continuous duration",
      mutate: (definition) => {
        const effect = must(definition.effects[0], "effect").effect;
        if (effect.type === "setBasePower") {
          effect.duration = { type: "thisTurn" };
        }
      },
    },
  ];

  for (const { label, mutate } of cases) {
    const state = createState();
    const p1State = must(state.players[p1], `p1 ${label}`);
    const source = withCharacter(p1, toCardId("char-vanilla"), 0);
    p1State.characters = [source];
    const definition = reviewedBasePowerSetDefinition({
      cardId: source.cardId,
      threshold: 7,
      typeName: "Straw Hat Crew",
      basePower: 5000,
    });
    mutate(definition);
    installPermanentDslCandidate(state, source, definition);

    assert.throws(
      () => deriveImplementedDslPermanentContinuousEffects(state),
      /Unsupported continuous effect/i,
    );
  }
});
