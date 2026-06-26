import assert from "node:assert/strict";
import { test } from "vitest";

import { autoRuntimeEntryAdapterForTriggerType } from "../../effect-runtime-entry-adapters.js";
import {
  allTriggerQueueCapabilities,
  triggerQueueCapabilityForType,
} from "./capabilities/registry.js";
import {
  autoEventReactionTriggerTypes,
  isAutoEventReactionRuntimeEventType,
} from "./event-reaction-events.js";

test("auto runtime entry adapters are backed by trigger capabilities", () => {
  for (const capability of allTriggerQueueCapabilities) {
    const adapter = autoRuntimeEntryAdapterForTriggerType(
      capability.triggerType,
    );
    assert.notEqual(adapter, undefined, capability.triggerType);
    assert.deepEqual(
      adapter?.sourcePresencePolicies,
      capability.sourcePresencePolicies,
    );
  }
});

test("generic event reaction registry is derived from generic capabilities", () => {
  const generic = allTriggerQueueCapabilities.filter(
    (capability) => capability.router === "genericEventReaction",
  );
  assert.deepEqual(
    autoEventReactionTriggerTypes,
    generic.map((capability) => capability.triggerType),
  );

  for (const eventType of generic.flatMap(
    (capability) => capability.runtimeEventTypes,
  )) {
    assert.equal(isAutoEventReactionRuntimeEventType(eventType), true);
  }
});

test("specialized trigger families stay out of generic event reaction registry", () => {
  const genericTriggerTypes =
    autoEventReactionTriggerTypes as readonly string[];
  assert.equal(genericTriggerTypes.includes("handTrashedByEffect"), false);
  assert.equal(genericTriggerTypes.includes("onOpponentAttack"), false);
  assert.equal(
    triggerQueueCapabilityForType("handTrashedByEffect")?.router,
    "specializedHandTrash",
  );
});
