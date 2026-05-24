import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition, SourcePresencePolicy } from "@optcg/types";

import {
  isSupportedAutoRuntimeEffectBlock,
  type AutoRuntimeEntryAdapter,
} from "./effect-runtime-block-support.js";

type EffectBlock = EffectDefinition["effects"][number];

const autoAdapter = (
  triggerType: AutoRuntimeEntryAdapter["triggerType"],
  sourcePresencePolicy: SourcePresencePolicy,
): AutoRuntimeEntryAdapter => ({
  category: "auto",
  sourcePresencePolicies: [sourcePresencePolicy],
  triggerType,
});

const autoBlock = (
  params: Pick<EffectBlock, "effect" | "sourcePresencePolicy" | "trigger"> &
    Partial<
      Omit<
        EffectBlock,
        "category" | "effect" | "sourcePresencePolicy" | "trigger"
      >
    >,
): EffectBlock => ({
  id: "effect:test" as EffectBlock["id"],
  category: "auto",
  ...params,
});

test("auto runtime admission accepts a supported body primitive through different entry adapters", () => {
  const trashFromHand = {
    type: "trashFromHand",
    player: "self",
    chooser: "self",
    count: 1,
  } as const;

  assert.equal(
    isSupportedAutoRuntimeEffectBlock(
      autoBlock({
        effect: trashFromHand,
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "onPlay" },
      }),
      autoAdapter("onPlay", "mustRemainInSameZone"),
    ),
    true,
  );

  assert.equal(
    isSupportedAutoRuntimeEffectBlock(
      autoBlock({
        effect: trashFromHand,
        sourcePresencePolicy: "resolveFromDestinationZone",
        trigger: { type: "onKO" },
      }),
      autoAdapter("onKO", "resolveFromDestinationZone"),
    ),
    true,
  );
});

test("auto runtime admission composes supported conditions with supported body primitives", () => {
  const block = autoBlock({
    condition: {
      type: "donCount",
      min: 6,
      target: { type: "self" },
    },
    effect: {
      type: "modifyPower",
      target: {
        type: "choose",
        request: {
          timing: "onResolution",
          chooser: "self",
          zone: "characterArea",
          player: "opponent",
          filter: { categories: ["character"] },
          min: 0,
          max: 1,
          allowFewerIfUnavailable: false,
          visibility: "public",
        },
      },
      value: -1000,
      duration: { type: "thisTurn" },
    },
    sourcePresencePolicy: "mustRemainInSameZone",
    trigger: { type: "whenAttacking" },
  });

  assert.equal(
    isSupportedAutoRuntimeEffectBlock(
      block,
      autoAdapter("whenAttacking", "mustRemainInSameZone"),
    ),
    false,
    "donCount is still not an implemented condition primitive",
  );

  assert.equal(
    isSupportedAutoRuntimeEffectBlock(
      {
        ...block,
        condition: {
          type: "fieldCount",
          player: "self",
          filter: { categories: ["don"] },
          op: "lte",
          value: 6,
        },
      },
      autoAdapter("whenAttacking", "mustRemainInSameZone"),
    ),
    true,
  );
});
