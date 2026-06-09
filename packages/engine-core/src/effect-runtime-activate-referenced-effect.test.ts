import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  EffectBlock,
  EffectDefinition,
  Effect,
  InstanceId,
} from "@optcg/types";

import { applyAction } from "./actions.js";
import {
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "./action-test-fixtures.js";
import {
  effectDefinition,
  passCounterStep,
  setupAttackState,
} from "./battle/test-fixtures.js";

const supportedLifeTriggerDefinition = (
  cardId: ReturnType<typeof toCardId>,
  effectBody: Effect,
  sourcePresencePolicy: "resolveFromLastKnownInformation" | "noSourceRequired",
): EffectDefinition => {
  const definition = effectDefinition(cardId, { type: "trigger" }, effectBody);
  const effect = must(definition.effects[0], "trigger effect");
  const effectWithoutFlags = { ...effect };
  delete effectWithoutFlags.optional;
  delete effectWithoutFlags.oncePerTurn;
  return {
    ...definition,
    effects: [
      {
        ...effectWithoutFlags,
        sourcePresencePolicy,
      },
    ],
  };
};

const openLifeTriggerDecision = (options: {
  cardIdSuffix: string;
  triggerText: string;
  definition: EffectDefinition;
}): {
  state: ReturnType<typeof setupAttackState>;
  lifeInstanceId: InstanceId;
} => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const lifeCardId = toCardId(options.cardIdSuffix);
  p2State.life[0] = {
    ...topLife,
    card: { ...topLife.card, cardId: lifeCardId },
  };
  state.cardManifest.cards[lifeCardId] = resolvedCard({
    cardId: lifeCardId,
    category: "event",
    cost: 1,
    triggerText: options.triggerText,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: `def-${options.cardIdSuffix}`,
      rulesVersion: options.definition.metadata.rulesVersion,
      sourceTextHash: options.definition.metadata.sourceTextHash,
    },
  });
  state.cardManifest.effectDefinitionsVersion =
    options.definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    [`def-${options.cardIdSuffix}`]: options.definition,
  };

  const result = applyAction(state, {
    type: "declareAttack",
    attacker: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      playerId: p1,
    },
    target: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
  });

  assert.equal(result.errors, undefined);
  const passed = passCounterStep(result.state, p2);
  assert.equal(passed.errors, undefined);
  assert.equal(passed.state.pendingDecision?.type, "confirmLifeTrigger");
  return {
    state: passed.state,
    lifeInstanceId: topLife.card.instanceId,
  };
};

test("activated life trigger can activate this card's supported Main search effect", () => {
  const lifeCardId = toCardId("trigger-activate-main-search");
  const triggerDefinition = supportedLifeTriggerDefinition(
    lifeCardId,
    {
      type: "activateReferencedEffect",
      source: { type: "triggerCard" },
      trigger: { type: "main" },
    },
    "noSourceRequired",
  );
  const triggerEffect = must(
    triggerDefinition.effects[0],
    "activate referenced main trigger effect",
  );
  const definition: EffectDefinition = {
    ...triggerDefinition,
    effects: [
      triggerEffect,
      {
        ...triggerEffect,
        id: `${String(lifeCardId)}:main-search` as EffectBlock["id"],
        trigger: { type: "main" },
        sourcePresencePolicy: "resolveFromDestinationZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "revealTop",
                player: "self",
                zone: "deck",
                count: 3,
                saveAs: "set:trigger-main-search" as never,
                visibility: "chooserOnly",
              },
            },
            {
              connector: "then",
              effect: {
                type: "selectFromSet",
                set: "set:trigger-main-search" as never,
                chooser: "self",
                filter: { typesAny: ["Celestial Dragons"] },
                min: 0,
                max: 1,
                saveAs: "selected:trigger-main-search" as never,
              },
            },
            {
              connector: "ifPreviousSucceeded",
              effect: {
                type: "revealSelected",
                selection: "selected:trigger-main-search" as never,
                visibility: "bothPlayers",
              },
            },
            {
              connector: "ifPreviousSucceeded",
              effect: {
                type: "moveSelected",
                selection: "selected:trigger-main-search" as never,
                from: "set:trigger-main-search" as never,
                to: "hand",
              },
            },
            {
              connector: "then",
              effect: {
                type: "placeSetRemainder",
                set: "set:trigger-main-search" as never,
                owner: "self",
                destination: "trash",
                position: "bottom",
                order: "original",
              },
            },
          ],
        },
      },
    ],
  };
  const { state, lifeInstanceId } = openLifeTriggerDecision({
    cardIdSuffix: "trigger-activate-main-search",
    triggerText: "[Trigger] Activate this card's [Main] effect.",
    definition,
  });
  const decision = must(state.pendingDecision, "life trigger decision");
  const p2State = must(state.players[p2], "p2 before trigger");
  const candidate = must(p2State.deck[0], "search candidate");
  state.cardManifest.cards[candidate.cardId] = {
    ...resolvedCard({
      cardId: candidate.cardId,
      category: "character",
      cost: 1,
      power: 1000,
    }),
    types: ["Celestial Dragons"],
  };

  const result = applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "lifeTrigger", choice: "activateTrigger" },
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision?.type, "selectCards");
  assert.equal(result.state.pendingDecision.playerId, p2);
  assert.equal(result.state.revealedCards.length, 1);
  assert.equal(
    result.state.players[p2]?.trash.some(
      (card) => card.instanceId === lifeInstanceId,
    ),
    true,
  );
  assert.equal(
    result.events.some(
      (event) =>
        event.type === "effectQueued" &&
        JSON.stringify(event.payload).includes(
          `${String(lifeCardId)}:main-search`,
        ),
    ),
    true,
  );
});
