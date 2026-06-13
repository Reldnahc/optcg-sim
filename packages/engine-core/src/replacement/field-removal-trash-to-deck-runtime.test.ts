import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  CardRef,
  EffectDefinition,
  EffectId,
  EffectQueueEntry,
  PlayerId,
  QueueEntryId,
  ReplacementTrigger,
  TimingWindowId,
} from "@optcg/types";

import { applyAction } from "../actions.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
} from "../action-test-fixtures.js";
import { executeSelectedTargetEffectPrimitive } from "../runtime/primitives/execute.js";

const toCardId = (value: string): CardId => value as CardId;
const toEffectId = (value: string): EffectId => value as EffectId;
const toQueueEntryId = (value: string): QueueEntryId => value as QueueEntryId;

const sourceSnapshot = (
  card: CardInstance,
  controllerId: PlayerId,
): EffectQueueEntry["sourceSnapshot"] => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  ownerId: card.owner,
  controllerId,
  zone: card.zone,
  category: "character",
  colors: ["red"],
  keywords: [],
  power: 5000,
});

const cardRef = (card: CardInstance, playerId: PlayerId): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

test("accepted K.O. replacement can move selected trash cards to deck bottom instead", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const sourceHand = must(p1State.hand[0], "source");
  const targetHand = must(p2State.hand[0], "target");
  const trashCards = p2State.hand.slice(1, 4).map((card, index) => ({
    ...card,
    zone: {
      zone: "trash" as const,
      playerId: p2,
      slot: "trash" as const,
      index,
    },
    state: "active" as const,
    attachedDon: [],
  }));
  assert.equal(trashCards.length, 3);

  const source: CardInstance = {
    ...sourceHand,
    zone: { zone: "characterArea", playerId: p1, slot: "character", index: 0 },
    state: "active",
    attachedDon: [],
  };
  const targetCardId = toCardId("trash-to-deck-replacement-target");
  const targetCard: CardInstance = {
    ...targetHand,
    cardId: targetCardId,
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 0 },
    state: "active",
    attachedDon: [],
  };
  p1State.characters = [source];
  p1State.hand = p1State.hand.slice(1);
  p2State.characters = [targetCard];
  p2State.trash = trashCards;
  p2State.hand = p2State.hand.slice(4);
  const deckLengthBefore = p2State.deck.length;

  const when: ReplacementTrigger = {
    type: "wouldBeKOd",
    target: { type: "self" },
  };
  const effectId = toEffectId("replacement:self-ko-trash-to-deck");
  const effectDefinitionId = "definition:self-ko-trash-to-deck";
  state.cardManifest.cards[source.cardId] = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
  });
  state.cardManifest.cards[targetCard.cardId] = resolvedCard({
    cardId: targetCard.cardId,
    category: "character",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "replacement-rules",
      sourceTextHash: "replacement-source",
    },
  });
  const effectBlock: EffectDefinition["effects"][number] = {
    id: effectId,
    category: "replacement",
    trigger: { type: "replacement", replacement: when },
    optional: true,
    condition: { type: "opponentTurn" },
    oncePerTurn: true,
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    effect: {
      type: "replacement",
      when,
      instead: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "moveCards",
                count: 3,
                chooser: "self",
                from: { player: "self", zone: "trash" },
                to: { player: "self", zone: "deck", position: "bottom" },
                order: "chooserChoice",
                optional: true,
              },
            },
          },
        ],
      },
    },
  };
  state.cardManifest.effectDefinitions = {
    [effectDefinitionId]: {
      cardId: targetCard.cardId,
      implementationStatus: "implemented-dsl",
      effects: [effectBlock],
      metadata: {
        sourceTextHash: "replacement-source",
        rulesVersion: "replacement-rules",
        effectDefinitionsVersion: state.cardManifest.effectDefinitionsVersion,
        tested: true,
        reviewedBy: "engine-reviewer",
        reviewedAt: "2026-05-29T00:00:00.000Z",
      },
    },
  };
  const entry: EffectQueueEntry = {
    id: toQueueEntryId("queue-entry-self-ko-trash-to-deck"),
    state: "pending",
    timingWindowId: "timing-window-self-ko-trash-to-deck" as TimingWindowId,
    generation: 0,
    controllerId: p1,
    source: cardRef(source, p1),
    sourceSnapshot: sourceSnapshot(source, p1),
    effectBlockId: toEffectId("ko-target-effect"),
    orderingGroup: "turnPlayer",
    createdAtEventSeq: 0,
    queuedAtStateSeq: state.seq,
    sourcePresencePolicy: "mustRemainInSameZone",
    causedBy: { type: "ruleProcess", name: "field-removal-replacement-test" },
  };

  const paused = executeSelectedTargetEffectPrimitive(
    state,
    entry,
    {
      type: "ko",
      target: {
        type: "choose",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "opponent",
          zone: "characterArea",
          min: 0,
          max: 1,
          allowFewerIfUnavailable: true,
          visibility: "public",
        },
      },
    },
    [cardRef(targetCard, p2)],
  );
  const replacementDecision = paused.state.pendingDecision;
  if (replacementDecision?.type !== "chooseReplacement") {
    assert.fail("expected chooseReplacement decision");
  }
  const replacementId = must(
    replacementDecision.replacementIds[0],
    "replacement id",
  );
  const accepted = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: replacementDecision.id,
    response: { type: "replacement", replacementId },
  });
  const payDecision = accepted.state.pendingDecision;
  if (payDecision?.type !== "payCost") {
    assert.fail("expected moveCards payCost replacement decision");
  }
  assert.deepEqual(payDecision.paymentOptions, [
    {
      id: "moveCards",
      type: "moveCards",
      count: 3,
      from: { player: "self", zone: "trash" },
      to: { player: "self", zone: "deck", position: "bottom" },
    },
  ]);

  const resolved = applyAction(accepted.state, {
    type: "respondToDecision",
    decisionId: payDecision.id,
    response: {
      type: "payment",
      optionId: "moveCards",
      selectedCardInstanceIds: trashCards.map((card) => card.instanceId),
    },
  });
  const nextP2 = must(resolved.state.players[p2], "next p2");

  assert.equal(resolved.errors, undefined);
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === targetCard.instanceId),
    true,
  );
  assert.equal(nextP2.trash.length, 0);
  assert.deepEqual(
    nextP2.deck.slice(deckLengthBefore).map((card) => card.instanceId),
    trashCards.map((card) => card.instanceId),
  );
});
