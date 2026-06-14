import assert from "node:assert/strict";
import { test } from "vitest";

import { applyAction, getLegalActions } from "../../actions.js";
import {
  installActivateMainDrawDefinition,
  makeMainPhaseLegalActionState,
  toCardId,
  toEffectId,
} from "../../action-dispatcher-test-support.js";
import { must, p1 } from "../../action-test-fixtures.js";

test("activate main suppresses and rejects unpayable initial source-rest costs", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const character = must(p1State.characters[0], "character");
  character.state = "rested";
  const effectId = toEffectId("activate-main-character-rest-self-cost");
  const definition = installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(character.cardId),
    category: "character",
    definitionId: "def-activate-main-character-rest-self-cost",
    effectId,
  });
  const effectBlock = must(definition.effects[0], "activate main effect");
  effectBlock.effect = {
    type: "sequence",
    effects: [
      {
        id: "rest-source-cost",
        connector: "always",
        saveResultAs: "paidCost",
        effect: {
          type: "payCost",
          cost: { type: "restSelf", optional: true },
        },
      },
      {
        id: "draw-if-paid",
        connector: "ifYouDo",
        effect: { type: "draw", player: "self", count: 1 },
      },
    ],
  };

  const legal = getLegalActions(state, p1);
  const before = JSON.stringify(state);
  const result = applyAction(state, {
    type: "activateEffect",
    source: {
      instanceId: character.instanceId,
      cardId: character.cardId,
      playerId: p1,
      zone: character.zone,
    },
    effectId,
  });

  assert.equal(
    legal.some(
      (action) =>
        action.type === "activateEffect" &&
        action.source.instanceId === character.instanceId &&
        action.effectId === effectId,
    ),
    false,
  );
  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
});
