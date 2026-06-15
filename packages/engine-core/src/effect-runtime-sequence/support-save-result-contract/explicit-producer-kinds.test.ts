import { test } from "vitest";
import type { SelectionId, SelectionSetId } from "@optcg/types";

import {
  assertSupported,
  assertUnsupported,
  revealAndSelectFromSet,
  selectCharacterTarget,
  selectCostAreaDonCards,
  selectCostAreaDonTargets,
  selectHand,
  selectTrash,
  withSaveResultKinds,
} from "./helpers.js";

test("explicit save-result metadata accepts every valid producer kind", () => {
  const hand = "saved-result:explicit-hand" as SelectionId;
  const trash = "saved-result:explicit-trash" as SelectionId;
  const donCards = "saved-result:explicit-don-cards" as SelectionId;
  const donTargets = "saved-result:explicit-don-targets" as SelectionId;
  const target = "saved-result:explicit-target" as SelectionId;
  const set = "saved-result:explicit-set" as SelectionSetId;
  const setSelection = "saved-result:explicit-set-selection" as SelectionId;
  const chosen = "saved-result:explicit-number" as SelectionId;
  const revealSet = revealAndSelectFromSet(set, setSelection)[0];
  if (revealSet === undefined) throw new Error("missing reveal segment");

  assertSupported([
    withSaveResultKinds(selectHand(hand), ["selectedCards:hand"]),
    withSaveResultKinds(selectTrash(trash), ["selectedCards:trash"]),
    withSaveResultKinds(selectCostAreaDonCards(donCards), [
      "selectedCards:don",
    ]),
    withSaveResultKinds(selectCostAreaDonTargets(donTargets), [
      "selectedTargets",
      "selectedCards:don",
    ]),
    withSaveResultKinds(selectCharacterTarget(target), ["selectedTargets"]),
    withSaveResultKinds(revealSet, ["selectedCards:set"]),
    {
      connector: "always",
      saveResultAs: "saved-result:explicit-paid-cost",
      saveResultKinds: ["paidCost"],
      effect: {
        type: "payCost",
        cost: { type: "restDon", count: 1, optional: true },
      },
    },
    {
      connector: "always",
      saveResultAs: "saved-result:explicit-draw",
      saveResultKinds: ["producedObjects"],
      effect: { type: "draw", player: "self", count: 1 },
    },
    {
      connector: "always",
      effect: {
        type: "chooseNumber",
        chooser: "self",
        purpose: "cost",
        min: 0,
        max: 10,
        saveAs: chosen,
      },
      saveResultKinds: ["chosenNumber"],
    },
  ]);
});

test("explicit save-result metadata rejects mismatched producer kinds", () => {
  const hand = "saved-result:explicit-wrong-hand" as SelectionId;
  const donTargets = "saved-result:explicit-wrong-don-targets" as SelectionId;

  assertUnsupported([
    withSaveResultKinds(selectCostAreaDonTargets(donTargets), [
      "selectedCards:don",
    ]),
  ]);
  assertUnsupported([
    withSaveResultKinds(selectCostAreaDonTargets(donTargets), [
      "selectedTargets",
    ]),
  ]);
  assertUnsupported([
    withSaveResultKinds(selectHand(hand), ["selectedCards:don"]),
  ]);
  assertUnsupported([
    withSaveResultKinds(selectHand(hand), ["selectedTargets"]),
  ]);
  assertUnsupported([
    withSaveResultKinds(
      {
        connector: "always",
        saveResultAs: "saved-result:explicit-draw-paid",
        effect: { type: "draw", player: "self", count: 1 },
      },
      ["paidCost"],
    ),
  ]);
  assertUnsupported([
    withSaveResultKinds(
      {
        connector: "always",
        saveResultAs: "saved-result:explicit-cost-produced",
        effect: {
          type: "payCost",
          cost: { type: "restDon", count: 1, optional: true },
        },
      },
      ["producedObjects"],
    ),
  ]);
  assertUnsupported([withSaveResultKinds(selectHand(hand), ["chosenNumber"])]);
});
