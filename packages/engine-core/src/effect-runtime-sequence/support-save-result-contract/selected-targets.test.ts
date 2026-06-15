import { test } from "vitest";
import type { SelectionId } from "@optcg/types";

import {
  assertSupported,
  assertUnsupported,
  savedCharacterTarget,
  selectCharacterTarget,
  selectTrash,
} from "./helpers.js";

test("selectedTargets matrix accepts saved target KO", () => {
  const selection = "saved-result:ko-target" as SelectionId;

  assertSupported([
    selectCharacterTarget(selection),
    {
      connector: "then",
      effect: {
        type: "ko",
        target: savedCharacterTarget(selection),
      },
    },
  ]);
});

test("selectedTargets matrix accepts saved target trash", () => {
  const selection = "saved-result:trash-target" as SelectionId;

  assertSupported([
    selectCharacterTarget(selection),
    {
      connector: "then",
      effect: {
        type: "trash",
        target: savedCharacterTarget(selection),
      },
    },
  ]);
});

test("selectedTargets matrix accepts saved target bounce", () => {
  const selection = "saved-result:bounce-target" as SelectionId;

  assertSupported([
    selectCharacterTarget(selection),
    {
      connector: "then",
      effect: {
        type: "bounce",
        target: savedCharacterTarget(selection),
        destination: "hand",
      },
    },
  ]);
});

test("selectedTargets matrix accepts saved target rest", () => {
  const selection = "saved-result:rest-target" as SelectionId;

  assertSupported([
    selectCharacterTarget(selection),
    {
      connector: "then",
      effect: {
        type: "rest",
        target: savedCharacterTarget(selection),
      },
    },
  ]);
});

test("selectedTargets matrix accepts saved target activation", () => {
  const selection = "saved-result:activate-target" as SelectionId;

  assertSupported([
    selectCharacterTarget(selection),
    {
      connector: "then",
      effect: {
        type: "activate",
        target: savedCharacterTarget(selection),
      },
    },
  ]);
});

test("selectedTargets matrix accepts saved target attack redirection", () => {
  const selection = "saved-result:attack-target" as SelectionId;

  assertSupported([
    selectCharacterTarget(selection),
    {
      connector: "then",
      effect: {
        type: "changeAttackTarget",
        target: savedCharacterTarget(selection),
      },
    },
  ]);
});

test("selectedTargets matrix accepts saved target power modification", () => {
  const selection = "saved-result:power-target" as SelectionId;

  assertSupported([
    selectCharacterTarget(selection),
    {
      connector: "then",
      effect: {
        type: "modifyPower",
        target: savedCharacterTarget(selection),
        value: 2000,
        duration: { type: "thisTurn" },
      },
    },
  ]);
});

test("selectedTargets matrix accepts saved target cost modification", () => {
  const selection = "saved-result:cost-target" as SelectionId;

  assertSupported([
    selectCharacterTarget(selection),
    {
      connector: "then",
      effect: {
        type: "modifyCost",
        player: "self",
        target: savedCharacterTarget(selection),
        value: -1,
        duration: { type: "thisTurn" },
      },
    },
  ]);
});

test("selectedTargets matrix accepts saved target base power set", () => {
  const selection = "saved-result:base-power-target" as SelectionId;

  assertSupported([
    selectCharacterTarget(selection),
    {
      connector: "then",
      effect: {
        type: "setBasePower",
        target: savedCharacterTarget(selection),
        value: 7000,
        duration: { type: "thisTurn" },
      },
    },
  ]);
});

test("selectedTargets matrix accepts selectAllTargets feeding forEachSavedTarget", () => {
  const selection = "saved-result:all-targets" as SelectionId;
  const current = "saved-result:current-target";

  assertSupported([
    {
      connector: "always",
      saveResultAs: selection,
      effect: {
        type: "selectAllTargets",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "opponent",
          zone: "characterArea",
          filter: { categories: ["character"] },
          visibility: "public",
        },
      },
    },
    {
      connector: "then",
      effect: {
        type: "forEachSavedTarget",
        selection,
        saveCurrentAs: current,
        effect: {
          type: "rest",
          target: savedCharacterTarget(current, "forEachSavedTarget"),
        },
      },
    },
  ]);
});

test("selectedTargets matrix carries nested sequence producers to later siblings", () => {
  const selection = "saved-result:nested-target" as SelectionId;

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

test("selectedTargets matrix carries double-nested sequence producers to outer nested siblings", () => {
  const selection = "saved-result:double-nested-target" as SelectionId;

  assertSupported([
    {
      connector: "always",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "sequence",
              effects: [
                selectCharacterTarget(selection),
                {
                  connector: "then",
                  effect: {
                    type: "rest",
                    target: savedCharacterTarget(selection),
                  },
                },
              ],
            },
          },
          {
            connector: "then",
            effect: {
              type: "cannotBecomeActive",
              target: savedCharacterTarget(selection),
              duration: { type: "untilStartOfNextTurn", player: "opponent" },
            },
          },
        ],
      },
    },
  ]);
});

test("selectedTargets matrix carries saved targets into conditional branches", () => {
  const selection = "saved-result:conditional-target" as SelectionId;

  assertSupported([
    selectCharacterTarget(selection),
    {
      connector: "then",
      effect: {
        type: "conditional",
        if: { type: "trashCount", player: "self", op: "gte", value: 10 },
        then: {
          type: "modifyPower",
          target: savedCharacterTarget(selection),
          value: 2000,
          duration: { type: "thisTurn" },
        },
      },
    },
  ]);
});

test("selectedTargets matrix accepts selectedCards owner constraints", () => {
  const ownerSelection = "saved-result:owner-card" as SelectionId;
  const targetSelection = "saved-result:owner-target" as SelectionId;

  assertSupported([
    selectTrash(ownerSelection),
    {
      connector: "then",
      saveResultAs: targetSelection,
      effect: {
        type: "selectTargets",
        ownerConstraint: {
          type: "sameAsSavedReferenceOwner",
          selection: ownerSelection,
        },
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "anyPlayer",
          zone: "characterArea",
          filter: { categories: ["character"] },
          min: 0,
          max: 1,
          allowFewerIfUnavailable: true,
          visibility: "public",
        },
      },
    },
  ]);
});

test("selectedTargets matrix accepts selectedTargets owner constraints", () => {
  const ownerSelection = "saved-result:owner-target-source" as SelectionId;
  const targetSelection = "saved-result:owner-target-target" as SelectionId;

  assertSupported([
    selectCharacterTarget(ownerSelection),
    {
      connector: "then",
      saveResultAs: targetSelection,
      effect: {
        type: "selectTargets",
        ownerConstraint: {
          type: "sameAsSavedReferenceOwner",
          selection: ownerSelection,
        },
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "anyPlayer",
          zone: "characterArea",
          filter: { categories: ["character"] },
          min: 0,
          max: 1,
          allowFewerIfUnavailable: true,
          visibility: "public",
        },
      },
    },
  ]);
});

test("selectedTargets matrix rejects missing savedFieldObject binding", () => {
  assertUnsupported([
    {
      connector: "always",
      effect: {
        type: "ko",
        target: savedCharacterTarget("saved-result:missing-target"),
      },
    },
  ]);
});

test("selectedTargets matrix rejects wrong savedFieldObject family", () => {
  const selection = "saved-result:wrong-family-target" as SelectionId;

  assertUnsupported([
    selectCharacterTarget(selection),
    {
      connector: "then",
      effect: {
        type: "ko",
        target: savedCharacterTarget(selection, "paidCost"),
      },
    },
  ]);
});
