import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition, SelectionId } from "@optcg/types";

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
  id: "effect:field-to-life-admission" as EffectBlock["id"],
  ...params,
});

const assertRuntimeSupported = (
  report: ReturnType<typeof evaluateEffectBlockRuntimeSupport>,
): void => {
  assert.equal(report.supported, true);
  assert.deepEqual(report.missing, []);
};

test("runtime admission accepts saved field object movement to Life through choice options", () => {
  const selection = "selected:field-to-life" as SelectionId;
  assertRuntimeSupported(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        trigger: { type: "main" },
        sourcePresencePolicy: "noSourceRequired",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              saveResultAs: selection,
              effect: {
                type: "selectTargets",
                request: {
                  timing: "onResolution",
                  chooser: "self",
                  player: "opponent",
                  zone: "characterArea",
                  min: 0,
                  max: 1,
                  allowFewerIfUnavailable: true,
                  visibility: "public",
                  filter: { categories: ["character"], cost: { max: 1 } },
                },
              },
            },
            {
              connector: "then",
              effect: {
                type: "choice",
                chooser: "self",
                min: 1,
                max: 1,
                options: [
                  {
                    id: "life-placement:top",
                    effect: {
                      type: "bounce",
                      destination: "lifeTop",
                      destinationFaceUp: true,
                      target: {
                        type: "savedFieldObject",
                        binding: {
                          family: "selectedTargets",
                          saveResultAs: selection,
                        },
                        zone: "characterArea",
                        player: "opponent",
                        visibility: "publicOnly",
                        onFailure: "failClosed",
                      },
                    },
                  },
                  {
                    id: "life-placement:bottom",
                    effect: {
                      type: "bounce",
                      destination: "lifeBottom",
                      destinationFaceUp: true,
                      target: {
                        type: "savedFieldObject",
                        binding: {
                          family: "selectedTargets",
                          saveResultAs: selection,
                        },
                        zone: "characterArea",
                        player: "opponent",
                        visibility: "publicOnly",
                        onFailure: "failClosed",
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      }),
    ),
  );
});
