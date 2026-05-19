import assert from "node:assert/strict";
import { test } from "vitest";

import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "../../packages/engine-core/src/action-test-fixtures.ts";
import { filterStateForPlayer } from "../../packages/engine-core/src/filter-state-for-player.ts";
import { executeSelectedTargetEffectPrimitive } from "../../packages/engine-core/src/effect-runtime-primitives.ts";

const protectTargetFromOpponentEffectRemoval = (state, target, condition) => {
  state.continuousEffects = [
    {
      id: `hidden-info-field-removal-protection:${String(target.instanceId)}`,
      source: {
        instanceId: target.instanceId,
        cardId: target.cardId,
        playerId: target.controller,
        zone: target.zone,
      },
      sourceSnapshot: {
        instanceId: target.instanceId,
        cardId: target.cardId,
        ownerId: target.owner,
        controllerId: target.controller,
        zone: target.zone,
        category: "character",
        colors: ["red"],
        power: 3000,
        keywords: [],
      },
      controller: target.controller,
      modifier: {
        layer: "protection",
        target: { type: "self" },
        operation: {
          type: "protection",
          protection: {
            process: "fieldRemoval",
            fieldRemoval: {
              processFamily: "fieldRemoval",
              classification: "moveFromFieldToTrash",
              sourceKind: "cardEffect",
              sourceControllerRelation: "opponentControlled",
              targetScope: "thisCard",
              exclusions: {
                battleKO: "excluded",
                ruleProcessTrash: "excluded",
                controllerCost: "excluded",
                controllerOwnedEffect: "excluded",
                ambiguousCustomRemoval: "failClosed",
              },
            },
          },
        },
      },
      duration: { type: "permanent" },
      ...(condition === undefined ? {} : { condition }),
      createdBy: { type: "ruleProcess", name: "hidden-info-protection-test" },
      createdAtStateSeq: state.seq,
    },
  ];
};

test("prevented opponent field removal does not expose private opponent card identities", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const source = must(p1State.hand[0], "source");
  const targetHandCard = must(p2State.hand[0], "target");
  const hiddenHandCard = must(p2State.hand[1], "hidden hand");
  const trashSeedCard = must(p2State.hand[2], "trash seed");
  const hiddenDeckCard = must(p2State.deck[0], "hidden deck");
  const hiddenLifeCard = must(p2State.life[0], "hidden life").card;
  const sourceOnField = {
    ...source,
    zone: { zone: "characterArea", playerId: p1, slot: "character", index: 0 },
    state: "active",
    attachedDon: [],
    turnPlayed: state.turn.globalTurn,
  };
  const protectedTarget = {
    ...targetHandCard,
    cardId: toCardId("protected-hidden-info-target"),
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 0 },
    state: "rested",
    attachedDon: [],
    turnPlayed: state.turn.globalTurn,
  };
  p1State.characters = [sourceOnField];
  p1State.hand = p1State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  p2State.characters = [protectedTarget];
  p2State.hand = p2State.hand
    .slice(1)
    .filter((card) => card.instanceId !== trashSeedCard.instanceId)
    .map((card, index) => ({
      ...card,
      zone: { zone: "hand", playerId: p2, slot: "hand", index },
    }));
  p2State.trash = [
    {
      ...trashSeedCard,
      zone: { zone: "trash", playerId: p2, slot: "trash", index: 0 },
    },
  ];
  state.cardManifest.cards[sourceOnField.cardId] = resolvedCard({
    cardId: sourceOnField.cardId,
    category: "character",
    power: 5000,
  });
  state.cardManifest.cards[protectedTarget.cardId] = resolvedCard({
    cardId: protectedTarget.cardId,
    category: "character",
    power: 3000,
  });
  protectTargetFromOpponentEffectRemoval(state, protectedTarget, {
    type: "trashCount",
    player: "self",
    op: "gte",
    value: 1,
  });

  const result = executeSelectedTargetEffectPrimitive(
    state,
    {
      id: "queue-entry-hidden-info-ko",
      state: "pending",
      timingWindowId: "window-hidden-info-ko",
      generation: 0,
      controllerId: p1,
      source: {
        instanceId: sourceOnField.instanceId,
        cardId: sourceOnField.cardId,
        playerId: p1,
        zone: sourceOnField.zone,
      },
      sourceSnapshot: {
        instanceId: sourceOnField.instanceId,
        cardId: sourceOnField.cardId,
        ownerId: sourceOnField.owner,
        controllerId: sourceOnField.controller,
        zone: sourceOnField.zone,
        category: "character",
        colors: ["red"],
        power: 5000,
        keywords: [],
      },
      effectBlockId: "effect-hidden-info-ko",
      orderingGroup: "turnPlayer",
      createdAtEventSeq: 1,
      queuedAtStateSeq: state.seq,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "hidden-info-ko-test" },
    },
    {
      type: "ko",
      target: {
        type: "choose",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "opponent",
          zone: "characterArea",
          min: 1,
          max: 1,
          allowFewerIfUnavailable: false,
          visibility: "public",
        },
      },
    },
    [
      {
        instanceId: protectedTarget.instanceId,
        cardId: protectedTarget.cardId,
        playerId: p2,
        zone: protectedTarget.zone,
      },
    ],
  );

  assert.equal(result.errors, undefined);
  const attackerView = filterStateForPlayer(result.state, p1);
  const serialized = JSON.stringify(attackerView);

  assert.equal(serialized.includes(String(protectedTarget.cardId)), true);
  assert.equal(serialized.includes(String(hiddenHandCard.cardId)), false);
  assert.equal(serialized.includes(String(hiddenDeckCard.cardId)), false);
  assert.equal(serialized.includes(String(hiddenLifeCard.cardId)), false);
  assert.equal(
    must(result.state.players[p2], "result p2").trash.some(
      (card) => card.instanceId === protectedTarget.instanceId,
    ),
    false,
  );
});
