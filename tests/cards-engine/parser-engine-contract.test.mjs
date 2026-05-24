import assert from "node:assert/strict";
import { test } from "vitest";

import { parseCardEffectLine } from "../../packages/cards/src/card-effect-line-parser.ts";
import {
  isSupportedNoChoiceOnPlayDrawEffect,
  isSupportedNoChoiceWhenAttackingDrawEffect,
} from "../../packages/engine-core/src/effect-runtime.ts";
import {
  hasCombatSafeImplementedDslDefinition,
  isSupportedContinuousQueueEffect,
} from "../../packages/engine-core/src/effect-runtime-continuous.ts";
import { isSupportedQueuedEffectConditionShape } from "../../packages/engine-core/src/effect-runtime-conditions.ts";
import { isSupportedQueuedAutoSequenceForEntryPoint } from "../../packages/engine-core/src/effect-runtime-sequence-support.ts";

const parseSupportedEffectBlock = (text, evidence = []) => {
  const parsed = parseCardEffectLine(text);
  assert.ok(parsed !== undefined, `expected parser to support: ${text}`);
  for (const expectedEvidence of evidence) {
    assert.ok(
      parsed.evidence.includes(expectedEvidence),
      `expected evidence ${expectedEvidence} for ${text}`,
    );
  }

  return {
    id: `cards-engine-contract:${text}`,
    ...parsed.block,
  };
};

test("cards parser emits an On Play draw primitive block accepted by engine draw support", () => {
  const effectBlock = parseSupportedEffectBlock("[On Play] Draw 1 card.", [
    "entry:onPlay",
    "instruction:draw",
  ]);

  assert.equal(isSupportedNoChoiceOnPlayDrawEffect(effectBlock), true);
});

test("cards parser emits a DON-return On Play draw block accepted by engine sequence support", () => {
  const effectBlock = parseSupportedEffectBlock(
    "[On Play] DON!! −1: Draw 1 card.",
    ["entry:onPlay", "cost:returnDon", "instruction:draw"],
  );

  assert.equal(
    isSupportedQueuedAutoSequenceForEntryPoint(
      effectBlock,
      "onPlay",
      "mustRemainInSameZone",
    ),
    true,
  );
});

test("cards parser emits once-per-turn attacking draw accepted by engine draw support", () => {
  const effectBlock = parseSupportedEffectBlock(
    "[When Attacking] [Once Per Turn] Draw 2 cards.",
    ["entry:whenAttacking", "marker:oncePerTurn", "instruction:draw"],
  );

  assert.equal(isSupportedNoChoiceWhenAttackingDrawEffect(effectBlock), true);
});

test("cards parser emits draw/trash sequence child primitives accepted by engine sequence support", () => {
  const effectBlock = parseSupportedEffectBlock(
    "[When Attacking] [Once Per Turn] Draw 2 cards and trash 1 card from your hand.",
    [
      "entry:whenAttacking",
      "marker:oncePerTurn",
      "instruction:draw",
      "connector:andOrdered",
      "instruction:trashFromHand",
    ],
  );

  assert.equal(
    isSupportedQueuedAutoSequenceForEntryPoint(
      effectBlock,
      "whenAttacking",
      "mustRemainInSameZone",
    ),
    true,
  );
});

test("cards parser emits conditional power reduction primitives accepted by engine condition and continuous gates", () => {
  const effectBlock = parseSupportedEffectBlock(
    "[When Attacking] If you have 6 or less DON!! cards on your field, give up to 1 of your opponent's Characters −1000 power during this turn.",
    [
      "entry:whenAttacking",
      "expression:conditional",
      "condition:donFieldCount",
      "condition:comparator:lte",
      "target:opponentCharacters",
      "cardinality:upTo",
      "modifier:negativePower",
      "duration:thisTurn",
    ],
  );

  assert.equal(effectBlock.effect.type, "conditional");
  assert.equal(
    isSupportedQueuedEffectConditionShape(effectBlock.effect.if),
    true,
  );
  assert.equal(isSupportedContinuousQueueEffect(effectBlock.effect.then), true);
});

test("cards parser emits conditional continuous protection and keyword primitives accepted by engine permanent materialization", () => {
  const effectBlock = parseSupportedEffectBlock(
    "If you have 7 or more cards in your trash, this Character cannot be removed from the field by your opponent's effects and gains [Blocker].",
    [
      "entry:implicitPermanent",
      "expression:conditionalContinuous",
      "condition:trashCount",
      "condition:comparator:gte",
      "instruction:giveProtection",
      "target:thisCharacter",
      "protectionProcess:fieldRemoval",
      "protectionSource:opponentEffects",
      "connector:andOrdered",
      "instruction:giveKeyword",
      "keyword:anySupported",
    ],
  );
  const definitionId = "cards-engine-contract:permanent";

  assert.equal(
    hasCombatSafeImplementedDslDefinition(
      {
        cardManifest: {
          effectDefinitions: {
            [definitionId]: {
              effects: [effectBlock],
            },
          },
        },
      },
      definitionId,
    ),
    true,
  );
});
