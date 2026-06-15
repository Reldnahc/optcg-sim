import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition } from "@optcg/types";

import { evaluateEffectBlockRuntimeSupport } from "./effect-runtime-admission.js";

type EffectBlock = EffectDefinition["effects"][number];

const block = (
  params: Pick<
    EffectBlock,
    "category" | "effect" | "sourcePresencePolicy" | "trigger"
  >,
): EffectBlock => ({
  id: "effect:event-count:test" as EffectBlock["id"],
  ...params,
});

test("runtime admission unwraps event-count triggers for reusable auto sequence support", () => {
  const report = evaluateEffectBlockRuntimeSupport(
    block({
      category: "auto",
      sourcePresencePolicy: "mustRemainInSameZone",
      trigger: {
        type: "eventCount",
        count: { op: "gte", value: 2 },
        trigger: { type: "donReturned", player: "self" },
      },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "moveCards",
              min: 0,
              count: 1,
              from: { player: "self", zone: "donDeck", position: "top" },
              to: { player: "self", zone: "costArea" },
              order: "original",
              destinationState: "active",
            },
          },
          {
            connector: "then",
            effect: {
              type: "moveCards",
              min: 0,
              count: 1,
              from: { player: "self", zone: "donDeck", position: "top" },
              to: { player: "self", zone: "costArea" },
              order: "original",
              destinationState: "rested",
            },
          },
        ],
      },
    }),
  );

  assert.equal(report.supported, true);
  assert.deepEqual(report.missing, []);
});
