import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  EffectDefinition,
  EffectId,
  ReplacementTrigger,
  Target,
} from "@optcg/types";

import { applyAction } from "../actions.js";
import { must, p1, p2, resolvedCard } from "../action-test-fixtures.js";
import { applyDeclareAttack } from "./actions.js";
import { passCounterStep, setupAttackState } from "./test-fixtures.js";

const toCardId = (value: string): CardId => value as CardId;
const toEffectId = (value: string): EffectId => value as EffectId;

const addRedHairBattleKoTrashFromHandReplacement = (
  state: ReturnType<typeof setupAttackState>,
  target: CardInstance,
  costCard: CardInstance,
): EffectId => {
  const targetCardId = toCardId("battle-red-hair-target");
  const costCardId = toCardId("battle-red-hair-trash-cost");
  const replacementSource = must(state.players[p2], "p2").leader;
  target.cardId = targetCardId;
  costCard.cardId = costCardId;
  const replacementTarget: Target = {
    type: "all",
    zone: "characterArea",
    player: "self",
    filter: {
      categories: ["character"],
      typesAny: ["Red-Haired Pirates"],
    },
  };
  const when: ReplacementTrigger = {
    type: "wouldBeKOd",
    sourceControllerRelation: "any",
    target: replacementTarget,
  };
  const effectId = toEffectId("replacement:battle-ko-trash-from-hand");
  const effectDefinitionId = "definition:battle-ko-trash-from-hand";
  state.cardManifest.cards[target.cardId] = {
    ...resolvedCard({
      cardId: target.cardId,
      category: "character",
      power: 3000,
    }),
    types: ["Red-Haired Pirates"],
  };
  state.cardManifest.cards[costCard.cardId] = resolvedCard({
    cardId: costCard.cardId,
    category: "character",
    power: 6000,
  });
  state.cardManifest.cards[replacementSource.cardId] = resolvedCard({
    cardId: replacementSource.cardId,
    category: "leader",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "battle-ko-trash-from-hand-rules",
      sourceTextHash: "battle-ko-trash-from-hand-source",
    },
  });
  const effectBlock: EffectDefinition["effects"][number] = {
    id: effectId,
    category: "replacement",
    trigger: { type: "replacement", replacement: when },
    optional: true,
    oncePerTurn: true,
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    effect: {
      type: "replacement",
      when,
      instead: {
        type: "trashFromHand",
        player: "self",
        chooser: "self",
        count: 1,
        filter: {
          categories: ["character"],
          power: { min: 6000 },
        },
      },
    },
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [effectDefinitionId]: {
      cardId: replacementSource.cardId,
      implementationStatus: "implemented-dsl",
      effects: [effectBlock],
      metadata: {
        sourceTextHash: "battle-ko-trash-from-hand-source",
        rulesVersion: "battle-ko-trash-from-hand-rules",
        effectDefinitionsVersion: state.cardManifest.effectDefinitionsVersion,
        tested: true,
        reviewedBy: "engine-reviewer",
        reviewedAt: "2026-06-13T00:00:00.000Z",
      },
    },
  };
  return effectId;
};

test("battle K.O. replacement trash-from-hand response is not routed as Counter Step pass", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  const costCard = must(p2State.hand[0], "replacement trash cost card");
  const replacementId = addRedHairBattleKoTrashFromHandReplacement(
    state,
    target,
    costCard,
  );
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
  });

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
  const result = passCounterStep(opened.state, p2);
  assert.equal(result.errors, undefined);
  const decision = must(result.state.pendingDecision, "replacement decision");
  assert.equal(decision.type, "chooseReplacement");
  const offeredReplacementId = must(
    decision.replacementIds[0],
    "replacement id",
  );
  assert.match(offeredReplacementId, new RegExp(`${replacementId}$`, "u"));

  const accepted = applyAction(result.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "replacement", replacementId: offeredReplacementId },
  });
  const trashDecision = accepted.state.pendingDecision;
  if (trashDecision?.type !== "selectCards") {
    assert.fail("expected replacement trash-from-hand decision");
  }
  assert.equal(accepted.errors, undefined);
  assert.equal(trashDecision.playerId, p2);
  assert.deepEqual(trashDecision.request.filter, {
    categories: ["character"],
    power: { min: 6000 },
  });

  const resolved = applyAction(accepted.state, {
    type: "respondToDecision",
    decisionId: trashDecision.id,
    response: {
      type: "cards",
      cards: [
        {
          instanceId: costCard.instanceId,
          cardId: costCard.cardId,
          playerId: p2,
          zone: costCard.zone,
        },
      ],
    },
  });
  const nextP2 = must(resolved.state.players[p2], "resolved p2");

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(resolved.state.battle, undefined);
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === target.instanceId),
    true,
  );
  assert.equal(
    nextP2.trash.some((card) => card.instanceId === costCard.instanceId),
    true,
  );
});
