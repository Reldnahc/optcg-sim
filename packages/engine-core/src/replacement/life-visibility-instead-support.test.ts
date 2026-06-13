import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition } from "@optcg/types";

import { isSupportedReplacementEffectBlock } from "./primitives.js";

type EffectBlock = EffectDefinition["effects"][number];

test("replacement support accepts top Life face-up instead primitives", () => {
  const effect: EffectBlock = {
    id: "effect:life-face-up-replacement" as EffectBlock["id"],
    category: "replacement",
    trigger: {
      type: "replacement",
      replacement: {
        type: "wouldMoveZone",
        from: "characterArea",
        sourceKind: "cardEffect",
        sourceControllerRelation: "opponentControlled",
        target: { type: "self" },
      },
    },
    optional: true,
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    effect: {
      type: "replacement",
      when: {
        type: "wouldMoveZone",
        from: "characterArea",
        sourceKind: "cardEffect",
        sourceControllerRelation: "opponentControlled",
        target: { type: "self" },
      },
      instead: {
        type: "setLifeCardFaceUp",
        player: "self",
        count: 1,
        position: "top",
        faceUp: true,
      },
    },
  };

  assert.equal(isSupportedReplacementEffectBlock(effect), true);
});
