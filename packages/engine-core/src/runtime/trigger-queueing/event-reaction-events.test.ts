import assert from "node:assert/strict";
import { test } from "vitest";

import {
  autoEventReactionTriggerTypes,
  isAutoEventReactionRuntimeEventType,
  isAutoEventReactionTimingWindowId,
  isSupportedAutoEventReactionTriggerType,
} from "./event-reaction-events.js";

test("auto event reaction capabilities share one trigger family registry", () => {
  assert.equal(isSupportedAutoEventReactionTriggerType("lifeRemoved"), true);
  assert.equal(isSupportedAutoEventReactionTriggerType("fieldRemoved"), true);
  assert.equal(
    isSupportedAutoEventReactionTriggerType("onOpponentAttack"),
    false,
  );

  assert.equal(
    isAutoEventReactionTimingWindowId("timing-window:event:1:lifeRemoved"),
    true,
  );
  assert.equal(
    isAutoEventReactionTimingWindowId("timing-window:event:1:onOpponentAttack"),
    false,
  );

  assert.equal(isAutoEventReactionRuntimeEventType("cardMoved"), true);
  assert.equal(isAutoEventReactionRuntimeEventType("blockerActivated"), false);
  assert.equal(autoEventReactionTriggerTypes.includes("lifeRemoved"), true);
});
