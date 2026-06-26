import assert from "node:assert/strict";
import { test } from "vitest";

import type { Trigger } from "@optcg/types";

import {
  allTriggerQueueCapabilities,
  triggerQueueCapabilityForType,
} from "./registry.js";

const supportedTriggerTypes: readonly Trigger["type"][] = [
  "onPlay",
  "whenAttacking",
  "onOpponentAttack",
  "onKO",
  "endOfYourTurn",
  "main",
  "trigger",
  "counter",
  "handTrashedByEffect",
  "opponentActivated",
  "lifeRemoved",
  "damageDealt",
  "fieldRemoved",
  "cardDrawn",
  "cardPlayed",
  "cardRested",
  "donReturned",
  "donAttached",
  "attackDeclared",
  "endOfBattle",
  "onBlock",
  "effectQueued",
  "effectResolved",
  "triggerActivated",
];

test("registry exposes every currently supported queue trigger type once", () => {
  assert.deepEqual(
    allTriggerQueueCapabilities.map((capability) => capability.triggerType),
    supportedTriggerTypes,
  );
  assert.equal(
    new Set(supportedTriggerTypes).size,
    supportedTriggerTypes.length,
  );
});

test("registry lookup returns source policy and router ownership", () => {
  assert.deepEqual(triggerQueueCapabilityForType("cardPlayed"), {
    triggerType: "cardPlayed",
    category: "auto",
    sourcePresencePolicies: ["mustRemainInSameZone"],
    router: "genericEventReaction",
    runtimeEventTypes: ["cardPlayed"],
    behaviorProbeScenario: { kind: "cardPlayed", category: "character" },
  });

  assert.equal(
    triggerQueueCapabilityForType("handTrashedByEffect")?.router,
    "specializedHandTrash",
  );
  assert.equal(
    triggerQueueCapabilityForType("onOpponentAttack")?.router,
    "specializedAttack",
  );
});

test("every implemented trigger capability declares a non-unsupported router", () => {
  for (const capability of allTriggerQueueCapabilities) {
    assert.notEqual(capability.router, "unsupported", capability.triggerType);
    if (capability.router === "genericEventReaction") {
      assert.notEqual(
        capability.runtimeEventTypes.length,
        0,
        capability.triggerType,
      );
    }
  }
});
