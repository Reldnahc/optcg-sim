import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  EffectDefinition,
  ReplacementTrigger,
  Target,
} from "@optcg/types";

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
  id: "effect:st30-runtime-test" as EffectBlock["id"],
  ...params,
});

const assertRuntimeSupported = (
  report: ReturnType<typeof evaluateEffectBlockRuntimeSupport>,
): void => {
  assert.equal(report.supported, true);
  assert.deepEqual(report.missing, []);
};

test("runtime admission accepts replacement with reusable sequenced instead body", () => {
  const target: Target = {
    type: "all",
    zone: "characterArea",
    player: "self",
    filter: {
      categories: ["character"],
      power: { op: "eq", value: 6000 },
    },
  };
  const when: ReplacementTrigger = {
    type: "wouldMoveZone",
    from: "characterArea",
    sourceKind: "cardEffect",
    sourceControllerRelation: "opponentControlled",
    target,
  };

  assertRuntimeSupported(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "replacement",
        trigger: { type: "replacement", replacement: when },
        optional: true,
        sourcePresencePolicy: "resolveFromLastKnownInformation",
        effect: {
          type: "replacement",
          when,
          instead: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                effect: { type: "trash", target: { type: "self" } },
              },
              {
                connector: "then",
                effect: { type: "draw", count: 1, player: "self" },
              },
            ],
          },
        },
      }),
    ),
  );
});

test("runtime admission accepts all-target continuous power with anyOf name filters", () => {
  assertRuntimeSupported(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "permanent",
        trigger: { type: "permanent" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "modifyPower",
          target: {
            type: "all",
            zone: "characterArea",
            player: "self",
            filter: {
              anyOf: [
                { names: ["Portgas.D.Ace"] },
                { names: ["Monkey.D.Luffy"] },
              ],
            },
          },
          value: 3000,
          duration: {
            type: "whileConditionTrue",
            condition: { type: "opponentTurn" },
          },
        },
      }),
    ),
  );
});
