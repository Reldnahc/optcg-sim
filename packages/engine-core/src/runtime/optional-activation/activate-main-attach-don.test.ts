import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardFilter, SelectionId } from "@optcg/types";

import { getLegalActions } from "../../actions.js";
import {
  installActivateMainDrawDefinition,
  makeMainPhaseLegalActionState,
  toCardId,
  toEffectId,
} from "../../action-dispatcher-test-support.js";
import { must, p1 } from "../../action-test-fixtures.js";

const installCharacterRestSelfAttachDonDefinition = (params: {
  filter: CardFilter;
  tag: string;
}) => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const character = must(p1State.characters[0], "character");
  const donSelection = `donSelection:${params.tag}` as SelectionId;
  const targetSelection = `targetSelection:${params.tag}`;
  const effectId = toEffectId(
    `activate-main-rest-self-attach-don-${params.tag}`,
  );
  const definition = installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(character.cardId),
    category: "character",
    definitionId: `def-activate-main-rest-self-attach-don-${params.tag}`,
    effectId,
  });
  const effectBlock = must(definition.effects[0], "activate main effect");
  effectBlock.effect = {
    type: "sequence",
    effects: [
      {
        id: "rest-self-cost",
        connector: "always",
        saveResultAs: "paidOptionalCost",
        effect: {
          type: "payCost",
          cost: { type: "restSelf", optional: true },
        },
      },
      {
        id: "select-rested-don-if-paid",
        connector: "ifYouDo",
        saveResultAs: donSelection,
        effect: {
          type: "selectCards",
          zone: "costArea",
          player: "self",
          chooser: "self",
          min: 0,
          max: 2,
          filter: { categories: ["don"], state: "rested" },
          saveAs: donSelection,
          visibility: "bothPlayers",
        },
      },
      {
        id: "select-leader-if-don-selected",
        connector: "ifYouDo",
        saveResultAs: targetSelection,
        effect: {
          type: "selectTargets",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "self",
            zone: "leaderArea",
            min: 1,
            max: 1,
            allowFewerIfUnavailable: false,
            visibility: "public",
            filter: params.filter,
          },
        },
      },
      {
        id: "attach-selected-don",
        connector: "then",
        effect: {
          type: "attachSelectedDon",
          selection: donSelection,
          target: {
            type: "savedFieldObject",
            binding: {
              family: "selectedTargets",
              saveResultAs: targetSelection,
            },
            zone: "leaderArea",
            player: "self",
            visibility: "publicOnly",
            onFailure: "failClosed",
            filter: params.filter,
          },
        },
      },
    ],
  };
  return { character, effectId, state };
};

test("activate main exposes character restSelf costs before reusable attach-DON bodies", () => {
  const { character, effectId, state } =
    installCharacterRestSelfAttachDonDefinition({
      tag: "attribute-leader",
      filter: { categories: ["leader"], attributesAny: ["slash"] },
    });
  const legal = getLegalActions(state, p1);

  assert.equal(
    legal.some(
      (action) =>
        action.type === "activateEffect" &&
        action.source.instanceId === character.instanceId &&
        action.effectId === effectId,
    ),
    true,
  );
});

test("activate main does not expose character restSelf costs for unsupported attach-DON filters", () => {
  const { character, effectId, state } =
    installCharacterRestSelfAttachDonDefinition({
      tag: "unsupported-filter",
      filter: { custom: "unsupported-attach-filter" },
    });
  const legal = getLegalActions(state, p1);

  assert.equal(
    legal.some(
      (action) =>
        action.type === "activateEffect" &&
        action.source.instanceId === character.instanceId &&
        action.effectId === effectId,
    ),
    false,
  );
});
