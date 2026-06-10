import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  EffectDefinition,
  EffectQueueEntry,
  ResolvedCard,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
} from "../../action-test-fixtures.js";
import { processEffectRuntime } from "../../effect-runtime.js";
import {
  applyAction,
  queuedEffect,
  toCardId,
  toDecisionId,
  toInstanceId,
  toQueueEntryId,
} from "../../effect-runtime-queue/test-support.js";
import { lifeTriggerQueueOrigin } from "../../life-trigger/queue-origin.js";

const installDefinition = (
  state: ReturnType<typeof createActiveState>,
  card: CardInstance,
  definition: EffectDefinition,
  category: ResolvedCard["category"] = "event",
  effectDefinitionId = `def-${String(card.cardId)}`,
): void => {
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category,
    ...(category === "event" || category === "character" ? { cost: 0 } : {}),
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: definition.metadata.rulesVersion,
      sourceTextHash: definition.metadata.sourceTextHash,
    },
  });
};

const optionalTriggerDrawDefinition = (
  cardId: EffectDefinition["cardId"],
  support: ResolvedCard["support"],
): EffectDefinition => {
  const base = reviewedOnPlayDrawDefinition(cardId, support);
  const baseEffect = must(base.effects[0], "base effect");
  return {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: `${String(cardId)}:optional:trigger` as typeof baseEffect.id,
        trigger: { type: "trigger" },
        optional: true,
        sourcePresencePolicy: "noSourceRequired",
      },
    ],
  };
};

const optionalLifeTriggerDrawState = (): {
  state: ReturnType<typeof createActiveState>;
  entry: EffectQueueEntry;
} => {
  const state = createActiveState();
  const cardId = toCardId("optional-life-trigger-card");
  const source = must(state.players[p1], "p1").leader;
  const supportCard = resolvedCard({ cardId, category: "event" });
  const definition = optionalTriggerDrawDefinition(cardId, supportCard.support);
  const effect = must(definition.effects[0], "optional life effect");
  installDefinition(
    state,
    { ...source, cardId },
    definition,
    "event",
    "def-optional-life-trigger",
  );
  const noZone = {
    zone: "noZone" as const,
    playerId: p1,
    slot: "temporary" as const,
  };
  const entry: EffectQueueEntry = {
    ...queuedEffect(cardId),
    id: toQueueEntryId("queue-entry:optional-life-trigger"),
    queueOrigin: lifeTriggerQueueOrigin,
    source: {
      instanceId: toInstanceId("optional-life-instance"),
      cardId,
      playerId: p1,
      zone: noZone,
    },
    sourceSnapshot: {
      ...queuedEffect(cardId).sourceSnapshot,
      instanceId: toInstanceId("optional-life-instance"),
      cardId,
      zone: noZone,
      category: "event",
    },
    effectBlockId: effect.id,
    sourcePresencePolicy: must(
      effect.sourcePresencePolicy,
      "life source presence policy",
    ),
    causedBy: {
      type: "decision",
      decisionId: toDecisionId("decision:life-trigger:optional"),
    },
  };
  state.effectQueue = [entry];
  state.revealedCards = [
    {
      id: "reveal:optional-life-trigger",
      cards: [entry.source],
      visibility: { type: "public" },
      origin: "lifeDamage",
      createdAtStateSeq: state.seq,
      cleanupPolicy: "trashAfterResolution",
    },
  ];
  return { state, entry };
};

const assertOptionalDecision = (
  result: ReturnType<typeof processEffectRuntime>,
  entry: EffectQueueEntry,
): void => {
  const decision = must(result.state.pendingDecision, "optional decision");
  assert.equal(result.errors, undefined);
  assert.equal(decision.type, "chooseOptionalActivation");
  assert.equal(decision.playerId, entry.controllerId);
  assert.equal(decision.effectId, entry.effectBlockId);
  assert.deepEqual(decision.source, entry.source);
  assert.deepEqual(decision.options, ["activate", "decline"]);
  assert.deepEqual(decision.causedBy, {
    type: "effect",
    queueEntryId: entry.id,
    effectId: entry.effectBlockId,
  });
  assert.deepEqual(result.state.effectQueue, [entry]);
};

test("optional life-trigger no-choice draw creates optional body decision after trigger activation", () => {
  const { state, entry } = optionalLifeTriggerDrawState();

  const result = processEffectRuntime(state);

  assertOptionalDecision(result, entry);
  assert.equal(result.state.revealedCards.length, 1);
  assert.equal(
    must(result.state.revealedCards[0], "revealed trigger").id,
    "reveal:optional-life-trigger",
  );
});

test("declining optional life-trigger body cleans up revealed trigger without drawing", () => {
  const { state, entry } = optionalLifeTriggerDrawState();
  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "optional decision");
  const beforeP1 = must(paused.state.players[p1], "p1 before decline");
  const beforeDeck = beforeP1.deck.length;
  const beforeHand = beforeP1.hand.length;

  const declined = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "optionalActivation", choice: "decline" },
  });
  const afterP1 = must(declined.state.players[p1], "p1 after decline");

  assert.equal(declined.errors, undefined);
  assert.equal(declined.state.pendingDecision, undefined);
  assert.equal(declined.state.effectQueue.length, 0);
  assert.equal(declined.state.revealedCards.length, 0);
  assert.equal(afterP1.deck.length, beforeDeck);
  assert.equal(afterP1.hand.length, beforeHand);
  assert.equal(
    afterP1.trash.some((card) => card.instanceId === entry.source.instanceId),
    true,
  );
  assert.deepEqual(
    declined.events.map((event) => event.type),
    ["decisionResolved", "cardMoved", "cardTrashed"],
  );
});

test("accepting optional life-trigger body draws and cleans up revealed trigger", () => {
  const { state, entry } = optionalLifeTriggerDrawState();
  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "optional decision");
  const beforeP1 = must(paused.state.players[p1], "p1 before accept");
  const beforeDeck = beforeP1.deck.length;
  const beforeHand = beforeP1.hand.length;

  const accepted = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "optionalActivation", choice: "activate" },
  });
  const afterP1 = must(accepted.state.players[p1], "p1 after accept");
  const eventTypes = accepted.events.map((event) => event.type);

  assert.equal(accepted.errors, undefined);
  assert.equal(accepted.state.pendingDecision, undefined);
  assert.equal(accepted.state.effectQueue.length, 0);
  assert.equal(accepted.state.revealedCards.length, 0);
  assert.equal(afterP1.deck.length, beforeDeck - 1);
  assert.equal(afterP1.hand.length, beforeHand + 1);
  assert.equal(
    afterP1.trash.some((card) => card.instanceId === entry.source.instanceId),
    true,
  );
  assert.equal(eventTypes.includes("cardDrawn"), true);
  assert.equal(eventTypes.includes("effectResolved"), true);
  assert.equal(eventTypes.includes("cardTrashed"), true);
});
