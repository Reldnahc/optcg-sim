import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition, SourcePresencePolicy } from "@optcg/types";

import {
  autoRuntimeEntryAdapterForTriggerType,
  isSupportedAutoRuntimeEffectBlock,
  type AutoRuntimeEntryAdapter,
} from "./effect-runtime-block-support.js";
import { isSupportedQueuedDrawEffectBlock } from "./runtime/primitives/execute.js";

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

test("auto runtime admission composes optionality with reusable body primitives", () => {
  const moveCards = {
    type: "moveCards",
    count: 1,
    from: { player: "self", zone: "deck", position: "top" },
    to: { player: "self", zone: "trash" },
    order: "original",
  } as const;

  assert.equal(
    isSupportedAutoRuntimeEffectBlock(
      autoBlock({
        effect: moveCards,
        optional: true,
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "onPlay" },
      }),
      autoAdapter("onPlay", "mustRemainInSameZone"),
    ),
    true,
  );
});

test("queued draw support follows reusable auto entry adapters", () => {
  const triggerType = "endOfYourTurn";
  const adapter = autoRuntimeEntryAdapterForTriggerType(triggerType);
  assert.ok(adapter !== undefined);
  const block = autoBlock({
    effect: { type: "draw", count: 1, player: "self" },
    sourcePresencePolicy: "mustRemainInSameZone",
    trigger: { type: triggerType },
  });

  assert.equal(isSupportedAutoRuntimeEffectBlock(block, adapter), true);
  assert.equal(isSupportedQueuedDrawEffectBlock(block), true);
});

test("queued draw support accepts cardRested through the reusable auto adapter", () => {
  const triggerType = "cardRested";
  const adapter = autoRuntimeEntryAdapterForTriggerType(triggerType);
  assert.ok(adapter !== undefined);
  const block = autoBlock({
    effect: { type: "draw", count: 1, player: "self" },
    sourcePresencePolicy: "mustRemainInSameZone",
    trigger: {
      type: triggerType,
      target: "self",
      player: "self",
      filter: { categories: ["character"] },
    },
  });

  assert.equal(isSupportedAutoRuntimeEffectBlock(block, adapter), true);
  assert.equal(isSupportedQueuedDrawEffectBlock(block), true);
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

test("auto runtime admission accepts referenced non-continuous auto entry triggers", () => {
  assert.equal(
    isSupportedAutoRuntimeEffectBlock(
      autoBlock({
        effect: {
          type: "activateReferencedEffect",
          source: { type: "triggerCard" },
          trigger: { type: "onKO" },
        },
        sourcePresencePolicy: "noSourceRequired",
        trigger: { type: "trigger" },
      }),
      autoAdapter("trigger", "noSourceRequired"),
    ),
    true,
  );

  assert.equal(
    isSupportedAutoRuntimeEffectBlock(
      autoBlock({
        effect: {
          type: "activateReferencedEffect",
          source: { type: "triggerCard" },
          trigger: { type: "permanent" },
        },
        sourcePresencePolicy: "noSourceRequired",
        trigger: { type: "trigger" },
      }),
      autoAdapter("trigger", "noSourceRequired"),
    ),
    false,
  );
});

test("auto runtime admission treats supported self-target continuous bodies as source-dependent", () => {
  const selfKeywordEffect = {
    type: "giveKeyword",
    target: { type: "self" },
    keyword: "rush",
    duration: { type: "thisTurn" },
  } as const;

  assert.equal(
    isSupportedAutoRuntimeEffectBlock(
      autoBlock({
        effect: selfKeywordEffect,
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
        effect: selfKeywordEffect,
        sourcePresencePolicy: "noSourceRequired",
        trigger: { type: "trigger" },
      }),
      autoAdapter("trigger", "noSourceRequired"),
    ),
    false,
  );
});
