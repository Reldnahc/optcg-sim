import { test } from "vitest";
import type { SelectionId } from "@optcg/types";

import {
  assertSupported,
  assertUnsupported,
  savedCharacterTarget,
  selectCharacterTarget,
  selectHand,
  selectTrash,
} from "./helpers.js";

test("composition matrix accepts nested sequence selectedCards for later sibling consumer", () => {
  const selection = "saved-result:nested-selected-card" as SelectionId;

  assertSupported([
    {
      connector: "always",
      effect: {
        type: "sequence",
        effects: [selectHand(selection)],
      },
    },
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

test("composition matrix accepts flattened sequence selectedTargets for later sibling consumer", () => {
  const selection = "saved-result:nested-selected-target" as SelectionId;

  assertSupported([
    {
      connector: "always",
      effect: {
        type: "sequence",
        effects: [selectCharacterTarget(selection)],
      },
    },
    {
      connector: "then",
      effect: {
        type: "rest",
        target: savedCharacterTarget(selection),
      },
    },
  ]);
});

test("composition matrix rejects conditional branch-local selectedCards leaking to outer siblings", () => {
  const selection = "saved-result:conditional-branch-card" as SelectionId;

  assertUnsupported([
    {
      connector: "always",
      effect: {
        type: "conditional",
        if: { type: "yourTurn" },
        then: {
          type: "sequence",
          effects: [selectHand(selection)],
        },
      },
    },
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

test("composition matrix accepts choice branches with independent saved references", () => {
  const handSelection = "saved-result:choice-hand-card" as SelectionId;
  const trashSelection = "saved-result:choice-trash-card" as SelectionId;

  assertSupported([
    {
      connector: "always",
      effect: {
        type: "choice",
        chooser: "self",
        min: 0,
        max: 1,
        options: [
          {
            id: "choice:hand",
            effect: {
              type: "sequence",
              effects: [
                selectHand(handSelection),
                {
                  connector: "then",
                  effect: {
                    type: "playSelected",
                    selection: handSelection,
                    ignoreCost: true,
                  },
                },
              ],
            },
          },
          {
            id: "choice:trash",
            effect: {
              type: "sequence",
              effects: [
                selectTrash(trashSelection),
                {
                  connector: "then",
                  effect: {
                    type: "moveSelected",
                    selection: trashSelection,
                    from: "trash",
                    to: "hand",
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ]);
});

test("composition matrix rejects merging saved references across choice branches", () => {
  const selection = "saved-result:choice-branch-card" as SelectionId;

  assertUnsupported([
    {
      connector: "always",
      effect: {
        type: "choice",
        chooser: "self",
        min: 0,
        max: 1,
        options: [
          {
            id: "choice:producer",
            effect: {
              type: "sequence",
              effects: [selectHand(selection)],
            },
          },
          {
            id: "choice:consumer",
            effect: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  effect: {
                    type: "playSelected",
                    selection,
                    ignoreCost: true,
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ]);
});
