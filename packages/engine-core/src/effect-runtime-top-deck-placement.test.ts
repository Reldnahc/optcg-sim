import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectQueueEntry } from "./effect-runtime-queue-processing-test-support.js";
import {
  applyAction,
  createActiveState,
  filterStateForPlayer,
  must,
  p1,
  p2,
  processEffectRuntime,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toCardId,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
} from "./effect-runtime-queue-processing-test-support.js";

test("queued top-deck placement lets the controller put looked cards on top and bottom", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  while (player.deck.length < 3) {
    const base = must(player.deck.at(-1), "deck card");
    player.deck.push({
      ...base,
      instanceId:
        `${String(base.instanceId)}:${String(player.deck.length)}` as typeof base.instanceId,
      zone: { ...base.zone, index: player.deck.length },
    });
  }
  for (const [index, id] of ["look-a", "look-b", "tail-c"].entries()) {
    const card = must(player.deck[index], "deck card");
    card.cardId = toCardId(id);
    state.cardManifest.cards[card.cardId] = resolvedCard({
      cardId: card.cardId,
      category: "character",
    });
  }

  const source = player.leader;
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-top-deck-placement",
      rulesVersion: "top-deck-placement-rules",
      sourceTextHash: "top-deck-placement-source",
    },
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    source.cardId,
    supportCard.support,
  );
  const effectBlockId = toEffectId("effect-top-deck-placement");
  state.cardManifest.cards[source.cardId] = supportCard;
  state.cardManifest.effectDefinitionsVersion =
    baseDefinition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-top-deck-placement": {
      ...baseDefinition,
      effects: [
        {
          ...must(baseDefinition.effects[0], "base effect"),
          id: effectBlockId,
          trigger: { type: "whenAttacking" },
          effect: {
            type: "placeTopDeckCards",
            player: "self",
            count: 2,
            destinations: ["top", "bottom"],
            order: "ownerChoice",
          },
          sourcePresencePolicy: "mustRemainInSameZone",
        },
      ],
    },
  };
  const queueEntry: EffectQueueEntry = {
    ...queueDrawForP1(),
    id: toQueueEntryId("queue-entry-top-deck-placement"),
    timingWindowId:
      "window-top-deck-placement" as EffectQueueEntry["timingWindowId"],
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    sourceSnapshot: toSourceSnapshot(source, p1, p1),
    effectBlockId,
    createdAtEventSeq: 1,
    queuedAtStateSeq: state.seq,
    sourcePresencePolicy: "mustRemainInSameZone",
    causedBy: { type: "ruleProcess", name: "test" },
  };
  state.effectQueue = [queueEntry];

  const opened = processEffectRuntime(state);
  assert.equal(opened.errors, undefined);
  const decision = must(opened.state.pendingDecision, "pending decision");
  assert.equal(decision.type, "orderCards");
  assert.deepEqual(
    decision.cards.map((card) => card.cardId),
    [toCardId("look-a"), toCardId("look-b")],
  );
  assert.deepEqual(decision.destination, "deck");
  assert.deepEqual(decision.placement, { type: "topOrBottom" });
  assert.equal(
    filterStateForPlayer(opened.state, p1).pendingDecision?.type,
    "orderCards",
  );
  assert.equal(
    filterStateForPlayer(opened.state, p2).pendingDecision,
    undefined,
  );

  const topCard = must(decision.cards[1], "top card");
  const bottomCard = must(decision.cards[0], "bottom card");
  const resolved = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "topBottomPlacement",
      topIds: [String(topCard.instanceId)],
      bottomIds: [String(bottomCard.instanceId)],
    },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.deepEqual(
    must(resolved.state.players[p1], "p1")
      .deck.slice(0, 3)
      .map((card) => card.cardId),
    [toCardId("look-b"), toCardId("tail-c"), toCardId("look-a")],
  );
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    ["decisionResolved", "effectResolved"],
  );
});
