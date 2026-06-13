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
  Target,
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

test("accepted opponent field-removal replacement moves the covered Character to Life face-down", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const sourceHand = must(p1State.hand[0], "source");
  const targetHand = must(p2State.hand[0], "target");
  const source: CardInstance = {
    ...sourceHand,
    zone: { zone: "characterArea", playerId: p1, slot: "character", index: 0 },
    state: "active",
    attachedDon: [],
  };
  const targetCardId = toCardId("supernovas-replacement-target");
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
  p2State.hand = p2State.hand.slice(1);

  const replacementTarget: Target = {
    type: "all",
    zone: "characterArea",
    player: "self",
    filter: {
      categories: ["character"],
      typesAny: ["Supernovas"],
      nameNot: ['Capone"Gang"Bege'],
    },
  };
  const when: ReplacementTrigger = {
    type: "wouldMoveZone",
    from: "characterArea",
    sourceKind: "cardEffect",
    sourceControllerRelation: "opponentControlled",
    target: replacementTarget,
  };
  const effectId = toEffectId("replacement:field-removal-target-to-life");
  const effectDefinitionId = "definition:field-removal-target-to-life";
  state.cardManifest.cards[source.cardId] = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
  });
  state.cardManifest.cards[targetCard.cardId] = {
    ...resolvedCard({
      cardId: targetCard.cardId,
      category: "character",
      power: 6000,
      support: {
        status: "implemented-dsl",
        effectDefinitionId,
        rulesVersion: "replacement-rules",
        sourceTextHash: "replacement-source",
      },
    }),
    types: ["Supernovas"],
    name: "Protected Supernova",
  };
  const effectBlock: EffectDefinition["effects"][number] = {
    id: effectId,
    category: "replacement",
    trigger: { type: "replacement", replacement: when },
    oncePerTurn: true,
    optional: true,
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    effect: {
      type: "replacement",
      when,
      instead: {
        type: "bounce",
        target: { type: "replacementTarget" },
        destination: "lifeTop",
        destinationFaceUp: false,
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
        reviewedAt: "2026-06-13T00:00:00.000Z",
      },
    },
  };
  const entry: EffectQueueEntry = {
    id: toQueueEntryId("queue-entry-field-removal-target-to-life"),
    state: "pending",
    timingWindowId:
      "timing-window-field-removal-target-to-life" as TimingWindowId,
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
  const decision = paused.state.pendingDecision;
  if (decision?.type !== "chooseReplacement") {
    assert.fail("expected chooseReplacement decision");
  }
  const replacementId = must(decision.replacementIds[0], "replacement id");
  assert.match(replacementId, new RegExp(`${effectId}$`, "u"));

  const accepted = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "replacement", replacementId },
  });
  const nextP2 = must(accepted.state.players[p2], "next p2");

  assert.equal(accepted.errors, undefined);
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === targetCard.instanceId),
    false,
  );
  assert.equal(
    nextP2.trash.some((card) => card.instanceId === targetCard.instanceId),
    false,
  );
  const topLife = must(nextP2.life[0], "top Life");
  assert.equal(topLife.card.instanceId, targetCard.instanceId);
  assert.equal(topLife.faceUp, false);
  assert.equal(topLife.card.zone.zone, "life");
  assert.equal(accepted.state.oncePerTurn.length, 1);
  assert.deepEqual(
    accepted.events.map((event) => event.type),
    ["decisionResolved", "replacementApplied", "cardMoved"],
  );
});
