import assert from "node:assert/strict";
import { test } from "vitest";

import type { SpotlightEntryCreatedPayload } from "@optcg/types";

import { applyAction } from "../actions.js";
import { must, p2 } from "../action-test-fixtures.js";
import {
  cardRef,
  setupOpenedCounterStepPassDecision,
} from "./test-fixtures.js";

test("Character Counter authors a counter spotlight anchored to counterUsed", () => {
  const { opened, counterCard } = setupOpenedCounterStepPassDecision();
  const target = must(opened.state.battle, "battle").currentTarget;

  const result = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterCard.instanceId,
    target,
  });

  assert.equal(result.errors, undefined);
  const counterUsedIndex = result.events.findIndex(
    (event) => event.type === "counterUsed",
  );
  assert.notEqual(counterUsedIndex, -1);
  assert.equal(
    result.events[counterUsedIndex + 1]?.type,
    "spotlightEntryCreated",
  );
  const counterUsed = must(
    result.events[counterUsedIndex],
    "counterUsed event",
  );
  const counterSpotlights = result.events.filter(
    (event) => event.type === "spotlightEntryCreated",
  );
  assert.equal(counterSpotlights.length, 1);
  const payload = must(counterSpotlights[0], "counter spotlight")
    .payload as SpotlightEntryCreatedPayload;
  assert.deepEqual(payload.entry, {
    kind: "combat",
    id: `spotlight:combat:${String(counterUsed.id)}:counterUsed`,
    key: `spotlight:combat:${String(counterUsed.id)}:counterUsed`,
    semanticKey: [
      "combat",
      "counterUsed",
      String(counterCard.controller),
      String(counterCard.instanceId),
      String(target.playerId),
      String(target.instanceId),
    ].join("|"),
    mode: "resolved",
    status: "resolved",
    combat: {
      eventKind: "counterUsed",
      source: cardRef(counterCard, p2),
      target,
      counterPower: 1000,
    },
    resolvedEventId: counterUsed.id,
  });
  assert.deepEqual(payload.disclosure?.entryRefs, [
    {
      role: "combatSource",
      cardInstanceId: counterCard.instanceId,
      visibility: { type: "public" },
    },
    {
      role: "combatTarget",
      cardInstanceId: target.instanceId,
      visibility: { type: "public" },
    },
  ]);
});
