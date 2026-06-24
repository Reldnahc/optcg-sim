import assert from "node:assert/strict";
import { test } from "vitest";

import type { SpotlightEntryCreatedPayload, Trigger } from "@optcg/types";

import type { EffectQueueEntry } from "./test-support.js";
import {
  must,
  p2,
  processEffectRuntime,
  queueingState,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  setupOnPlayDefinition,
  toCardId,
  toInstanceId,
} from "./test-support.js";

const expectedEffectResolvedPayload = (
  entry: EffectQueueEntry,
  entryPoint: Trigger,
  sourceCategory = entry.sourceSnapshot.category,
): unknown => ({
  queueEntryId: entry.id,
  timingWindowId: entry.timingWindowId,
  generation: entry.generation,
  effectBlockId: entry.effectBlockId,
  ...(entry.triggerEventId === undefined
    ? {}
    : { triggerEventId: entry.triggerEventId }),
  sourcePresencePolicy: entry.sourcePresencePolicy,
  orderingGroup: entry.orderingGroup,
  controllerId: entry.controllerId,
  source: entry.source,
  sourceCardId: entry.sourceSnapshot.cardId,
  effectCategory: "auto",
  entryPoint,
  sourceTypes: [],
  sourceCategory,
  ...(entry.presentation === undefined
    ? {}
    : { presentation: entry.presentation }),
  status: "resolved",
});

test("preserves queued effect presentation on no-choice effectResolved events", () => {
  const { state, played } = queueingState();
  const supportCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  setupOnPlayDefinition(
    state,
    played,
    reviewedOnPlayDrawDefinition(played.cardId, supportCard.support),
    "def-queue-resolve-presentation",
  );
  const queued = processEffectRuntime(state);
  const queuedEntry = must(queued.state.effectQueue[0], "queued entry");
  const presentation = {
    source: queuedEntry.source,
    textKind: "effect" as const,
    activeSpanIds: ["span:body:draw" as const],
    targetLinks: [
      {
        spanId: "span:body:draw" as const,
        relation: "selectedTarget" as const,
        cards: [
          {
            playerId: p2,
            instanceId: toInstanceId("private-target-link"),
            cardId: toCardId("OP00-PRIVATE"),
            zone: {
              zone: "hand" as const,
              playerId: p2,
              slot: "hand" as const,
            },
          },
        ],
      },
    ],
  };
  const queuedState = {
    ...queued.state,
    effectQueue: [
      {
        ...queuedEntry,
        presentation,
      },
    ],
  };

  const result = processEffectRuntime(queuedState);
  const resolvedEvent = must(
    result.events.find((event) => event.type === "effectResolved"),
    "effectResolved event",
  );
  const spotlightEvent = must(
    result.events.find((event) => event.type === "spotlightEntryCreated"),
    "spotlightEntryCreated event",
  );
  const spotlightPayload =
    spotlightEvent.payload as SpotlightEntryCreatedPayload;

  assert.deepEqual(
    resolvedEvent.payload,
    expectedEffectResolvedPayload(
      { ...queuedEntry, presentation },
      { type: "onPlay" },
    ),
  );
  assert.equal(spotlightPayload.entry.mode, "resolved");
  assert.equal(spotlightPayload.entry.status, "resolved");
  assert.equal(spotlightPayload.entry.resolvedEventId, resolvedEvent.id);
  assert.deepEqual(
    spotlightPayload.entry.kind === undefined ||
      spotlightPayload.entry.kind === "effectText"
      ? spotlightPayload.entry.active
      : undefined,
    presentation,
  );
  assert.deepEqual(spotlightPayload.disclosure?.entryRefs, [
    {
      role: "effectSource",
      cardInstanceId: queuedEntry.source.instanceId,
      visibility: { type: "public" },
    },
  ]);
  assert.deepEqual(spotlightPayload.disclosure.targetLinks, [
    {
      spanId: "span:body:draw",
      relation: "selectedTarget",
      cardInstanceId: toInstanceId("private-target-link"),
      visibility: { type: "private", playerId: p2 },
    },
  ]);
});
