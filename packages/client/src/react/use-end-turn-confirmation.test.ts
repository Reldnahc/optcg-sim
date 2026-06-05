import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type { ClientActionModel } from "../view-model.js";
import {
  endTurnConfirmationActions,
  endTurnConfirmationTimeoutMs,
  isEndTurnAction,
} from "./use-end-turn-confirmation.js";

describe("end turn confirmation", () => {
  const endTurnAction: ClientActionModel = {
    index: 4,
    type: "endMainPhase",
    label: "End turn",
  };

  test("identifies engine end-main actions as end turn actions", () => {
    assert.equal(isEndTurnAction(endTurnAction), true);
    assert.equal(
      isEndTurnAction({ index: 5, type: "playCard", label: "Play" }),
      false,
    );
  });

  test("relabels only end turn while confirmation is armed", () => {
    const actions = endTurnConfirmationActions(
      [{ index: 3, type: "playCard", label: "Play" }, endTurnAction],
      true,
    );

    assert.deepEqual(actions, [
      { index: 3, type: "playCard", label: "Play" },
      { index: 4, type: "endMainPhase", label: "Confirm end turn" },
    ]);
  });

  test("uses the same short confirmation window as concede", () => {
    assert.equal(endTurnConfirmationTimeoutMs, 3000);
  });
});
