import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { planInteractionSoundIntent } from "./interaction-sound-planner.js";

describe("interaction sound planner", () => {
  test("maps local interaction kinds to cue intents", () => {
    assert.deepEqual(planInteractionSoundIntent("emptyClick", "board"), [
      { id: "sound:interaction:emptyClick:board", cue: "emptyClick" },
    ]);
    assert.deepEqual(planInteractionSoundIntent("invalidClick", "hand"), [
      { id: "sound:interaction:invalidClick:hand", cue: "invalidClick" },
    ]);
    assert.deepEqual(planInteractionSoundIntent("select", "card-1"), [
      { id: "sound:interaction:select:card-1", cue: "select" },
    ]);
    assert.deepEqual(planInteractionSoundIntent("confirm", "modal"), [
      { id: "sound:interaction:confirm:modal", cue: "confirm" },
    ]);
  });
});
