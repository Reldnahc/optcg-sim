import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  EffectDefinition,
  EffectQueueEntry,
  SelectionId,
} from "@optcg/types";

import { evaluateEffectBlockRuntimeSupport } from "./effect-runtime-admission.js";
import { toSupportedSequenceBlock } from "./effect-runtime-sequence/support.js";

const syntheticEntry = (
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"] = "mustRemainInSameZone",
): EffectQueueEntry => ({
  id: "runtime-support-gate-parity-entry" as EffectQueueEntry["id"],
  state: "pending",
  timingWindowId:
    "runtime-support-gate-parity-window" as EffectQueueEntry["timingWindowId"],
  generation: 0,
  controllerId: "p1" as EffectQueueEntry["controllerId"],
  source: {
    instanceId: "p1:source:1" as EffectQueueEntry["source"]["instanceId"],
    cardId: "TEST-001" as EffectQueueEntry["source"]["cardId"],
    playerId: "p1" as EffectQueueEntry["source"]["playerId"],
    zone: {
      zone: "characterArea",
      playerId: "p1" as EffectQueueEntry["source"]["playerId"],
      slot: "character",
      index: 0,
    },
  },
  sourceSnapshot: {
    instanceId:
      "p1:source:1" as EffectQueueEntry["sourceSnapshot"]["instanceId"],
    cardId: "TEST-001" as EffectQueueEntry["sourceSnapshot"]["cardId"],
    ownerId: "p1" as EffectQueueEntry["sourceSnapshot"]["ownerId"],
    controllerId: "p1" as EffectQueueEntry["sourceSnapshot"]["controllerId"],
    zone: {
      zone: "characterArea",
      playerId: "p1" as EffectQueueEntry["sourceSnapshot"]["ownerId"],
      slot: "character",
      index: 0,
    },
    category: "character",
    colors: ["red"],
    keywords: [],
    power: 2000,
  },
  effectBlockId:
    "runtime-support-gate-parity-effect" as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: 0 as EffectQueueEntry["queuedAtStateSeq"],
  sourcePresencePolicy,
  causedBy: { type: "ruleProcess", name: "runtime-support-gate-parity" },
});

const conditionedOptionalDonAttachBlock =
  (): EffectDefinition["effects"][number] => {
    const donSelection = "selected-don-for-parity-attach" as SelectionId;
    const targetSelection = "selected-target-for-parity-attach";
    return {
      id: "runtime-support-gate-parity-conditioned-attach" as EffectDefinition["effects"][number]["id"],
      category: "auto",
      trigger: { type: "onPlay" },
      condition: {
        type: "hasCardInZone",
        zone: "leaderArea",
        player: "self",
        filter: { categories: ["leader"], typesAny: ["East Blue"] },
      },
      optional: false,
      oncePerTurn: false,
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: donSelection,
            effect: {
              type: "selectTargets",
              request: {
                timing: "onResolution",
                chooser: "self",
                player: "opponent",
                zone: "costArea",
                filter: { categories: ["don"] },
                min: 0,
                max: 1,
                allowFewerIfUnavailable: true,
                visibility: "public",
              },
            },
          },
          {
            connector: "ifYouDo",
            saveResultAs: targetSelection,
            effect: {
              type: "selectTargets",
              request: {
                timing: "onResolution",
                chooser: "self",
                player: "opponent",
                zone: "characterArea",
                filter: { categories: ["character"] },
                min: 1,
                max: 1,
                allowFewerIfUnavailable: false,
                visibility: "public",
              },
            },
          },
          {
            connector: "then",
            effect: {
              type: "attachSelectedDon",
              selection: donSelection,
              target: {
                type: "savedFieldObject",
                binding: {
                  family: "selectedTargets",
                  saveResultAs: targetSelection,
                },
                zone: "characterArea",
                player: "opponent",
                filter: { categories: ["character"] },
                visibility: "publicOnly",
                onFailure: "failClosed",
              },
            },
          },
        ],
      },
    };
  };

test("canonical support and sequence execution preflight agree for conditioned sequence blocks", () => {
  const block = conditionedOptionalDonAttachBlock();

  assert.equal(evaluateEffectBlockRuntimeSupport(block).supported, true);
  assert.notEqual(toSupportedSequenceBlock(syntheticEntry(), block), undefined);
});

test("canonical support and sequence execution preflight both reject unsupported conditions", () => {
  const block: EffectDefinition["effects"][number] = {
    ...conditionedOptionalDonAttachBlock(),
    condition: { type: "custom", check: "unsupported-condition" },
  };

  assert.equal(evaluateEffectBlockRuntimeSupport(block).supported, false);
  assert.equal(toSupportedSequenceBlock(syntheticEntry(), block), undefined);
});

const unsupportedEnvelopeCases: readonly {
  readonly name: string;
  readonly mutate: (
    block: EffectDefinition["effects"][number],
  ) => EffectDefinition["effects"][number];
}[] = [
  {
    name: "conditionTiming",
    mutate: (block) => ({ ...block, conditionTiming: "resolution" }),
  },
  {
    name: "failurePolicy",
    mutate: (block) => ({ ...block, failurePolicy: "doAsMuchAsPossible" }),
  },
  {
    name: "unsupported condition",
    mutate: (block) => ({
      ...block,
      condition: { type: "custom", check: "unsupported-condition" },
    }),
  },
];

for (const testCase of unsupportedEnvelopeCases) {
  test(`canonical support and sequence preflight both reject ${testCase.name}`, () => {
    const block = testCase.mutate(conditionedOptionalDonAttachBlock());

    assert.equal(evaluateEffectBlockRuntimeSupport(block).supported, false);
    assert.equal(toSupportedSequenceBlock(syntheticEntry(), block), undefined);
  });
}
