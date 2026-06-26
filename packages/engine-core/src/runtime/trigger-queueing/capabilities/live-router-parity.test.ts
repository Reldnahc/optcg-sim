import assert from "node:assert/strict";
import { test } from "vitest";

import {
  allTriggerQueueCapabilities,
  triggerQueueCapabilityForType,
} from "./registry.js";

test("all generic event reaction capabilities declare runtime events", () => {
  const missing = allTriggerQueueCapabilities
    .filter((capability) => capability.router === "genericEventReaction")
    .filter((capability) => capability.runtimeEventTypes.length === 0)
    .map((capability) => capability.triggerType);

  assert.deepEqual(missing, []);
});

test("specialized routers are explicit and cannot accidentally become generic", () => {
  assert.equal(
    triggerQueueCapabilityForType("handTrashedByEffect")?.router,
    "specializedHandTrash",
  );
  assert.equal(
    triggerQueueCapabilityForType("opponentActivated")?.router,
    "specializedOpponentActivation",
  );
  assert.equal(
    triggerQueueCapabilityForType("onOpponentAttack")?.router,
    "specializedAttack",
  );
  assert.equal(
    triggerQueueCapabilityForType("onKO")?.router,
    "specializedBattleKo",
  );
});

test("event-count wrappers inherit routing from their child trigger in support code", () => {
  assert.equal(triggerQueueCapabilityForType("eventCount"), undefined);
});
