import assert from "node:assert/strict";

import type {
  CardId,
  CardInstance,
  ContinuousEffectRecord,
  EffectDefinition,
  EffectId,
  EngineResult,
  GameState,
  Keyword,
  PlayerId,
} from "@optcg/types";

import { applyAction } from "./actions.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "./action-test-fixtures.js";
import { applyDeclareAttack } from "./battle-actions.js";

export const cardRef = (card: CardInstance, playerId: PlayerId) => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

export const effectDefinition = (
  cardId: CardId,
  trigger: EffectDefinition["effects"][number]["trigger"],
  effect: EffectDefinition["effects"][number]["effect"] = {
    type: "draw",
    count: 1,
    player: "self",
  },
): EffectDefinition => ({
  cardId,
  implementationStatus: "implemented-dsl",
  effects: [
    {
      id: `${String(cardId)}:effect:1` as EffectDefinition["effects"][number]["id"],
      category: "auto",
      trigger,
      optional: false,
      oncePerTurn: false,
      sourcePresencePolicy: "mustRemainInSameZone",
      effect,
    },
  ],
  metadata: {
    sourceTextHash: "source-hash",
    rulesVersion: "r1",
    effectDefinitionsVersion: "fixture",
    tested: true,
    reviewer: "qa-reviewer",
  },
});

export const withWhenAttackingDrawEffect = (
  state: ReturnType<typeof setupAttackState>,
  source: CardInstance,
  effectDefinitionId = "def-when-attacking-draw",
): EffectDefinition => {
  const definition = effectDefinition(source.cardId, { type: "whenAttacking" });
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [effectDefinitionId]: definition,
  };
  const category = source.zone.zone === "leaderArea" ? "leader" : "character";
  state.cardManifest.cards[source.cardId] = resolvedCard({
    cardId: source.cardId,
    category,
    power: category === "leader" ? 5000 : 7000,
    effectText: "[When Attacking] Draw 1 card.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: definition.metadata.rulesVersion,
      sourceTextHash: definition.metadata.sourceTextHash,
    },
  });
  return definition;
};

export const withOnOpponentAttackDrawEffect = (
  state: ReturnType<typeof setupAttackState>,
  source: CardInstance,
  effectDefinitionId = "def-on-opponent-attack-draw",
): EffectDefinition => {
  const definition = effectDefinition(source.cardId, {
    type: "onOpponentAttack",
  });
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [effectDefinitionId]: definition,
  };
  const category = source.zone.zone === "leaderArea" ? "leader" : "character";
  state.cardManifest.cards[source.cardId] = resolvedCard({
    cardId: source.cardId,
    category,
    power: category === "leader" ? 5000 : 3000,
    effectText: "[On Your Opponent's Attack] Draw 1 card.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: definition.metadata.rulesVersion,
      sourceTextHash: definition.metadata.sourceTextHash,
    },
  });
  return definition;
};

export const withOnKODrawEffect = (
  state: ReturnType<typeof setupAttackState>,
  source: CardInstance,
  effectDefinitionId = "def-on-ko-draw",
  sourcePresencePolicy:
    | "resolveFromDestinationZone"
    | "resolveFromLastKnownInformation" = "resolveFromDestinationZone",
): EffectDefinition => {
  const definition = effectDefinition(source.cardId, { type: "onKO" });
  const onKOEffect = must(definition.effects[0], "On K.O. effect");
  const onKODefinition: EffectDefinition = {
    ...definition,
    effects: [{ ...onKOEffect, sourcePresencePolicy }],
  };
  state.cardManifest.effectDefinitionsVersion =
    onKODefinition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [effectDefinitionId]: onKODefinition,
  };
  state.cardManifest.cards[source.cardId] = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 3000,
    effectText: "[On K.O.] Draw 1 card.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: onKODefinition.metadata.rulesVersion,
      sourceTextHash: onKODefinition.metadata.sourceTextHash,
    },
  });
  return onKODefinition;
};

export const withMultipleWhenAttackingDrawEffects = (
  state: ReturnType<typeof setupAttackState>,
  source: CardInstance,
): EffectDefinition => {
  const definition = withWhenAttackingDrawEffect(
    state,
    source,
    "def-multiple-when-attacking-draw",
  );
  const first = must(definition.effects[0], "first When Attacking effect");
  const multiple: EffectDefinition = {
    ...definition,
    effects: [
      first,
      {
        ...first,
        id: `${String(source.cardId)}:effect:2` as EffectId,
      },
    ],
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-multiple-when-attacking-draw": multiple,
  };
  return multiple;
};

export const withAttackManifest = (
  state: ReturnType<typeof createActiveState>,
) => {
  state.cardManifest.cards[toCardId("leader-red")] = resolvedCard({
    cardId: toCardId("leader-red"),
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[toCardId("leader-blue")] = resolvedCard({
    cardId: toCardId("leader-blue"),
    category: "leader",
    power: 5000,
  });
  for (const cardId of [
    "p1-a",
    "p1-b",
    "p1-c",
    "p1-d",
    "p1-e",
    "p1-f",
    "p1-g",
    "p1-h",
    "p2-a",
    "p2-b",
    "p2-c",
    "p2-d",
    "p2-e",
    "p2-f",
    "p2-g",
    "p2-h",
  ]) {
    state.cardManifest.cards[toCardId(cardId)] = resolvedCard({
      cardId: toCardId(cardId),
      category: "character",
      power: 3000,
    });
  }
};

export const setupAttackState = () => {
  const state = createActiveState();
  withAttackManifest(state);
  state.turn.phase = "main";
  state.turn.globalTurn = 3;
  state.turn.turnPlayerId = p1;
  state.turn.playerTurnCounts[p1] = 2;
  state.turn.playerTurnCounts[p2] = 1;
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  p1State.leader.state = "active";
  p2State.leader.state = "active";
  p1State.characters = [
    {
      ...must(p1State.hand[0], "p1 hand"),
      zone: {
        zone: "characterArea",
        playerId: p1,
        slot: "character",
        index: 0,
      },
      state: "active",
      attachedDon: [],
      turnPlayed: 1,
    },
  ];
  p1State.hand = p1State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  p2State.characters = [
    {
      ...must(p2State.hand[0], "p2 hand"),
      zone: {
        zone: "characterArea",
        playerId: p2,
        slot: "character",
        index: 0,
      },
      state: "rested",
      attachedDon: [],
      turnPlayed: 1,
    },
  ];
  p2State.hand = p2State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  return state;
};

export const continuousEffectRecord = (
  state: ReturnType<typeof setupAttackState>,
  id: string,
  duration: ContinuousEffectRecord["duration"],
): ContinuousEffectRecord => {
  const source = must(state.players[p1], "p1").leader;
  return {
    id,
    source: cardRef(source, p1),
    sourceSnapshot: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      ownerId: p1,
      controllerId: p1,
      zone: source.zone,
      category: "leader",
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
    duration,
    createdBy: { type: "ruleProcess", name: "test" },
    createdAtStateSeq: state.seq,
  };
};

export const continuousKeywordEffectRecord = (
  state: ReturnType<typeof setupAttackState>,
  id: string,
  source: CardInstance,
  keyword: Keyword,
  options?: {
    controller?: PlayerId;
    condition?: ContinuousEffectRecord["condition"];
    duration?: ContinuousEffectRecord["duration"];
  },
): ContinuousEffectRecord => {
  const category = source.zone.zone === "leaderArea" ? "leader" : "character";
  const record: ContinuousEffectRecord = {
    id,
    source: cardRef(source, source.controller),
    sourceSnapshot: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      ownerId: source.owner,
      controllerId: source.controller,
      zone: source.zone,
      category,
      colors: ["red"],
      power: category === "leader" ? 5000 : 3000,
      keywords: [],
    },
    controller: options?.controller ?? source.controller,
    modifier: {
      layer: "keywordAdd",
      target: { type: "self" },
      operation: { type: "addKeyword", keyword },
    },
    duration: options?.duration ?? { type: "whileSourceOnField" },
    createdBy: { type: "ruleProcess", name: "test-keyword-grant" },
    createdAtStateSeq: state.seq,
  };
  if (options?.condition !== undefined) {
    record.condition = options.condition;
  }
  return record;
};

export const addTrashMarker = (
  state: ReturnType<typeof setupAttackState>,
  playerId: PlayerId,
  cardId: CardId = toCardId(`${String(playerId)}-trash-marker`),
): void => {
  const player = must(state.players[playerId], "trash marker player");
  state.cardManifest.cards[cardId] = resolvedCard({
    cardId,
    category: "character",
    power: 1000,
  });
  player.trash = [
    {
      instanceId:
        `${String(playerId)}:trash:keyword-marker` as CardInstance["instanceId"],
      cardId,
      owner: playerId,
      controller: playerId,
      zone: { zone: "trash", playerId, slot: "trash", index: 0 },
      state: "active",
      attachedDon: [],
    },
  ];
};

export const setupOpenedBlockStepDecision = () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const defenderBlocker = must(p2State.characters[0], "defender blocker");
  defenderBlocker.state = "active";
  state.cardManifest.cards[defenderBlocker.cardId] = {
    ...resolvedCard({
      cardId: defenderBlocker.cardId,
      category: "character",
      power: 3000,
    }),
    printedKeywords: ["blocker"],
  };
  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);
  return {
    opened,
    openedState: opened.state,
    p1State,
    p2State,
    defenderBlocker,
    decision: must(opened.state.pendingDecision, "pending decision"),
  };
};

export const setupOpenedCharacterTargetBlockStepDecision = () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const originalTarget = must(p2State.characters[0], "original target");
  const blockerSource = must(p2State.hand[0], "blocker source");
  const defenderBlocker = {
    ...blockerSource,
    zone: {
      zone: "characterArea" as const,
      playerId: p2,
      slot: "character" as const,
      index: 1,
    },
    state: "active" as const,
    attachedDon: [],
    turnPlayed: 1,
  };
  p2State.characters.push(defenderBlocker);
  p2State.hand = p2State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
  });
  state.cardManifest.cards[originalTarget.cardId] = resolvedCard({
    cardId: originalTarget.cardId,
    category: "character",
    power: 3000,
  });
  state.cardManifest.cards[defenderBlocker.cardId] = {
    ...resolvedCard({
      cardId: defenderBlocker.cardId,
      category: "character",
      power: 3000,
    }),
    printedKeywords: ["blocker"],
  };
  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(attacker, p1),
    target: cardRef(originalTarget, p2),
  });
  assert.equal(opened.errors, undefined);
  return {
    opened,
    openedState: opened.state,
    p1State,
    p2State,
    attacker,
    originalTarget,
    defenderBlocker,
    decision: must(opened.state.pendingDecision, "pending decision"),
  };
};

export const setupOpenedCounterStepPassDecision = () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const counterCard = must(p2State.hand[0], "counter card");
  state.cardManifest.cards[counterCard.cardId] = resolvedCard({
    cardId: counterCard.cardId,
    category: "character",
    power: 3000,
    counter: 1000,
  });

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);
  return {
    opened,
    openedState: opened.state,
    p1State,
    p2State,
    counterCard,
    decision: must(opened.state.pendingDecision, "pending decision"),
  };
};

export const assertCounterStepPassDecision = (
  state: GameState,
  playerId: PlayerId = p2,
): NonNullable<GameState["pendingDecision"]> => {
  const decision = must(state.pendingDecision, "counter pass decision");
  assert.equal(state.battle?.step, "counter");
  assert.equal(decision.type, "selectCards");
  assert.equal(decision.playerId, playerId);
  assert.equal(decision.prompt, "Use counter or end step.");
  assert.equal(decision.request.min, 0);
  assert.equal(decision.request.max, 0);
  assert.deepEqual(decision.candidates, []);
  assert.deepEqual(decision.defaultResponse, { type: "cards", cards: [] });
  return decision;
};

export const passCounterStep = (
  state: GameState,
  playerId: PlayerId = p2,
): EngineResult => {
  const decision = assertCounterStepPassDecision(state, playerId);
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [] },
  });
};

export const installSupportedCounterEvent = (
  state: ReturnType<typeof setupAttackState>,
  card: CardInstance,
  value: number,
) => {
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "event",
    effectText: `[Counter] Your Leader or 1 of your Characters gets +${String(value)} power during this battle.`,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: `${String(card.cardId)}:counter`,
    },
  });
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [`${String(card.cardId)}:counter`]: {
      cardId: card.cardId,
      implementationStatus: "implemented-dsl",
      effects: [
        {
          id: `${String(card.cardId)}:counter:1` as EffectId,
          category: "auto",
          trigger: { type: "counter" },
          sourcePresencePolicy: "resolveFromDestinationZone",
          effect: {
            type: "modifyPower",
            target: { type: "attackTarget" },
            value,
            duration: { type: "thisBattle" },
          },
        },
      ],
      metadata: {
        sourceTextHash: "source-hash",
        rulesVersion: "r1",
        effectDefinitionsVersion: "fixture",
        tested: true,
        reviewer: "qa-reviewer",
      },
    },
  };
};

export const ensureActiveDonInCostArea = (
  state: ReturnType<typeof setupAttackState>,
  playerId: PlayerId,
  count = 1,
) => {
  const player = must(state.players[playerId], "player");
  while (
    player.costArea.filter((card) => card.state === "active").length < count
  ) {
    const don = player.donDeck.shift();
    if (don === undefined) {
      break;
    }
    player.costArea.push({
      ...don,
      zone: {
        zone: "costArea",
        playerId,
        slot: "cost",
        index: player.costArea.length,
      },
      state: "active",
    });
  }
  player.costArea = player.costArea.map((card, index) => ({
    ...card,
    zone: {
      zone: "costArea",
      playerId,
      slot: "cost",
      index,
    },
  }));
  player.donDeck = player.donDeck.map((card, index) => ({
    ...card,
    zone: {
      zone: "donDeck",
      playerId,
      slot: "donDeck",
      index,
    },
  }));
};

export const assertRejectsWithoutMutation = (
  state: ReturnType<typeof setupAttackState>,
  response: Parameters<typeof applyAction>[1],
) => {
  const before = JSON.stringify(state);
  const result = applyAction(state, response);
  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
};
