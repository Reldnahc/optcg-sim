import assert from "node:assert/strict";
import { test } from "vitest";

import { applyAction } from "../../actions.js";
import {
  installActivateMainDrawDefinition,
  makeMainPhaseLegalActionState,
  toCardId,
  toEffectId,
} from "../../action-dispatcher-test-support.js";
import { must, p1 } from "../../action-test-fixtures.js";

test("live activate main action preserves omitted state hash", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const effectId = toEffectId("activate-main-live-options");
  installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-live-options",
    effectId,
  });

  const result = applyAction(
    state,
    {
      type: "activateEffect",
      source: {
        instanceId: leader.instanceId,
        cardId: leader.cardId,
        playerId: p1,
        zone: leader.zone,
      },
      effectId,
    },
    {
      includeStateHash: false,
      validateInvariants: false,
    },
  );

  assert.equal(result.errors, undefined);
  assert.equal(result.stateHash, "");
});
