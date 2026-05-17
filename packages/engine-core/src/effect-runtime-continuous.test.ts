import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  ContinuousEffectRecord,
  MatchCardManifest,
  MatchId,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

import { computeView } from "./compute-view.js";
import { createInitialState } from "./initial-state.js";

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
  printedKeywords?: ResolvedCard["printedKeywords"];
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
    types: [],
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
    [toCardId("char-rush")]: resolvedCard({
      cardId: toCardId("char-rush"),
      category: "character",
      power: 3000,
      printedKeywords: ["rush"],
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
  },
});

const createState = () =>
  createInitialState({
    matchId: toMatchId("match-effect-runtime-continuous"),
    firstPlayerId: p1,
    rngSeed: "seed-effect-runtime-continuous",
    playerOrder: [p1, p2],
    leaderCardIds: {
      [p1]: toCardId("leader-red"),
      [p2]: toCardId("leader-blue"),
    },
    leaderLifeCounts: { [p1]: 0, [p2]: 0 },
    deckCardIds: {
      [p1]: [
        "char-vanilla",
        "char-rush",
        "char-vanilla",
        "char-rush",
        "char-vanilla",
      ].map(toCardId),
      [p2]: [
        "char-vanilla",
        "char-rush",
        "char-vanilla",
        "char-rush",
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

const withCharacter = (
  playerId: PlayerId,
  cardId: CardId,
  index: number,
  options?: { state?: CardInstance["state"] },
): CardInstance => ({
  instanceId:
    `${playerId}:char:${String(index)}:${cardId}` as CardInstance["instanceId"],
  cardId,
  owner: playerId,
  controller: playerId,
  zone: { zone: "characterArea", playerId, slot: "character", index },
  state: options?.state ?? "active",
  attachedDon: [],
});

const battleRef = (card: CardInstance) => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId: card.controller,
});

const setMainTurnAfterFirstTurn = (
  state: ReturnType<typeof createState>,
  turnPlayerId: PlayerId = p1,
): void => {
  state.turn.phase = "main";
  state.turn.turnPlayerId = turnPlayerId;
  state.turn.globalTurn = 3;
  state.turn.playerTurnCounts[p1] = 2;
  state.turn.playerTurnCounts[p2] = 1;
};

const continuousPowerEffectRecord = (
  state: ReturnType<typeof createState>,
  options?: { source?: CardInstance },
): ContinuousEffectRecord => {
  const source = options?.source ?? must(state.players[p1], "p1 state").leader;
  return {
    id: "continuous-runtime-test",
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
      category: source.zone.zone === "leaderArea" ? "leader" : "character",
      colors: ["red"],
      power: 5000,
      keywords: [],
    },
    controller: p1,
    modifier: {
      layer: "powerAdd",
      target: { type: "self" },
      operation: { type: "addPower", value: 1000 },
    },
    duration: { type: "permanent" },
    createdBy: { type: "ruleProcess", name: "effect-runtime-continuous-test" },
    createdAtStateSeq: state.seq,
  };
};

test("cannotAttack restriction on self prevents attacker legal targets", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  setMainTurnAfterFirstTurn(state);
  p1State.characters = [withCharacter(p1, toCardId("char-rush"), 0)];
  p2State.characters = [
    withCharacter(p2, toCardId("char-vanilla"), 0, { state: "rested" }),
  ];
  const attacker = must(p1State.characters[0], "attacker");
  state.continuousEffects = [
    {
      ...continuousPowerEffectRecord(state, { source: attacker }),
      id: "restrict-attack-self",
      modifier: {
        layer: "restriction",
        target: { type: "self" },
        operation: { type: "restriction", restriction: "cannotAttack" },
      },
      duration: { type: "thisTurn" },
    },
  ];
  const view = computeView(state);
  assert.deepEqual(view.legalAttackTargets[attacker.instanceId], []);
});

test("cannotBlock all-opponent-character restriction disables blocker", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  setMainTurnAfterFirstTurn(state);
  p2State.characters = [withCharacter(p2, toCardId("char-blocker"), 0)];
  state.battle = {
    attacker: battleRef(p1State.leader),
    originalTarget: battleRef(p2State.leader),
    currentTarget: battleRef(p2State.leader),
    step: "block",
    damageCount: 1,
  };
  state.continuousEffects = [
    {
      ...continuousPowerEffectRecord(state),
      id: "restrict-block-all",
      modifier: {
        layer: "restriction",
        target: { type: "all", zone: "characterArea", player: "opponent" },
        operation: { type: "restriction", restriction: "cannotBlock" },
      },
      duration: { type: "thisTurn" },
    },
  ];
  const blocker = must(p2State.characters[0], "blocker");
  const view = computeView(state);
  assert.equal(view.cards[blocker.instanceId]?.canBlock, false);
});

test("modifyPower exactCard uses effect value without mutating canonical power", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  setMainTurnAfterFirstTurn(state);
  p1State.characters = [withCharacter(p1, toCardId("char-vanilla"), 0)];
  const source = must(p1State.characters[0], "source");
  const manifestBefore = structuredClone(
    must(state.cardManifest.cards[source.cardId], "source manifest"),
  );
  state.continuousEffects = [
    {
      ...continuousPowerEffectRecord(state, { source }),
      id: "power-2000-exact",
      modifier: {
        layer: "powerAdd",
        target: {
          type: "exactCard",
          card: {
            instanceId: source.instanceId,
            cardId: source.cardId,
            playerId: p1,
            zone: source.zone,
          },
          binding: {
            family: "selectedTargets",
            saveResultAs: "s",
            objectIndex: 0,
          },
          createdAtStateSeq: state.seq,
        },
        operation: { type: "addPower", value: 2000 },
      },
      duration: { type: "thisTurn" },
    },
  ];
  const view = computeView(state);
  assert.equal(view.cards[source.instanceId]?.currentPower, 5000);
  assert.equal(
    state.cardManifest.cards[source.cardId]?.power,
    manifestBefore.power,
  );
});

test("filtered all modifier applies only to matching cards", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const c0 = withCharacter(p1, toCardId("char-vanilla"), 0);
  const c1 = withCharacter(p1, toCardId("char-rush"), 1);
  p1State.characters = [c0, c1];
  state.cardManifest.cards[toCardId("char-rush")] = {
    ...must(state.cardManifest.cards[toCardId("char-rush")], "rush"),
    power: 4000,
  };
  state.continuousEffects = [
    {
      ...continuousPowerEffectRecord(state),
      id: "filtered-all-power",
      modifier: {
        layer: "powerAdd",
        target: {
          type: "all",
          zone: "characterArea",
          player: "self",
          filter: { power: { op: "eq", value: 4000 } },
        },
        operation: { type: "addPower", value: 1000 },
      },
      duration: { type: "thisTurn" },
    },
  ];
  const view = computeView(state);
  assert.equal(view.cards[c0.instanceId]?.currentPower, 3000);
  assert.equal(view.cards[c1.instanceId]?.currentPower, 5000);
});

test("exact-card modifier stops applying when target leaves bound zone", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const c0 = withCharacter(p1, toCardId("char-vanilla"), 0);
  p1State.characters = [c0];
  state.continuousEffects = [
    {
      ...continuousPowerEffectRecord(state, { source: c0 }),
      id: "exact-zone-bound",
      modifier: {
        layer: "powerAdd",
        target: {
          type: "exactCard",
          card: {
            instanceId: c0.instanceId,
            cardId: c0.cardId,
            playerId: p1,
            zone: c0.zone,
          },
          binding: {
            family: "selectedTargets",
            saveResultAs: "s",
            objectIndex: 0,
          },
          createdAtStateSeq: state.seq,
        },
        operation: { type: "addPower", value: 1000 },
      },
      duration: { type: "thisTurn" },
    },
  ];
  assert.equal(computeView(state).cards[c0.instanceId]?.currentPower, 4000);
  p1State.characters = [];
  p1State.costArea.push({
    ...c0,
    zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
  });
  const view = computeView(state);
  assert.equal(view.cards[c0.instanceId], undefined);
});

test("exact-card modifier fails closed when stored zone provenance mismatches", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const c0 = withCharacter(p1, toCardId("char-vanilla"), 0);
  p1State.characters = [c0];
  state.continuousEffects = [
    {
      ...continuousPowerEffectRecord(state, { source: c0 }),
      id: "exact-zone-mismatch",
      modifier: {
        layer: "powerAdd",
        target: {
          type: "exactCard",
          card: {
            instanceId: c0.instanceId,
            cardId: c0.cardId,
            playerId: p1,
            zone: {
              zone: "leaderArea",
              playerId: p1,
              slot: "leader",
              index: 0,
            },
          },
          binding: {
            family: "selectedTargets",
            saveResultAs: "s",
            objectIndex: 0,
          },
          createdAtStateSeq: state.seq,
        },
        operation: { type: "addPower", value: 1000 },
      },
      duration: { type: "thisTurn" },
    },
  ];
  const view = computeView(state);
  assert.equal(view.cards[c0.instanceId]?.currentPower, 3000);
});
