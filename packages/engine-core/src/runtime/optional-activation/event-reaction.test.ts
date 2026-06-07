import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  EffectDefinition,
  EffectId,
  EngineEvent,
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
    { type: "public" },
  );
  state.eventJournal = [...state.eventJournal, ...events];
};

const appendCardPlayedEvent = (
  state: ReturnType<typeof createActiveState>,
  cardId: CardId,
): void => {
  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "cardPlayed",
    { playerId: p1, instanceId: "played-1", cardId, category: "character" },
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
