import { test } from "vitest";
import type { Effect, SelectionId, SelectionSetId } from "@optcg/types";

import {
  assertSupported,
  assertUnsupported,
  savedCharacterTarget,
  selectHand,
} from "./helpers.js";

test("paidCost matrix accepts saved paid field cost as savedFieldObject target", () => {
  const paidCost = "saved-result:paid-field-cost";

  assertSupported([
    {
      connector: "always",
      saveResultAs: paidCost,
      effect: {
        type: "payCost",
        cost: {
          type: "restFromField",
          count: 1,
          chooser: "self",
          optional: true,
          filter: { categories: ["character"] },
        },
      },
    },
    {
      connector: "then",
      effect: {
        type: "ko",
        target: savedCharacterTarget(paidCost, "paidCost"),
      },
    },
  ]);
});

test("producedObjects matrix accepts draw produced object as savedFieldObject target", () => {
  const drawnObject = "saved-result:drawn-object";

  assertSupported([
    {
      connector: "always",
      saveResultAs: drawnObject,
      effect: {
        type: "draw",
        count: 1,
        player: "self",
      },
    },
    {
      connector: "then",
      effect: {
        type: "ko",
        target: savedCharacterTarget(drawnObject, "producedObjects"),
      },
    },
  ]);
});

test("producedObjects matrix accepts playSelected produced object as savedFieldObject target", () => {
  const selection = "saved-result:played-selection" as SelectionId;
  const playedObject = "saved-result:played-object";

  assertSupported([
    selectHand(selection),
    {
      connector: "then",
      saveResultAs: playedObject,
      effect: {
        type: "playSelected",
        selection,
        ignoreCost: true,
      },
    },
    {
      connector: "then",
      effect: {
        type: "ko",
        target: savedCharacterTarget(playedObject, "producedObjects"),
      },
    },
  ]);
});

test("producedObjects matrix carries played objects into delayed branches", () => {
  const selection = "saved-result:delayed-played-selection" as SelectionId;
  const playedObject = "saved-result:delayed-played-object";

  assertSupported([
    selectHand(selection),
    {
      connector: "then",
      saveResultAs: playedObject,
      effect: {
        type: "playSelected",
        selection,
        ignoreCost: true,
      },
    },
    {
      connector: "ifPreviousSucceeded",
      effect: {
        type: "delayed",
        timing: { type: "endOfTurn", turn: "current" },
        effect: {
          type: "bounce",
          destination: "deckBottom",
          target: {
            type: "savedFieldObject",
            binding: {
              family: "producedObjects",
              saveResultAs: playedObject,
            },
            zone: "characterArea",
            player: "self",
            visibility: "publicOnly",
            onFailure: "failClosed",
          },
        },
      },
    },
  ]);
});

test("producedObjects matrix accepts trigger card played seed as savedFieldObject target", () => {
  assertSupported([
    {
      connector: "always",
      effect: {
        type: "ko",
        target: savedCharacterTarget("trigger:cardPlayed", "producedObjects"),
      },
    },
  ]);
});

test("producedObjects matrix rejects missing producedObjects reference", () => {
  assertUnsupported([
    {
      connector: "always",
      effect: {
        type: "ko",
        target: savedCharacterTarget(
          "saved-result:missing-produced-object",
          "producedObjects",
        ),
      },
    },
  ]);
});

test("paidCost matrix rejects missing paidCost reference", () => {
  assertUnsupported([
    {
      connector: "always",
      effect: {
        type: "ko",
        target: savedCharacterTarget(
          "saved-result:missing-paid-cost",
          "paidCost",
        ),
      },
    },
  ]);
});

test("chosenNumber matrix accepts chooseNumber savedNumber in selectFromSet filter", () => {
  const numberSelection = "saved-result:number" as SelectionId;
  const set = "saved-result:number-set" as SelectionSetId;
  const cardSelection = "saved-result:number-card" as SelectionId;

  assertSupported([
    {
      connector: "always",
      effect: {
        type: "chooseNumber",
        chooser: "self",
        purpose: "number",
        min: 1,
        max: 4,
        saveAs: numberSelection,
      },
    },
    {
      connector: "then",
      effect: {
        type: "revealTop",
        player: "self",
        zone: "deck",
        count: 5,
        saveAs: set,
        visibility: "bothPlayers",
      },
    },
    {
      connector: "then",
      effect: {
        type: "selectFromSet",
        set,
        chooser: "self",
        min: 0,
        max: 1,
        filter: {
          statComparisons: [
            {
              stat: "cost",
              op: "lte",
              value: { type: "savedNumber", selection: numberSelection },
            },
          ],
        },
        saveAs: cardSelection,
      },
    },
  ]);
});

test("chosenNumber matrix accepts drawUpTo saved draw quantity in selectFromSet filter", () => {
  const numberSelection = "saved-result:draw-quantity" as SelectionId;
  const set = "saved-result:draw-quantity-set" as SelectionSetId;
  const cardSelection = "saved-result:draw-quantity-card" as SelectionId;
  const drawUpToEffect = {
    type: "drawUpTo",
    player: "self",
    count: 3,
    saveAs: numberSelection,
  } as Extract<Effect, { type: "drawUpTo" }> & { saveAs: SelectionId };

  assertSupported([
    {
      connector: "always",
      effect: drawUpToEffect,
    },
    {
      connector: "then",
      effect: {
        type: "revealTop",
        player: "self",
        zone: "deck",
        count: 5,
        saveAs: set,
        visibility: "bothPlayers",
      },
    },
    {
      connector: "then",
      effect: {
        type: "selectFromSet",
        set,
        chooser: "self",
        min: 0,
        max: 1,
        filter: {
          statComparisons: [
            {
              stat: "cost",
              op: "lte",
              value: { type: "savedNumber", selection: numberSelection },
            },
          ],
        },
        saveAs: cardSelection,
      },
    },
  ]);
});

test("remainder matrix accepts revealTop selection set for placeSetRemainder", () => {
  const set = "saved-result:remainder-set" as SelectionSetId;

  assertSupported([
    {
      connector: "always",
      effect: {
        type: "revealTop",
        player: "self",
        zone: "deck",
        count: 5,
        saveAs: set,
        visibility: "chooserOnly",
      },
    },
    {
      connector: "then",
      effect: {
        type: "placeSetRemainder",
        set,
        owner: "self",
        destination: "deck",
        position: "topOrBottom",
        order: "chooser",
      },
    },
  ]);
});

test("chosenNumber matrix rejects missing savedNumber reference", () => {
  const set = "saved-result:missing-number-set" as SelectionSetId;
  const cardSelection = "saved-result:missing-number-card" as SelectionId;

  assertUnsupported([
    {
      connector: "always",
      effect: {
        type: "revealTop",
        player: "self",
        zone: "deck",
        count: 5,
        saveAs: set,
        visibility: "bothPlayers",
      },
    },
    {
      connector: "then",
      effect: {
        type: "selectFromSet",
        set,
        chooser: "self",
        min: 0,
        max: 1,
        filter: {
          statComparisons: [
            {
              stat: "cost",
              op: "lte",
              value: {
                type: "savedNumber",
                selection: "saved-result:missing-number" as SelectionId,
              },
            },
          ],
        },
        saveAs: cardSelection,
      },
    },
  ]);
});

test("remainder matrix rejects missing selection set reference", () => {
  assertUnsupported([
    {
      connector: "always",
      effect: {
        type: "placeSetRemainder",
        set: "saved-result:missing-remainder-set" as SelectionSetId,
        owner: "self",
        destination: "deck",
        position: "topOrBottom",
        order: "chooser",
      },
    },
  ]);
});
