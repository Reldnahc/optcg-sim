import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectBlock, EffectDefinition } from "@optcg/types";

import { applyAction } from "./actions.js";
import {
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "./action-test-fixtures.js";
import { applyDeclareAttack } from "./battle/actions.js";
import {
  passCounterStep,
  setupAttackState,
  ensureActiveDonInCostArea,
} from "./battle/test-fixtures.js";

const cardAOnKoDamageText =
  "[Opponent's Turn] [On K.O.] You may deal 1 damage to your opponent.";

const cardBEffectText = `[Opponent's Turn] [On K.O.] If your Leader has the {Blackbeard Pirates} type, draw 1 card and give up to 1 of your opponent's Leader or Character cards -3000 power during this turn.
[Trigger] Activate this card's [On K.O.] effect.`;

const installCardADefinition = (
  state: ReturnType<typeof setupAttackState>,
  cardId: ReturnType<typeof toCardId>,
): EffectDefinition => {
  const definition: EffectDefinition = {
    cardId,
    implementationStatus: "implemented-dsl",
    effects: [
      {
        id: `${String(cardId)}:on-ko-damage` as EffectBlock["id"],
        category: "auto",
        trigger: { type: "onKO" },
        optional: true,
        oncePerTurn: false,
        condition: { type: "opponentTurn" },
        sourcePresencePolicy: "resolveFromDestinationZone",
        effect: {
          type: "damage",
          target: "leader",
          player: "opponent",
          count: 1,
        },
      },
    ],
    metadata: {
      sourceTextHash: "specialized-card-a-on-ko-damage",
      rulesVersion: "specialized-card-a-rules",
      effectDefinitionsVersion: "specialized-turn-window",
      tested: true,
      reviewer: "qa-reviewer",
    },
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-specialized-card-a": definition,
  };
  state.cardManifest.cards[cardId] = resolvedCard({
    cardId,
    category: "character",
    power: 3000,
    effectText: cardAOnKoDamageText,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-specialized-card-a",
      rulesVersion: definition.metadata.rulesVersion,
      sourceTextHash: definition.metadata.sourceTextHash,
    },
  });
  return definition;
};

const installCardBDefinition = (
  state: ReturnType<typeof setupAttackState>,
  cardId: ReturnType<typeof toCardId>,
): EffectDefinition => {
  const triggerEffectId =
    `${String(cardId)}:trigger-activate-on-ko` as EffectBlock["id"];
  const onKoEffectId =
    `${String(cardId)}:on-ko-draw-power-down` as EffectBlock["id"];
  const definition: EffectDefinition = {
    cardId,
    implementationStatus: "implemented-dsl",
    effects: [
      {
        id: triggerEffectId,
        category: "auto",
        trigger: { type: "trigger" },
        optional: false,
        oncePerTurn: false,
        sourcePresencePolicy: "noSourceRequired",
        effect: {
          type: "activateReferencedEffect",
          source: { type: "triggerCard" },
          trigger: { type: "onKO" },
        },
      },
      {
        id: onKoEffectId,
        category: "auto",
        trigger: { type: "onKO" },
        optional: false,
        oncePerTurn: false,
        condition: {
          type: "and",
          conditions: [
            { type: "opponentTurn" },
            {
              type: "hasCardInZone",
              zone: "leaderArea",
              player: "self",
              filter: {
                categories: ["leader"],
                typesAny: ["Blackbeard Pirates"],
              },
            },
          ],
        },
        sourcePresencePolicy: "resolveFromDestinationZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: { type: "draw", player: "self", count: 1 },
            },
            {
              connector: "then",
              effect: {
                type: "modifyPower",
                target: {
                  type: "chooseFromZones",
                  request: {
                    timing: "onResolution",
                    chooser: "self",
                    player: "opponent",
                    zones: ["leaderArea", "characterArea"],
                    min: 0,
                    max: 1,
                    allowFewerIfUnavailable: true,
                    visibility: "public",
                    filter: { categories: ["leader", "character"] },
                  },
                },
                value: -3000,
                duration: { type: "thisTurn" },
              },
            },
          ],
        },
      },
    ],
    metadata: {
      sourceTextHash: "specialized-card-b-trigger-on-ko",
      rulesVersion: "specialized-card-b-rules",
      effectDefinitionsVersion: "specialized-turn-window",
      tested: true,
      reviewer: "qa-reviewer",
    },
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-specialized-card-b": definition,
  };
  state.cardManifest.cards[cardId] = resolvedCard({
    cardId,
    category: "character",
    power: 5000,
    effectText: cardBEffectText,
    triggerText: "[Trigger] Activate this card's [On K.O.] effect.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-specialized-card-b",
      rulesVersion: definition.metadata.rulesVersion,
      sourceTextHash: definition.metadata.sourceTextHash,
    },
  });
  return definition;
};

test("damage-triggered life trigger activates but skips referenced On K.O. when its turn window is false", () => {
  const state = setupAttackState();
  state.turn.turnPlayerId = p1;
  state.cardManifest.effectDefinitionsVersion = "specialized-turn-window";
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "p1 attacker");
  const target = must(p2State.characters[0], "p2 on-ko damage character");
  const topLife = must(p1State.life[0], "p1 top life");
  const cardAId = toCardId("specialized-card-a-on-ko-damage");
  const cardBId = toCardId("specialized-card-b-trigger-on-ko");
  installCardADefinition(state, cardAId);
  const cardBDefinition = installCardBDefinition(state, cardBId);
  const referencedOnKo = must(cardBDefinition.effects[1], "card B On K.O.");

  state.cardManifest.cards[p1State.leader.cardId] = {
    ...resolvedCard({
      cardId: p1State.leader.cardId,
      category: "leader",
      power: 5000,
    }),
    types: ["Blackbeard Pirates"],
  };
  state.cardManifest.cards[p2State.leader.cardId] = resolvedCard({
    cardId: p2State.leader.cardId,
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 3000,
  });
  target.cardId = cardAId;
  target.state = "rested";
  p1State.life[0] = {
    ...topLife,
    card: { ...topLife.card, cardId: cardBId },
  };
  ensureActiveDonInCostArea(state, p1, 1);
  const attachedDon = must(
    p1State.costArea.find((card) => card.state === "active"),
    "attached DON",
  );
  attacker.attachedDon = [attachedDon.instanceId];

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
  });
  assert.equal(opened.errors, undefined);

  const koResolved = passCounterStep(opened.state, p2);
  assert.equal(koResolved.errors, undefined);
  const optionalOnKo = must(
    koResolved.state.pendingDecision,
    "Card A optional On K.O. decision",
  );
  assert.equal(optionalOnKo.type, "chooseOptionalActivation");

  const damageActivated = applyAction(koResolved.state, {
    type: "respondToDecision",
    decisionId: optionalOnKo.id,
    response: { type: "optionalActivation", choice: "activate" },
  });
  assert.equal(damageActivated.errors, undefined);
  const lifeTrigger = must(
    damageActivated.state.pendingDecision,
    "Card B life trigger decision",
  );
  assert.equal(lifeTrigger.type, "confirmLifeTrigger");
  assert.equal(lifeTrigger.playerId, p1);

  const triggerActivated = applyAction(damageActivated.state, {
    type: "respondToDecision",
    decisionId: lifeTrigger.id,
    response: { type: "lifeTrigger", choice: "activateTrigger" },
  });

  assert.deepEqual(
    {
      errors: triggerActivated.errors,
      pendingDecisionType: triggerActivated.state.pendingDecision?.type,
      queuedEffectBlockIds: triggerActivated.state.effectQueue.map((entry) =>
        String(entry.effectBlockId),
      ),
      eventTypes: triggerActivated.events.map((event) => event.type),
      effectQueuedBlockIds: triggerActivated.events
        .filter((event) => event.type === "effectQueued")
        .map((event) =>
          String((event.payload as { effectBlockId?: unknown }).effectBlockId),
        ),
      effectResolvedBlockIds: triggerActivated.events
        .filter((event) => event.type === "effectResolved")
        .map((event) =>
          String((event.payload as { effectBlockId?: unknown }).effectBlockId),
        ),
      effectResolvedStatuses: triggerActivated.events
        .filter((event) => event.type === "effectResolved")
        .map((event) => String((event.payload as { status?: unknown }).status)),
      referencedOnKoEffectId: String(referencedOnKo.id),
    },
    {
      errors: undefined,
      pendingDecisionType: undefined,
      queuedEffectBlockIds: [],
      eventTypes: [
        "decisionResolved",
        "cardRevealed",
        "triggerActivated",
        "effectQueued",
        "effectQueued",
        "effectResolved",
        "cardMoved",
        "cardTrashed",
        "effectResolved",
      ],
      effectQueuedBlockIds: [
        "specialized-card-b-trigger-on-ko:trigger-activate-on-ko",
        "specialized-card-b-trigger-on-ko:on-ko-draw-power-down",
      ],
      effectResolvedBlockIds: [
        "specialized-card-b-trigger-on-ko:trigger-activate-on-ko",
        "specialized-card-b-trigger-on-ko:on-ko-draw-power-down",
      ],
      effectResolvedStatuses: ["resolved", "conditionFailed"],
      referencedOnKoEffectId: String(referencedOnKo.id),
    },
  );
});
