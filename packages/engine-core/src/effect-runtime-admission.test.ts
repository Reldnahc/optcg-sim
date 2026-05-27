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

test("runtime admission accepts reusable auto bodies through supported entry adapters", () => {
  const effect = {
    type: "trashFromHand",
    player: "self",
    chooser: "self",
    count: 1,
  } as const;

  assert.deepEqual(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        effect,
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "onPlay" },
      }),
    ),
    { supported: true },
  );

  assert.deepEqual(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        effect,
        sourcePresencePolicy: "resolveFromDestinationZone",
        trigger: { type: "onKO" },
      }),
    ),
    { supported: true },
  );
});

test("runtime admission accepts deck-top card movement as a reusable auto body", () => {
  const effect = {
    type: "moveCards",
    count: 1,
    from: { player: "self", zone: "deck", position: "top" },
    to: { player: "self", zone: "trash" },
    order: "original",
  } as const;

  assert.deepEqual(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        effect,
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "onPlay" },
      }),
    ),
    { supported: true },
  );
});

test("runtime admission accepts DON deck movement as a reusable auto body", () => {
  const effect = {
    type: "moveCards",
    min: 0,
    count: 1,
    from: { player: "self", zone: "donDeck", position: "top" },
    to: { player: "self", zone: "costArea" },
    order: "original",
    destinationState: "active",
  } as const;

  assert.deepEqual(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        effect,
        sourcePresencePolicy: "noSourceRequired",
        trigger: { type: "trigger" },
      }),
    ),
    { supported: true },
  );
});

test("runtime admission rejects parsed unsupported entry adapters", () => {
  assert.deepEqual(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        effect: { type: "draw", player: "self", count: 1 },
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "onBlock" },
      }),
    ),
    {
      reason: "unsupported trigger/category/source-presence envelope",
      supported: false,
    },
  );
});
