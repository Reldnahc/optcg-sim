import assert from "node:assert/strict";
import { test } from "vitest";

import { computeView } from "../../view/compute-view.js";
import {
  continuousPowerEffectRecord,
  createState,
  must,
  p1,
  resolvedCard,
  toCardId,
  withCharacter,
} from "./continuous-test-helpers.js";

test("filtered all modifier applies only to matching cards", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const c0 = withCharacter(p1, toCardId("char-vanilla"), 0);
  const c1 = withCharacter(p1, toCardId("char-rush"), 1);
  p1State.characters = [c0, c1];
  state.cardManifest.cards[toCardId("char-rush")] = {
    ...must(state.cardManifest.cards[toCardId("char-rush")], "rush"),
    power: 4000,
  };
  state.continuousEffects = [
    {
      ...continuousPowerEffectRecord(state),
      id: "filtered-all-power",
      modifier: {
        layer: "powerAdd",
        target: {
          type: "all",
          zone: "characterArea",
          player: "self",
          filter: { power: { op: "eq", value: 4000 } },
        },
        operation: { type: "addPower", value: 1000 },
      },
      duration: { type: "thisTurn" },
    },
  ];
  const view = computeView(state);
  assert.equal(view.cards[c0.instanceId]?.currentPower, 3000);
  assert.equal(view.cards[c1.instanceId]?.currentPower, 5000);
});

test("filtered all modifier respects name exclusions", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const included = withCharacter(p1, toCardId("char-straw-hat"), 0);
  const excluded = withCharacter(p1, toCardId("char-vanilla"), 1);
  p1State.characters = [included, excluded];
  state.cardManifest.cards[toCardId("char-straw-hat")] = resolvedCard({
    cardId: toCardId("char-straw-hat"),
    category: "character",
    cost: 3,
    power: 1000,
    types: ["Example"],
  });
  state.cardManifest.cards[toCardId("char-vanilla")] = resolvedCard({
    cardId: toCardId("char-vanilla"),
    category: "character",
    cost: 3,
    power: 3000,
    types: ["Example"],
  });
  state.continuousEffects = [
    {
      ...continuousPowerEffectRecord(state),
      id: "filtered-all-power-name-not",
      modifier: {
        layer: "powerAdd",
        target: {
          type: "all",
          zone: "characterArea",
          player: "self",
          filter: {
            categories: ["character"],
            typesAny: ["Example"],
            nameNot: ["char-vanilla"],
          },
        },
        operation: { type: "addPower", value: 1000 },
      },
      duration: { type: "thisTurn" },
    },
  ];

  const view = computeView(state);

  assert.equal(view.cards[included.instanceId]?.currentPower, 2000);
  assert.equal(view.cards[excluded.instanceId]?.currentPower, 3000);
});
