import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition } from "@optcg/types";

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

const referencedOnKoBlock = (): EffectBlock => ({
  ...block({
    category: "auto",
    trigger: { type: "onKO" },
    sourcePresencePolicy: "resolveFromDestinationZone",
    effect: { type: "draw", player: "self", count: 1 },
  }),
  id: "effect:referenced-on-ko" as EffectBlock["id"],
});

const activateReferencedOnKoBlock = (
  params: Partial<Pick<EffectBlock, "oncePerTurn" | "optional">> = {},
): EffectBlock =>
  block({
    category: "auto",
    trigger: { type: "trigger" },
    sourcePresencePolicy: "noSourceRequired",
    ...params,
    effect: {
      type: "activateReferencedEffect",
      source: { type: "triggerCard" },
      trigger: { type: "onKO" },
    },
  });

const assertRuntimeUnsupported = (
  report: ReturnType<typeof evaluateEffectBlockRuntimeSupport>,
  reason: string,
): void => {
  assert.equal(report.supported, false);
  assert.equal(report.reason, reason);
};

test("referenced activation requires a supported sibling effect target", () => {
  const activateReferenced = activateReferencedOnKoBlock();
  const referencedOnKo = referencedOnKoBlock();

  assertRuntimeUnsupported(
    evaluateEffectBlockRuntimeSupport(activateReferenced),
    "unsupported referenced effect target",
  );
  assert.equal(
    evaluateEffectBlockRuntimeSupport(activateReferenced, {
      siblingBlocks: [activateReferenced, referencedOnKo],
    }).supported,
    true,
  );
});

test("referenced activation rejects unsupported activation wrappers even with a sibling target", () => {
  const referencedOnKo = referencedOnKoBlock();
  const optionalActivateReferenced = activateReferencedOnKoBlock({
    optional: true,
  });
  const oncePerTurnActivateReferenced = activateReferencedOnKoBlock({
    oncePerTurn: true,
  });

  assertRuntimeUnsupported(
    evaluateEffectBlockRuntimeSupport(optionalActivateReferenced, {
      siblingBlocks: [optionalActivateReferenced, referencedOnKo],
    }),
    "unsupported referenced activation envelope",
  );
  assertRuntimeUnsupported(
    evaluateEffectBlockRuntimeSupport(oncePerTurnActivateReferenced, {
      siblingBlocks: [oncePerTurnActivateReferenced, referencedOnKo],
    }),
    "unsupported referenced activation envelope",
  );
});
