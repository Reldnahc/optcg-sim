import assert from "node:assert/strict";
import { test } from "vitest";

import type { Effect, EffectDefinition, SelectionId } from "@optcg/types";

import { evaluateEffectBlockRuntimeSupport } from "./effect-runtime-admission.js";

type EffectBlock = EffectDefinition["effects"][number];

const block = (
  params: Pick<
    EffectBlock,
    "category" | "effect" | "sourcePresencePolicy" | "trigger"
  > &
    Partial<
      Omit<
        EffectBlock,
        "category" | "effect" | "id" | "sourcePresencePolicy" | "trigger"
      >
    >,
): EffectBlock => ({
  id: "effect:test" as EffectBlock["id"],
  ...params,
});

const assertRuntimeSupported = (
  report: ReturnType<typeof evaluateEffectBlockRuntimeSupport>,
): void => {
  assert.equal(report.supported, true, JSON.stringify(report, null, 2));
  assert.deepEqual(report.missing, []);
};

test("runtime admission accepts opponent-chosen trash from your hand as reusable hand trash", () => {
  const effect: Effect = {
    type: "trashFromHand",
    player: "self",
    chooser: "opponent",
    count: 1,
  };

  assertRuntimeSupported(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        effect,
        sourcePresencePolicy: "resolveFromDestinationZone",
        trigger: { type: "onKO" },
      }),
    ),
  );

  assertRuntimeSupported(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        effect,
        sourcePresencePolicy: "noSourceRequired",
        trigger: { type: "trigger" },
      }),
    ),
  );
});

test("runtime admission accepts hand selection reveal sequences", () => {
  const selectionId = "handSelection:reveal" as SelectionId;
  const effect: Effect = {
    type: "sequence",
    effects: [
      {
        id: "select",
        connector: "always",
        saveResultAs: selectionId,
        effect: {
          type: "selectCards",
          zone: "hand",
          player: "opponent",
          chooser: "self",
          min: 1,
          max: 2,
          saveAs: selectionId,
          visibility: "chooserOnly",
        },
      },
      {
        id: "reveal",
        connector: "ifYouDo",
        effect: {
          type: "revealSelected",
          selection: selectionId,
          visibility: "bothPlayers",
        },
      },
    ],
  };

  assertRuntimeSupported(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        effect,
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "onPlay" },
      }),
    ),
  );
});

test("runtime admission accepts optional hand reveal with selected-card conditional follow-up", () => {
  const handSelectionId = "handSelection:event-check" as SelectionId;
  const lifeSelectionId = "lifeSelection:bottom" as SelectionId;
  const effect: Effect = {
    type: "sequence",
    effects: [
      {
        id: "select:hand",
        connector: "always",
        saveResultAs: handSelectionId,
        effect: {
          type: "selectCards",
          zone: "hand",
          player: "opponent",
          chooser: "self",
          min: 1,
          max: 1,
          saveAs: handSelectionId,
          visibility: "chooserOnly",
        },
      },
      {
        id: "reveal",
        connector: "ifYouDo",
        effect: {
          type: "revealSelected",
          selection: handSelectionId,
          visibility: "bothPlayers",
        },
      },
      {
        id: "select:life",
        connector: "then",
        effect: {
          type: "conditional",
          if: {
            type: "cardMatches",
            target: {
              type: "savedSelectedCard",
              selection: handSelectionId,
              onFailure: "failClosed",
            },
            filter: { categories: ["event"] },
          },
          then: {
            type: "sequence",
            effects: [
              {
                id: "select:life",
                connector: "always",
                saveResultAs: lifeSelectionId,
                effect: {
                  type: "selectCards",
                  zone: "life",
                  player: "opponent",
                  chooser: "self",
                  min: 0,
                  max: 1,
                  saveAs: lifeSelectionId,
                  visibility: "bothPlayers",
                },
              },
              {
                id: "bottom",
                connector: "ifYouDo",
                effect: {
                  type: "moveSelected",
                  selection: lifeSelectionId,
                  from: "life",
                  to: "deck",
                  position: "bottom",
                },
              },
            ],
          },
        },
      },
    ],
  };

  assertRuntimeSupported(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "activate",
        effect,
        trigger: { type: "activateMain" },
        sourcePresencePolicy: "mustRemainInSameZone",
      }),
    ),
  );
});
