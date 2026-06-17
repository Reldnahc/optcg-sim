import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  EffectDefinition,
  EffectId,
  EngineEvent,
  EventVisibility,
  PlayerId,
} from "@optcg/types";

import { appendEvent } from "../../action-results.js";
import { applyAction, getLegalActions } from "../../actions.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
} from "../../action-test-fixtures.js";
import { toEffectId } from "../../action-dispatcher-test-support.js";

const installActivatedLifeRemovedDrawDefinition = (params: {
  state: ReturnType<typeof createActiveState>;
  sourceCardId: CardId;
  effectId: EffectId;
  oncePerTurn?: boolean;
}): EffectDefinition => {
  const definitionId = "def-activated-life-removed-draw";
  const definition: EffectDefinition = {
    cardId: params.sourceCardId,
    implementationStatus: "implemented-dsl",
    effects: [
      {
        id: params.effectId,
        category: "activate",
        trigger: { type: "lifeRemoved", players: ["self", "opponent"] },
        sourcePresencePolicy: "mustRemainInSameZone",
        condition: { type: "yourTurn" },
        ...(params.oncePerTurn === true ? { oncePerTurn: true } : {}),
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "conditional",
                if: { type: "handCount", player: "self", op: "lte", value: 7 },
                then: { type: "draw", player: "self", count: 1 },
              },
            },
          ],
        },
      },
    ],
    metadata: {
      sourceTextHash: `${definitionId}:source`,
      rulesVersion: `${definitionId}:rules`,
      effectDefinitionsVersion: "0.1.0",
      tested: true,
      reviewer: "qa-reviewer",
    },
  };
  params.state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  params.state.cardManifest.effectDefinitions = {
    ...params.state.cardManifest.effectDefinitions,
    [definitionId]: definition,
  };
  params.state.cardManifest.cards[params.sourceCardId] = resolvedCard({
    cardId: params.sourceCardId,
    category: "leader",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: definitionId,
      sourceTextHash: definition.metadata.sourceTextHash,
      rulesVersion: definition.metadata.rulesVersion,
      cardDataVersion: params.state.cardManifest.cardDataVersion,
    },
  });
  return definition;
};

const appendLifeRemovedEvent = (
  state: ReturnType<typeof createActiveState>,
): void => {
  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "cardMoved",
    {
      playerId: p1,
      from: { zone: "life", playerId: p1, slot: "life", index: 0 },
      to: { zone: "hand", playerId: p1, slot: "hand", index: 0 },
    },
    { type: "public" },
  );
  state.eventJournal = [...state.eventJournal, ...events];
};

const installActivatedDrawDefinition = (params: {
  state: ReturnType<typeof createActiveState>;
  sourceCardId: CardId;
  effectId: EffectId;
  trigger: EffectDefinition["effects"][number]["trigger"];
}): EffectDefinition => {
  const definitionId = `def-${String(params.effectId)}`;
  const definition: EffectDefinition = {
    cardId: params.sourceCardId,
    implementationStatus: "implemented-dsl",
    effects: [
      {
        id: params.effectId,
        category: "activate",
        trigger: params.trigger,
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: { type: "draw", player: "self", count: 1 },
            },
          ],
        },
      },
    ],
    metadata: {
      sourceTextHash: `${definitionId}:source`,
      rulesVersion: `${definitionId}:rules`,
      effectDefinitionsVersion: "0.1.0",
      tested: true,
      reviewer: "qa-reviewer",
    },
  };
  params.state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  params.state.cardManifest.effectDefinitions = {
    ...params.state.cardManifest.effectDefinitions,
    [definitionId]: definition,
  };
  params.state.cardManifest.cards[params.sourceCardId] = resolvedCard({
    cardId: params.sourceCardId,
    category: "leader",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: definitionId,
      sourceTextHash: definition.metadata.sourceTextHash,
      rulesVersion: definition.metadata.rulesVersion,
      cardDataVersion: params.state.cardManifest.cardDataVersion,
    },
  });
  return definition;
};

const appendAttackDeclaredEvent = (
  state: ReturnType<typeof createActiveState>,
  visibility: EventVisibility = { type: "public" },
): void => {
  const events: EngineEvent[] = [];
  const p2State = must(state.players[p2], "p2");
  const attacker = p2State.leader;
  appendEvent(
    state,
    events,
    "attackDeclared",
    {
      attacker: {
        playerId: p2,
        instanceId: attacker.instanceId,
        cardId: attacker.cardId,
        zone: attacker.zone,
      },
      target: {
        playerId: p1,
        instanceId: must(state.players[p1], "p1").leader.instanceId,
        cardId: must(state.players[p1], "p1").leader.cardId,
      },
    },
    visibility,
  );
  state.eventJournal = [...state.eventJournal, ...events];
};

const appendCardPlayedEvent = (
  state: ReturnType<typeof createActiveState>,
  cardId: CardId,
  options: {
    readonly playerId?: PlayerId;
    readonly sourceCardId?: CardId;
  } = {},
): void => {
  const playerId = options.playerId ?? p1;
  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "cardPlayed",
    {
      playerId,
      instanceId: "played-1",
      cardId,
      category: "character",
      ...(options.sourceCardId === undefined
        ? {}
        : { sourceCardId: options.sourceCardId }),
    },
    { type: "public" },
  );
  state.eventJournal = [...state.eventJournal, ...events];
};

const installActivatedTrashSelfDrawDefinition = (params: {
  state: ReturnType<typeof createActiveState>;
  sourceCardId: CardId;
  effectId: EffectId;
  trigger: EffectDefinition["effects"][number]["trigger"];
}): EffectDefinition => {
  const definitionId = `def-${String(params.effectId)}`;
  const definition: EffectDefinition = {
    cardId: params.sourceCardId,
    implementationStatus: "implemented-dsl",
    effects: [
      {
        id: params.effectId,
        category: "activate",
        trigger: params.trigger,
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "payCost",
                cost: { type: "trashSelf", optional: true },
              },
            },
            {
              connector: "ifYouDo",
              effect: { type: "draw", player: "self", count: 2 },
            },
          ],
        },
      },
    ],
    metadata: {
      sourceTextHash: `${definitionId}:source`,
      rulesVersion: `${definitionId}:rules`,
      effectDefinitionsVersion: "0.1.0",
      tested: true,
      reviewer: "qa-reviewer",
    },
  };
  params.state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  params.state.cardManifest.effectDefinitions = {
    ...params.state.cardManifest.effectDefinitions,
    [definitionId]: definition,
  };
  params.state.cardManifest.cards[params.sourceCardId] = resolvedCard({
    cardId: params.sourceCardId,
    category: "character",
    cost: 5,
    power: 6000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: definitionId,
      sourceTextHash: definition.metadata.sourceTextHash,
      rulesVersion: definition.metadata.rulesVersion,
      cardDataVersion: params.state.cardManifest.cardDataVersion,
    },
  });
  return definition;
};

const appendCardRestedEvent = (
  state: ReturnType<typeof createActiveState>,
  card: CardInstance,
): void => {
  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "cardRested",
    {
      playerId: card.controller,
      instanceId: card.instanceId,
      cardId: card.cardId,
      category: "character",
      sourceControllerId: p2,
      sourceKind: "effect",
    },
    { type: "public" },
  );
  state.eventJournal = [...state.eventJournal, ...events];
};

const appendFieldRemovedByEffectEvent = (
  state: ReturnType<typeof createActiveState>,
  removed: CardInstance,
  sourceControllerId = p1,
): void => {
  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "cardMoved",
    {
      playerId: removed.controller,
      instanceId: removed.instanceId,
      cardId: removed.cardId,
      from: removed.zone,
      to: { zone: "trash", playerId: removed.owner, slot: "trash", index: 0 },
      reason: "effect",
      sourceControllerId,
      sourceKind: "effect",
    },
    { type: "public" },
  );
  state.eventJournal = [...state.eventJournal, ...events];
};

test("activated life-removed reactions are optional legal actions, not auto-queued triggers", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  state.turn.phase = "main";
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const effectId = toEffectId("activated-life-removed-draw");
  installActivatedLifeRemovedDrawDefinition({
    state,
    sourceCardId: leader.cardId,
    effectId,
    oncePerTurn: true,
  });
  const beforeDeck = p1State.deck.length;
  const beforeHand = p1State.hand.length;
  appendLifeRemovedEvent(state);

  assert.equal(state.effectQueue.length, 0);
  const p1Actions = getLegalActions(state, p1).filter(
    (action) => action.type === "activateEffect",
  );
  const p2Actions = getLegalActions(state, p2).filter(
    (action) => action.type === "activateEffect",
  );

  assert.equal(p1Actions.length, 1);
  assert.deepEqual(p2Actions, []);
  assert.equal(p1Actions[0]?.effectId, effectId);

  const result = applyAction(state, must(p1Actions[0], "activated reaction"));

  assert.equal(result.errors, undefined);
  assert.equal(
    must(result.state.players[p1], "p1 after").deck.length,
    beforeDeck - 1,
  );
  assert.equal(
    must(result.state.players[p1], "p1 after").hand.length,
    beforeHand + 1,
  );
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(result.state.oncePerTurn.length, 1);
  assert.equal(result.state.oncePerTurn[0]?.effectId, effectId);
});

test("activated opponent-attack reactions are optional legal actions", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p2;
  state.turn.phase = "main";
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const effectId = toEffectId("activated-opponent-attack-draw");
  installActivatedDrawDefinition({
    state,
    sourceCardId: leader.cardId,
    effectId,
    trigger: { type: "onOpponentAttack" },
  });
  const beforeHand = p1State.hand.length;
  appendAttackDeclaredEvent(state);

  const p1Actions = getLegalActions(state, p1).filter(
    (action) => action.type === "activateEffect",
  );

  assert.equal(p1Actions.length, 1);
  assert.equal(p1Actions[0]?.effectId, effectId);

  const result = applyAction(state, must(p1Actions[0], "activated reaction"));

  assert.equal(result.errors, undefined);
  assert.equal(
    must(result.state.players[p1], "p1 after").hand.length,
    beforeHand + 1,
  );
});

test("activated opponent-attack reactions ignore non-public attack events", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p2;
  state.turn.phase = "main";
  const leader = must(state.players[p1], "p1").leader;
  const effectId = toEffectId("activated-hidden-opponent-attack-draw");
  installActivatedDrawDefinition({
    state,
    sourceCardId: leader.cardId,
    effectId,
    trigger: { type: "onOpponentAttack" },
  });
  appendAttackDeclaredEvent(state, { type: "replayOnly" });

  const p1Actions = getLegalActions(state, p1).filter(
    (action) => action.type === "activateEffect",
  );

  assert.deepEqual(p1Actions, []);
});

test("activated played-card reactions honor effect-entry-point filters", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  state.turn.phase = "main";
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const playedCardId = "played-trigger-character" as CardId;
  const playedDefinitionId = "def-played-trigger-character";
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [playedDefinitionId]: {
      cardId: playedCardId,
      implementationStatus: "implemented-dsl",
      effects: [
        {
          id: toEffectId("played-trigger"),
          category: "auto",
          trigger: { type: "trigger" },
          sourcePresencePolicy: "noSourceRequired",
          effect: { type: "draw", player: "self", count: 1 },
        },
      ],
      metadata: {
        sourceTextHash: "played:source",
        rulesVersion: "played:rules",
        effectDefinitionsVersion: "0.1.0",
        tested: true,
      },
    },
  };
  state.cardManifest.cards[playedCardId] = resolvedCard({
    cardId: playedCardId,
    category: "character",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: playedDefinitionId,
      sourceTextHash: "played:source",
      rulesVersion: "played:rules",
      cardDataVersion: state.cardManifest.cardDataVersion,
    },
  });
  const effectId = toEffectId("activated-card-played-draw");
  installActivatedDrawDefinition({
    state,
    sourceCardId: leader.cardId,
    effectId,
    trigger: {
      type: "cardPlayed",
      player: "self",
      filter: {
        categories: ["character"],
        effectEntryPoint: { mode: "with", trigger: { type: "trigger" } },
      },
    },
  });
  const beforeHand = p1State.hand.length;
  appendCardPlayedEvent(state, playedCardId);

  const p1Actions = getLegalActions(state, p1).filter(
    (action) => action.type === "activateEffect",
  );

  assert.equal(p1Actions.length, 1);
  assert.equal(p1Actions[0]?.effectId, effectId);

  const result = applyAction(state, must(p1Actions[0], "activated reaction"));

  assert.equal(result.errors, undefined);
  assert.equal(
    must(result.state.players[p1], "p1 after").hand.length,
    beforeHand + 1,
  );
});

test("activated card-rested reactions support optional self-trash costs before body effects", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p2;
  state.turn.phase = "main";
  const p1State = must(state.players[p1], "p1");
  const sourceCard = must(p1State.hand[0], "source card");
  const drawCards: CardInstance[] = [
    must(p1State.hand[1], "first draw card"),
    must(p1State.hand[2], "second draw card"),
  ].map(
    (card, index): CardInstance => ({
      ...card,
      zone: { zone: "deck", playerId: p1, slot: "deck", index },
    }),
  );
  const source: CardInstance = {
    ...sourceCard,
    zone: {
      zone: "characterArea",
      playerId: p1,
      slot: "character",
      index: 0,
    },
    state: "rested",
    attachedDon: [],
  };
  p1State.hand = p1State.hand.slice(3);
  p1State.characters = [source];
  p1State.deck = drawCards;
  const effectId = toEffectId("activated-card-rested-trash-self-draw");
  installActivatedTrashSelfDrawDefinition({
    state,
    sourceCardId: source.cardId,
    effectId,
    trigger: {
      type: "cardRested",
      target: "self",
      player: "self",
      sourceController: "opponent",
      sourceKind: "effect",
    },
  });
  const beforeDeck = p1State.deck.length;
  const beforeHand = p1State.hand.length;
  appendCardRestedEvent(state, source);

  const p1Actions = getLegalActions(state, p1).filter(
    (action) => action.type === "activateEffect",
  );

  assert.equal(p1Actions.length, 1);
  assert.equal(p1Actions[0]?.effectId, effectId);

  const prompted = applyAction(state, must(p1Actions[0], "activated reaction"));
  const decision = must(prompted.state.pendingDecision, "trash-self cost");

  assert.equal(prompted.errors, undefined);
  assert.equal(decision.type, "payCost");
  assert.equal(decision.cost.type, "trashSelf");

  const paid = applyAction(prompted.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "trashSelf",
    },
  });
  const afterP1 = must(paid.state.players[p1], "p1 after");

  assert.equal(paid.errors, undefined);
  assert.equal(afterP1.deck.length, beforeDeck - 2);
  assert.equal(afterP1.hand.length, beforeHand + 2);
  assert.equal(
    afterP1.characters.some((card) => card.instanceId === source.instanceId),
    false,
  );
  assert.equal(afterP1.trash.at(0)?.instanceId, source.instanceId);
});

test("activated played-card reactions support any-of source filters and reusable moveCards bodies", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p2;
  state.turn.phase = "main";
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const leader = p1State.leader;
  const playedCardId = "opponent-large-character" as CardId;
  const sourceCardId = "opponent-effect-character" as CardId;
  state.cardManifest.cards[playedCardId] = resolvedCard({
    cardId: playedCardId,
    category: "character",
    cost: 4,
    power: 5000,
  });
  state.cardManifest.cards[sourceCardId] = resolvedCard({
    cardId: sourceCardId,
    category: "character",
    cost: 4,
    power: 5000,
  });

  const definitionId = "def-activated-card-played-life-move";
  const effectId = toEffectId("activated-card-played-life-move");
  const definition: EffectDefinition = {
    cardId: leader.cardId,
    implementationStatus: "implemented-dsl",
    effects: [
      {
        id: effectId,
        category: "activate",
        trigger: {
          type: "cardPlayed",
          player: "opponent",
          anyOf: [
            {
              filter: {
                categories: ["character"],
                baseCost: { min: 8 },
              },
            },
            {
              filter: { categories: ["character"] },
              sourceFilter: { categories: ["character"] },
            },
          ],
        },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "moveCards",
                count: 1,
                from: { player: "opponent", zone: "life", position: "top" },
                to: { player: "opponent", zone: "hand" },
                order: "original",
              },
            },
          ],
        },
      },
    ],
    metadata: {
      sourceTextHash: `${definitionId}:source`,
      rulesVersion: `${definitionId}:rules`,
      effectDefinitionsVersion: "0.1.0",
      tested: true,
      reviewer: "qa-reviewer",
    },
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [definitionId]: definition,
  };
  state.cardManifest.cards[leader.cardId] = resolvedCard({
    cardId: leader.cardId,
    category: "leader",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: definitionId,
      sourceTextHash: definition.metadata.sourceTextHash,
      rulesVersion: definition.metadata.rulesVersion,
      cardDataVersion: state.cardManifest.cardDataVersion,
    },
  });
  const beforeOpponentLife = p2State.life.length;
  const beforeOpponentHand = p2State.hand.length;
  appendCardPlayedEvent(state, playedCardId, { playerId: p2, sourceCardId });

  const p1Actions = getLegalActions(state, p1).filter(
    (action) => action.type === "activateEffect",
  );

  assert.equal(p1Actions.length, 1);
  assert.equal(p1Actions[0]?.effectId, effectId);

  const result = applyAction(state, must(p1Actions[0], "activated reaction"));

  assert.equal(result.errors, undefined);
  assert.equal(
    must(result.state.players[p2], "p2 after").life.length,
    beforeOpponentLife - 1,
  );
  assert.equal(
    must(result.state.players[p2], "p2 after").hand.length,
    beforeOpponentHand + 1,
  );
});

test("activated field-removal reactions support any removed Character caused by your effect", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  state.turn.phase = "main";
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const leader = p1State.leader;
  const removed: CardInstance = {
    instanceId: "p2-removed-character" as CardInstance["instanceId"],
    cardId: "removed-character-card" as CardId,
    owner: p2,
    controller: p2,
    zone: {
      zone: "characterArea",
      playerId: p2,
      slot: "character",
      index: 0,
    },
    state: "active",
    attachedDon: [],
  };
  p2State.characters = [removed];
  state.cardManifest.cards[removed.cardId] = resolvedCard({
    cardId: removed.cardId,
    category: "character",
    power: 5000,
  });
  const effectId = toEffectId("activated-field-removed-by-effect-draw");
  installActivatedDrawDefinition({
    state,
    sourceCardId: leader.cardId,
    effectId,
    trigger: {
      type: "anyOf",
      triggers: [
        {
          type: "fieldRemoved",
          player: "self",
          filter: { categories: ["character"] },
          sourceController: "self",
          sourceKind: "effect",
        },
        {
          type: "fieldRemoved",
          player: "opponent",
          filter: { categories: ["character"] },
          sourceController: "self",
          sourceKind: "effect",
        },
      ],
    },
  });
  const beforeHand = p1State.hand.length;
  appendFieldRemovedByEffectEvent(state, removed);

  const p1Actions = getLegalActions(state, p1).filter(
    (action) => action.type === "activateEffect",
  );

  assert.equal(p1Actions.length, 1);
  assert.equal(p1Actions[0]?.effectId, effectId);

  const result = applyAction(state, must(p1Actions[0], "activated reaction"));

  assert.equal(result.errors, undefined);
  assert.equal(
    must(result.state.players[p1], "p1 after").hand.length,
    beforeHand + 1,
  );
});
