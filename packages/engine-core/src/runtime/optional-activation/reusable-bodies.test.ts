import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  EffectDefinition,
  EffectQueueEntry,
  ResolvedCard,
} from "@optcg/types";

import {
  addExtraDeckCard,
  createActiveState,
  must,
  p1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
} from "../../action-test-fixtures.js";
import { processEffectRuntime } from "../../effect-runtime.js";
import {
  applyAction,
  queueDrawForP1,
  toQueueEntryId,
  toSourceSnapshot,
  toStateSeq,
  toTimingWindowId,
} from "../../effect-runtime-queue/test-support.js";

const installDefinition = (
  state: ReturnType<typeof createActiveState>,
  card: CardInstance,
  definition: EffectDefinition,
  category: ResolvedCard["category"] = "leader",
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
    ...(category === "character" ? { cost: 0, power: 5000 } : {}),
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: definition.metadata.rulesVersion,
      sourceTextHash: definition.metadata.sourceTextHash,
    },
  });
};

const optionalEffectDefinition = (
  cardId: EffectDefinition["cardId"],
  support: ResolvedCard["support"],
  effect: EffectDefinition["effects"][number]["effect"],
  idSuffix: string,
): EffectDefinition => {
  const base = reviewedOnPlayDrawDefinition(cardId, support);
  const baseEffect = must(base.effects[0], "base effect");
  return {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: `${String(cardId)}:optional:${idSuffix}` as typeof baseEffect.id,
        optional: true,
        effect,
      },
    ],
  };
};

const optionalMoveCardsDefinition = (
  cardId: EffectDefinition["cardId"],
  support: ResolvedCard["support"],
): EffectDefinition =>
  optionalEffectDefinition(
    cardId,
    support,
    {
      type: "moveCards",
      count: 1,
      from: { player: "self", zone: "deck", position: "top" },
      to: { player: "self", zone: "trash" },
      order: "original",
    },
    "move-cards",
  );

test("direct queued optional moveCards prompts first then resolves through the reusable primitive", () => {
  const state = createActiveState();
  addExtraDeckCard(state, p1);
  const p1State = must(state.players[p1], "p1");
  const source = p1State.leader;
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
  });
  const definition = optionalMoveCardsDefinition(
    source.cardId,
    supportCard.support,
  );
  const effect = must(definition.effects[0], "optional moveCards effect");
  installDefinition(
    state,
    source,
    definition,
    "leader",
    "def-direct-optional-move-cards",
  );
  const entry: EffectQueueEntry = {
    ...queueDrawForP1(),
    id: toQueueEntryId("queue-entry-direct-optional-move-cards"),
    timingWindowId: toTimingWindowId(
      "timing-window-direct-optional-move-cards",
    ),
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    sourceSnapshot: toSourceSnapshot(source, p1, p1),
    effectBlockId: effect.id,
    sourcePresencePolicy: must(
      effect.sourcePresencePolicy,
      "moveCards source presence policy",
    ),
    queuedAtStateSeq: toStateSeq(state.seq),
  };
  state.effectQueue = [entry];
  const moved = must(p1State.deck[0], "top deck before moveCards");

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "optional decision");
  assert.equal(paused.errors, undefined);
  assert.equal(decision.type, "chooseOptionalActivation");
  assert.equal(decision.effectId, entry.effectBlockId);
  assert.deepEqual(paused.state.effectQueue, [entry]);
  assert.equal(
    paused.events.some((event) => event.type === "effectResolved"),
    false,
  );

  const accepted = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "optionalActivation", choice: "activate" },
  });

  assert.equal(accepted.errors, undefined);
  assert.equal(accepted.state.pendingDecision, undefined);
  assert.deepEqual(accepted.state.effectQueue, []);
  assert.equal(
    must(accepted.state.players[p1], "accepted p1").trash.some(
      (card) => card.instanceId === moved.instanceId,
    ),
    true,
  );
  assert.deepEqual(
    accepted.events.map((event) => event.type),
    [
      "decisionResolved",
      "cardMoved",
      "cardTrashed",
      "effectResolved",
      "ruleProcessingChecked",
    ],
  );
});

test("direct queued optional drawUpTo prompts before using the reusable quantity path", () => {
  const state = createActiveState();
  addExtraDeckCard(state, p1);
  const source = must(state.players[p1], "p1").leader;
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
  });
  const definition = optionalEffectDefinition(
    source.cardId,
    supportCard.support,
    { type: "drawUpTo", count: 2, player: "self" },
    "draw-upto",
  );
  const effect = must(definition.effects[0], "optional drawUpTo effect");
  installDefinition(
    state,
    source,
    definition,
    "leader",
    "def-direct-optional-draw-upto",
  );
  const entry: EffectQueueEntry = {
    ...queueDrawForP1(),
    id: toQueueEntryId("queue-entry-direct-optional-draw-upto"),
    timingWindowId: toTimingWindowId("timing-window-direct-optional-draw-upto"),
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    sourceSnapshot: toSourceSnapshot(source, p1, p1),
    effectBlockId: effect.id,
    sourcePresencePolicy: must(
      effect.sourcePresencePolicy,
      "drawUpTo source presence policy",
    ),
    queuedAtStateSeq: toStateSeq(state.seq),
  };
  state.effectQueue = [entry];

  const paused = processEffectRuntime(state);
  const optionalDecision = must(
    paused.state.pendingDecision,
    "optional decision",
  );
  assert.equal(paused.errors, undefined);
  assert.equal(optionalDecision.type, "chooseOptionalActivation");

  const accepted = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: optionalDecision.id,
    response: { type: "optionalActivation", choice: "activate" },
  });
  const quantityDecision = must(
    accepted.state.pendingDecision,
    "quantity decision",
  );

  assert.equal(accepted.errors, undefined);
  assert.equal(quantityDecision.type, "chooseQuantity");
  assert.deepEqual(quantityDecision.causedBy, {
    type: "effect",
    queueEntryId: entry.id,
    effectId: entry.effectBlockId,
  });
  assert.deepEqual(
    accepted.events.map((event) => event.type),
    ["decisionResolved", "decisionCreated"],
  );
});
