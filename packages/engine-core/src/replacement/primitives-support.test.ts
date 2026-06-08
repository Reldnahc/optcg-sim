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
