import assert from "node:assert/strict";
import { test } from "vitest";

import { allTriggerQueueCapabilities } from "@optcg/engine-core";

test("behavior probe has a declared scenario for every probed trigger capability", () => {
  const missing = allTriggerQueueCapabilities
    .filter((capability) => capability.router !== "unsupported")
    .filter((capability) => capability.behaviorProbeScenario === undefined)
    .map((capability) => capability.triggerType);

  assert.deepEqual(missing, ["effectResolved"]);
});
