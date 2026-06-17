import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition, ReplacementTrigger } from "@optcg/types";

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

test("runtime admission accepts KO replacement with reusable Life-to-trash body", () => {
  const when: ReplacementTrigger = {
    type: "wouldBeKOd",
    sourceKind: "cardEffect",
    sourceControllerRelation: "any",
    target: { type: "self" },
  };

  const report = evaluateEffectBlockRuntimeSupport(
    block({
      category: "replacement",
      trigger: { type: "replacement", replacement: when },
      oncePerTurn: true,
      optional: true,
      sourcePresencePolicy: "resolveFromLastKnownInformation",
      effect: {
        type: "replacement",
        when,
        instead: {
          type: "moveCards",
          count: 1,
          from: { player: "self", zone: "life", position: "top" },
          to: { player: "self", zone: "trash" },
          order: "original",
        },
      },
    }),
  );

  assert.equal(report.supported, true);
  assert.deepEqual(report.missing, []);
});
