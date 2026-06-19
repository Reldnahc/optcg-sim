import { test } from "vitest";
import type { SelectionId, SelectionSetId } from "@optcg/types";

import {
  assertSupported,
  assertUnsupported,
  revealAndSelectFromSet,
  savedLeaderOrCharacterTarget,
  selectCostAreaDonCards,
  selectCostAreaDonTargets,
  selectDeck,
  selectHand,
  selectHandOrTrash,
  selectLeaderTarget,
  selectTrash,
} from "./helpers.js";

test("selectedCards matrix accepts hand selection moved from hand", () => {
  const selection = "saved-result:hand-move" as SelectionId;

  assertSupported([
    selectHand(selection),
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: "hand",
        to: "deck",
        position: "bottom",
      },
    },
  ]);
});

test("selectedCards matrix accepts trash selection moved from trash", () => {
  const selection = "saved-result:trash-move" as SelectionId;

  assertSupported([
    selectTrash(selection),
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: "trash",
        to: "deck",
        position: "bottom",
      },
    },
  ]);
});

test("selectedCards matrix accepts selected DON cards attached to a saved field target", () => {
  const donSelection = "saved-result:don-cards" as SelectionId;
  const targetSelection = "saved-result:don-target" as SelectionId;

  assertSupported([
    selectCostAreaDonCards(donSelection),
    selectLeaderTarget(targetSelection),
    {
      connector: "then",
      effect: {
        type: "attachSelectedDon",
        selection: donSelection,
        target: savedLeaderOrCharacterTarget(targetSelection),
      },
    },
  ]);
});

test("selectedCards matrix accepts cost-area DON targets as attachable selected DON", () => {
  const donSelection = "saved-result:don-targets" as SelectionId;
  const targetSelection = "saved-result:leader-target" as SelectionId;

  assertSupported([
    selectCostAreaDonTargets(donSelection),
    selectLeaderTarget(targetSelection),
    {
      connector: "then",
      effect: {
        type: "attachSelectedDon",
        selection: donSelection,
        target: savedLeaderOrCharacterTarget(targetSelection),
      },
    },
  ]);
});

test("selectedCards matrix preserves selectedTargets capability on cost-area DON targets", () => {
  const donSelection = "saved-result:don-targets-dual" as SelectionId;

  assertSupported([
    selectCostAreaDonTargets(donSelection),
    {
      connector: "then",
      effect: {
        type: "activate",
        target: {
          type: "savedFieldObject",
          binding: {
            family: "selectedTargets",
            saveResultAs: donSelection,
          },
          zone: "costArea",
          player: "self",
          visibility: "publicOnly",
          onFailure: "failClosed",
        },
      },
    },
  ]);
});

test("selectedCards matrix accepts revealed set selection played from set", () => {
  const set = "saved-result:set-play" as SelectionSetId;
  const selection = "saved-result:set-play-selection" as SelectionId;

  assertSupported([
    ...revealAndSelectFromSet(set, selection),
    {
      connector: "then",
      effect: {
        type: "playSelected",
        selection,
        ignoreCost: true,
      },
    },
  ]);
});

test("selectedCards matrix accepts hand selection played from hand", () => {
  const selection = "saved-result:hand-play" as SelectionId;

  assertSupported([
    selectHand(selection),
    {
      connector: "then",
      effect: {
        type: "playSelected",
        selection,
        ignoreCost: true,
      },
    },
  ]);
});

test("selectedCards matrix accepts trash selection played from trash", () => {
  const selection = "saved-result:trash-play" as SelectionId;

  assertSupported([
    selectTrash(selection),
    {
      connector: "then",
      effect: {
        type: "playSelected",
        selection,
        ignoreCost: true,
      },
    },
  ]);
});

test("selectedCards matrix rejects DON selection played as a card", () => {
  const selection = "saved-result:don-play-rejected" as SelectionId;

  assertUnsupported([
    selectCostAreaDonCards(selection),
    {
      connector: "then",
      effect: {
        type: "playSelected",
        selection,
        ignoreCost: true,
      },
    },
  ]);
});

test("selectedCards matrix accepts hand selection activated as event", () => {
  const selection = "saved-result:hand-event" as SelectionId;

  assertSupported([
    selectHand(selection),
    {
      connector: "then",
      effect: {
        type: "activateSelectedEvent",
        selection,
        trigger: { type: "main" },
        ignoreCost: true,
      },
    },
  ]);
});

test("selectedCards matrix accepts trash selection activated as event when source zone is declared", () => {
  const selection = "saved-result:trash-event" as SelectionId;

  assertSupported([
    selectTrash(selection),
    {
      connector: "then",
      effect: {
        type: "activateSelectedEvent",
        selection,
        sourceZone: "trash",
        trigger: { type: "main" },
        ignoreCost: true,
      },
    },
  ]);
});

test("selectedCards matrix accepts hand selection reveal", () => {
  const selection = "saved-result:hand-reveal" as SelectionId;

  assertSupported([
    selectHand(selection),
    {
      connector: "then",
      effect: {
        type: "revealSelected",
        selection,
        visibility: "bothPlayers",
      },
    },
  ]);
});

test("selectedCards matrix accepts set selection reveal", () => {
  const set = "saved-result:set-reveal" as SelectionSetId;
  const selection = "saved-result:set-reveal-selection" as SelectionId;

  assertSupported([
    ...revealAndSelectFromSet(set, selection),
    {
      connector: "then",
      effect: {
        type: "revealSelected",
        selection,
        visibility: "bothPlayers",
      },
    },
  ]);
});

test("selectedCards matrix accepts trash selection moved to hand", () => {
  const selection = "saved-result:trash-to-hand" as SelectionId;

  assertSupported([
    selectTrash(selection),
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: "trash",
        to: "hand",
      },
    },
  ]);
});

test("selectedCards matrix accepts revealed deck selection moved to hand", () => {
  const selection = "saved-result:deck-to-hand" as SelectionId;

  assertSupported([
    selectDeck(selection),
    {
      connector: "then",
      effect: {
        type: "revealSelected",
        selection,
        visibility: "bothPlayers",
      },
    },
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: "deck",
        to: "hand",
      },
    },
  ]);
});

test("selectedCards matrix accepts selectCards saveAs without segment saveResultAs", () => {
  const selection = "saved-result:effect-save-as-trash" as SelectionId;

  assertSupported([
    {
      connector: "always",
      effect: {
        type: "selectCards",
        player: "self",
        zone: "trash",
        chooser: "self",
        visibility: "bothPlayers",
        min: 0,
        max: 1,
        saveAs: selection,
      },
    },
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: "trash",
        to: "hand",
      },
    },
  ]);
});

test("selectedCards matrix accepts trashFromHand saveResultAs as hand selection", () => {
  const selection = "saved-result:trashed-hand-card" as SelectionId;

  assertSupported([
    {
      connector: "always",
      effect: { type: "draw", player: "self", count: 0 },
    },
    {
      connector: "then",
      saveResultAs: selection,
      effect: {
        type: "trashFromHand",
        player: "self",
        chooser: "self",
        count: 1,
      },
    },
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: "hand",
        to: "deck",
        position: "bottom",
      },
    },
  ]);
});

test("selectedCards matrix accepts set selection moved to hand", () => {
  const set = "saved-result:set-to-hand" as SelectionSetId;
  const selection = "saved-result:set-to-hand-selection" as SelectionId;

  assertSupported([
    ...revealAndSelectFromSet(set, selection),
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: set,
        to: "hand",
      },
    },
  ]);
});

test("selectedCards matrix accepts single hand selection moved to life", () => {
  const selection = "saved-result:hand-to-life" as SelectionId;

  assertSupported([
    selectHand(selection),
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: "hand",
        to: "life",
        position: "top",
      },
    },
  ]);
});

test("selectedCards matrix accepts trash selection moved to life", () => {
  const selection = "saved-result:trash-to-life" as SelectionId;

  assertSupported([
    selectTrash(selection),
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: "trash",
        to: "life",
        position: "bottom",
      },
    },
  ]);
});

test("selectedCards matrix accepts hand-or-trash selection moved from current zones to life", () => {
  const selection = "saved-result:hand-or-trash-to-life" as SelectionId;

  assertSupported([
    selectHandOrTrash(selection),
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: "currentZone",
        to: "life",
        position: "top",
        destinationFaceUp: true,
      },
    },
  ]);
});

test("selectedCards matrix accepts set selection moved to life", () => {
  const set = "saved-result:set-to-life" as SelectionSetId;
  const selection = "saved-result:set-to-life-selection" as SelectionId;

  assertSupported([
    ...revealAndSelectFromSet(set, selection),
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: set,
        to: "life",
        position: "bottom",
      },
    },
  ]);
});

test("selectedCards matrix rejects hand selection attached as DON", () => {
  const selection = "saved-result:hand-attach-rejected" as SelectionId;
  const targetSelection = "saved-result:hand-attach-target" as SelectionId;

  assertUnsupported([
    selectHand(selection),
    selectLeaderTarget(targetSelection),
    {
      connector: "then",
      effect: {
        type: "attachSelectedDon",
        selection,
        target: savedLeaderOrCharacterTarget(targetSelection),
      },
    },
  ]);
});

test("selectedCards matrix rejects DON selection moved as a hand card", () => {
  const selection = "saved-result:don-hand-move-rejected" as SelectionId;

  assertUnsupported([
    selectCostAreaDonCards(selection),
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: "hand",
        to: "deck",
        position: "bottom",
      },
    },
  ]);
});

test("selectedCards matrix rejects hand selection moved to hand", () => {
  const selection = "saved-result:hand-to-hand-rejected" as SelectionId;

  assertUnsupported([
    selectHand(selection),
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: "hand",
        to: "hand",
      },
    },
  ]);
});

test("selectedCards matrix rejects multi-card hand selection moved to life", () => {
  const selection = "saved-result:hand-to-life-multi-rejected" as SelectionId;

  assertUnsupported([
    selectHand(selection, 2),
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: "hand",
        to: "life",
        position: "top",
      },
    },
  ]);
});

test("selectedCards matrix rejects trash selection moved through hand-to-life path", () => {
  const selection = "saved-result:trash-hand-life-rejected" as SelectionId;

  assertUnsupported([
    selectTrash(selection),
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: "hand",
        to: "life",
        position: "top",
      },
    },
  ]);
});

test("selectedCards matrix rejects hand selection moved through trash-to-life path", () => {
  const selection = "saved-result:hand-trash-life-rejected" as SelectionId;

  assertUnsupported([
    selectHand(selection),
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: "trash",
        to: "life",
        position: "bottom",
      },
    },
  ]);
});

test("selectedCards matrix rejects hand-or-trash selection moved through hand-only path", () => {
  const selection =
    "saved-result:hand-or-trash-hand-life-rejected" as SelectionId;

  assertUnsupported([
    selectHandOrTrash(selection),
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: "hand",
        to: "life",
        position: "top",
      },
    },
  ]);
});

test("selectedCards matrix rejects missing selectedCards reference", () => {
  assertUnsupported([
    {
      connector: "always",
      effect: {
        type: "moveSelected",
        selection: "saved-result:missing-selection" as SelectionId,
        from: "trash",
        to: "hand",
      },
    },
  ]);
});
