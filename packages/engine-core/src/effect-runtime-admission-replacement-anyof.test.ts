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

test("runtime admission accepts any-of K.O. or field-removal replacement with reusable hand-trash body", () => {
  const koWhen = {
    type: "wouldBeKOd",
    sourceControllerRelation: "any",
    target: { type: "self" },
  } as const;
  const fieldRemovalWhen = {
    type: "wouldMoveZone",
    from: "characterArea",
    sourceKind: "cardEffect",
    sourceControllerRelation: "opponentControlled",
    target: { type: "self" },
  } as const;
  const when = {
    type: "anyOf",
    replacements: [koWhen, fieldRemovalWhen],
  } as unknown as ReplacementTrigger;

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
          type: "trashFromHand",
          player: "self",
          chooser: "self",
          count: 1,
          filter: { typesIncludeAny: ["Whitebeard Pirates"] },
        },
      },
    }),
  );

  assert.equal(report.supported, true);
  assert.deepEqual(report.missing, []);
});
