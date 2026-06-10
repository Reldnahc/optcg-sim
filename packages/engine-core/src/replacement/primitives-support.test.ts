import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Effect,
  EffectDefinition,
  EffectId,
  ReplacementTrigger,
} from "@optcg/types";

import { isSupportedReplacementEffectBlock } from "./primitives.js";

const toEffectId = (value: string): EffectId => value as EffectId;

const allSelfCharacters = {
  type: "all",
  zone: "characterArea",
  player: "self",
} as const;

const wouldMoveFromCharacterArea = (): ReplacementTrigger => ({
  type: "wouldMoveZone",
  from: "characterArea",
  sourceKind: "cardEffect",
  target: allSelfCharacters,
});

const wouldBeKodByCardEffect = (): ReplacementTrigger => ({
  type: "wouldBeKOd",
  sourceKind: "cardEffect",
  target: allSelfCharacters,
});

const restSelfInstead = (): Extract<Effect, { type: "rest" }> => ({
  type: "rest",
  target: { type: "self" },
});

const returnDonInstead = (): Extract<Effect, { type: "returnDon" }> => ({
  type: "returnDon",
  count: 1,
  player: "self",
});

const ownerDeckBottomPair = (): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      connector: "always",
      saveResultAs: "selected-owner-bottom",
      effect: {
        type: "selectTargets",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "self",
          zone: "characterArea",
          min: 1,
          max: 1,
          allowFewerIfUnavailable: false,
          visibility: "public",
          filter: { categories: ["character"] },
        },
      },
    },
    {
      connector: "then",
      effect: {
        type: "bounce",
        destination: "deckBottom",
        target: {
          type: "savedFieldObject",
          binding: {
            family: "selectedTargets",
            saveResultAs: "selected-owner-bottom",
          },
          zone: "characterArea",
          player: "self",
          visibility: "publicOnly",
          onFailure: "failClosed",
        },
      },
    },
  ],
});

const nestedOwnerDeckBottomInstead = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      connector: "always",
      effect: ownerDeckBottomPair(),
    },
  ],
});

const replacementBlock = (
  id: string,
  when: ReplacementTrigger,
  instead: Effect,
): EffectDefinition["effects"][number] => ({
  id: toEffectId(id),
  category: "replacement",
  trigger: { type: "replacement", replacement: when },
  optional: true,
  sourcePresencePolicy: "resolveFromLastKnownInformation",
  effect: {
    type: "replacement",
    when,
    instead,
  },
});

test("replacement support admits the same rest-self instead primitive under move-zone and K.O. triggers", () => {
  const blocks = [
    replacementBlock(
      "replacement-rest-self-move-zone",
      wouldMoveFromCharacterArea(),
      restSelfInstead(),
    ),
    replacementBlock(
      "replacement-rest-self-ko",
      wouldBeKodByCardEffect(),
      restSelfInstead(),
    ),
  ];

  assert.deepEqual(
    blocks.map((block) => isSupportedReplacementEffectBlock(block)),
    [true, true],
  );
});

test("replacement support admits the same move-zone trigger with multiple instead primitives", () => {
  const blocks = [
    replacementBlock(
      "replacement-move-zone-rest-self",
      wouldMoveFromCharacterArea(),
      restSelfInstead(),
    ),
    replacementBlock(
      "replacement-move-zone-return-don",
      wouldMoveFromCharacterArea(),
      returnDonInstead(),
    ),
  ];

  assert.deepEqual(
    blocks.map((block) => isSupportedReplacementEffectBlock(block)),
    [true, true],
  );
});

test("owner deck-bottom replacement support follows flattened sequence primitives", () => {
  const block = replacementBlock(
    "replacement-owner-bottom-nested-sequence",
    wouldMoveFromCharacterArea(),
    nestedOwnerDeckBottomInstead(),
  );

  assert.equal(isSupportedReplacementEffectBlock(block), true);
});
