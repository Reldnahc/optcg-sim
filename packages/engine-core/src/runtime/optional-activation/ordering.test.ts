import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  EffectDefinition,
  EffectQueueEntry,
  EngineEvent,
  ResolvedCard,
} from "@optcg/types";

import { hashCanonicalStateValue } from "../../canonical-state.js";
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
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toStateSeq,
  toTimingWindowId,
} from "../../effect-runtime-queue/test-support.js";

const installDefinition = (
  state: ReturnType<typeof createActiveState>,
  card: CardInstance,
  definition: EffectDefinition,
  category: ResolvedCard["category"] = "character",
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
    ...(category === "leader" || category === "character"
      ? { power: 5000 }
      : {}),
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: definition.metadata.rulesVersion,
      sourceTextHash: definition.metadata.sourceTextHash,
    },
  });
};

const optionalThenRequiredDrawState = (): {
  state: ReturnType<typeof createActiveState>;
  optionalEntry: EffectQueueEntry;
  requiredEntry: EffectQueueEntry;
} => {
  const state = createActiveState();
  addExtraDeckCard(state, p1);
  addExtraDeckCard(state, p1);
  const p1State = must(state.players[p1], "p1");
  const source = p1State.leader;
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base draw effect");
  const optionalEffect = {
    ...baseEffect,
    id: toEffectId("optional-decline-effect"),
    optional: true,
  };
  const requiredEffect = {
    ...baseEffect,
    id: toEffectId("required-followup-effect"),
  };
  installDefinition(
    state,
    source,
    {
      ...base,
      effects: [optionalEffect, requiredEffect],
    },
    "leader",
    "def-optional-decline",
  );

  const common = {
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    sourceSnapshot: toSourceSnapshot(source, p1, p1),
    sourcePresencePolicy: must(
      baseEffect.sourcePresencePolicy,
      "source presence policy",
    ),
    queuedAtStateSeq: toStateSeq(state.seq),
  } satisfies Pick<
    EffectQueueEntry,
    "source" | "sourceSnapshot" | "sourcePresencePolicy" | "queuedAtStateSeq"
  >;
  const optionalEntry: EffectQueueEntry = {
    ...queueDrawForP1(),
    ...common,
    id: toQueueEntryId("queue-entry-optional-decline"),
    timingWindowId: toTimingWindowId("timing-window-optional-decline"),
    generation: 0,
    effectBlockId: optionalEffect.id,
    createdAtEventSeq: 1,
  };
  const requiredEntry: EffectQueueEntry = {
    ...queueDrawForP1(),
    ...common,
    id: toQueueEntryId("queue-entry-required-after-decline"),
    timingWindowId: optionalEntry.timingWindowId,
    generation: 1,
    effectBlockId: requiredEffect.id,
    createdAtEventSeq: 2,
  };
  state.effectQueue = [optionalEntry, requiredEntry];
  return { state, optionalEntry, requiredEntry };
};

const eventPayloadHasQueueEntryId = (
  event: EngineEvent,
  queueEntryId: EffectQueueEntry["id"],
): boolean =>
  typeof event.payload === "object" &&
  event.payload !== null &&
  "queueEntryId" in event.payload &&
  event.payload.queueEntryId === queueEntryId;

test("optional activation decline asks again when multiple triggers remain in the group", () => {
  const { state, optionalEntry, requiredEntry } =
    optionalThenRequiredDrawState();
  const sameGroupRequiredEntryOne: EffectQueueEntry = {
    ...requiredEntry,
    id: toQueueEntryId("queue-entry-required-after-decline-one"),
    generation: optionalEntry.generation,
    createdAtEventSeq: optionalEntry.createdAtEventSeq + 1,
  };
  const sameGroupRequiredEntryTwo: EffectQueueEntry = {
    ...requiredEntry,
    id: toQueueEntryId("queue-entry-required-after-decline-two"),
    generation: optionalEntry.generation,
    createdAtEventSeq: optionalEntry.createdAtEventSeq + 2,
  };
  state.effectQueue = [
    optionalEntry,
    sameGroupRequiredEntryOne,
    sameGroupRequiredEntryTwo,
  ];

  const ordered = processEffectRuntime(state);
  const triggerOrderDecision = must(
    ordered.state.pendingDecision,
    "trigger order decision",
  );
  assert.equal(triggerOrderDecision.type, "chooseTriggerOrder");

  const orderedOptionalFirst = applyAction(ordered.state, {
    type: "respondToDecision",
    decisionId: triggerOrderDecision.id,
    response: {
      type: "orderedIds",
      ids: [optionalEntry.id],
    },
  });
  const optionalDecision = must(
    orderedOptionalFirst.state.pendingDecision,
    "optional decision",
  );
  assert.equal(optionalDecision.type, "chooseOptionalActivation");

  const declined = applyAction(orderedOptionalFirst.state, {
    type: "respondToDecision",
    decisionId: optionalDecision.id,
    response: { type: "optionalActivation", choice: "decline" },
  });

  assert.equal(declined.errors, undefined);
  const nextDecision = must(
    declined.state.pendingDecision,
    "next trigger order decision",
  );
  assert.equal(nextDecision.type, "chooseTriggerOrder");
  assert.deepEqual(nextDecision.triggerIds, [
    sameGroupRequiredEntryOne.id,
    sameGroupRequiredEntryTwo.id,
  ]);
  assert.deepEqual(
    declined.state.effectQueue.map((entry) => entry.id),
    [sameGroupRequiredEntryOne.id, sameGroupRequiredEntryTwo.id],
  );
  const resolvedIds = declined.events
    .filter(
      (event): event is EngineEvent & { type: "effectResolved" } =>
        event.type === "effectResolved",
    )
    .map((event) =>
      eventPayloadHasQueueEntryId(event, sameGroupRequiredEntryOne.id)
        ? sameGroupRequiredEntryOne.id
        : eventPayloadHasQueueEntryId(event, sameGroupRequiredEntryTwo.id)
          ? sameGroupRequiredEntryTwo.id
          : undefined,
    )
    .filter((id): id is EffectQueueEntry["id"] => id !== undefined);
  assert.deepEqual(resolvedIds, []);
  assert.equal(declined.stateHash, hashCanonicalStateValue(declined.state));
});
