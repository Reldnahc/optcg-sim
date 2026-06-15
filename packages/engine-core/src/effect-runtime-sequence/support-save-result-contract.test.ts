/* eslint-disable max-lines */
import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  SelectionId,
  SelectionSetId,
  Target,
} from "@optcg/types";

import { isSupportedSequenceBlock } from "./support.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type SequenceSegment = SequenceEffect["effects"][number];

const syntheticEntry = (): EffectQueueEntry => ({
  id: "save-result-contract-entry" as EffectQueueEntry["id"],
  state: "pending",
  timingWindowId:
    "save-result-contract-window" as EffectQueueEntry["timingWindowId"],
  generation: 0,
  controllerId: "p1" as EffectQueueEntry["controllerId"],
  source: {
    instanceId: "p1:leader" as EffectQueueEntry["source"]["instanceId"],
    cardId: "leader-card" as EffectQueueEntry["source"]["cardId"],
    playerId: "p1" as EffectQueueEntry["source"]["playerId"],
    zone: {
      zone: "leaderArea",
      playerId: "p1" as EffectQueueEntry["source"]["playerId"],
      slot: "leader",
    },
  },
  sourceSnapshot: {
    instanceId: "p1:leader" as EffectQueueEntry["sourceSnapshot"]["instanceId"],
    cardId: "leader-card" as EffectQueueEntry["sourceSnapshot"]["cardId"],
    ownerId: "p1" as EffectQueueEntry["sourceSnapshot"]["ownerId"],
    controllerId: "p1" as EffectQueueEntry["sourceSnapshot"]["controllerId"],
    zone: {
      zone: "leaderArea",
      playerId: "p1" as EffectQueueEntry["sourceSnapshot"]["ownerId"],
      slot: "leader",
    },
    category: "leader",
    colors: ["red"],
    keywords: [],
  },
  effectBlockId:
    "save-result-contract-effect" as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: 0 as EffectQueueEntry["queuedAtStateSeq"],
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: "save-result-contract-test" },
});

const block = (
  effects: SequenceSegment[],
): EffectDefinition["effects"][number] => ({
  id: "save-result-contract-effect" as EffectDefinition["effects"][number]["id"],
  category: "auto",
  trigger: { type: "onPlay" },
  optional: false,
  oncePerTurn: false,
  sourcePresencePolicy: "mustRemainInSameZone",
  effect: { type: "sequence", effects },
});

const assertSupported = (effects: SequenceSegment[]) => {
  assert.equal(
    isSupportedSequenceBlock(syntheticEntry(), block(effects)),
    true,
  );
};

const assertUnsupported = (effects: SequenceSegment[]) => {
  assert.equal(
    isSupportedSequenceBlock(syntheticEntry(), block(effects)),
    false,
  );
};

const selectHand = (selection: SelectionId, max = 1): SequenceSegment => ({
  connector: "always",
  saveResultAs: selection,
  effect: {
    type: "selectCards",
    player: "self",
    zone: "hand",
    chooser: "self",
    visibility: "chooserOnly",
    min: 0,
    max,
    saveAs: selection,
  },
});

const selectTrash = (selection: SelectionId): SequenceSegment => ({
  connector: "always",
  saveResultAs: selection,
  effect: {
    type: "selectCards",
    player: "self",
    zone: "trash",
    chooser: "self",
    visibility: "bothPlayers",
    min: 0,
    max: 1,
    saveAs: selection,
  },
});

const selectCostAreaDonCards = (selection: SelectionId): SequenceSegment => ({
  connector: "always",
  saveResultAs: selection,
  effect: {
    type: "selectCards",
    player: "self",
    zone: "costArea",
    chooser: "self",
    visibility: "bothPlayers",
    min: 0,
    max: 1,
    saveAs: selection,
    filter: { categories: ["don"], state: "rested" },
  },
});

const selectCostAreaDonTargets = (selection: SelectionId): SequenceSegment => ({
  connector: "always",
  saveResultAs: selection,
  effect: {
    type: "selectTargets",
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "self",
      zone: "costArea",
      filter: { categories: ["don"] },
      min: 0,
      max: 1,
      allowFewerIfUnavailable: true,
      visibility: "public",
    },
  },
});

const selectLeaderTarget = (selection: SelectionId): SequenceSegment => ({
  connector: "then",
  saveResultAs: selection,
  effect: {
    type: "selectTargets",
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "self",
      zone: "leaderArea",
      filter: { categories: ["leader"] },
      min: 1,
      max: 1,
      allowFewerIfUnavailable: false,
      visibility: "public",
    },
  },
});

const savedLeaderOrCharacterTarget = (
  selection: SelectionId,
): Extract<Target, { type: "savedFieldObject" }> => ({
  type: "savedFieldObject",
  binding: {
    family: "selectedTargets",
    saveResultAs: selection,
  },
  zones: ["leaderArea", "characterArea"],
  player: "self",
  filter: { categories: ["leader", "character"] },
  visibility: "publicOnly",
  onFailure: "failClosed",
});

const savedCharacterTarget = (
  selection: string,
  family:
    | "selectedTargets"
    | "forEachSavedTarget"
    | "producedObjects"
    | "paidCost" = "selectedTargets",
) => ({
  type: "savedFieldObject" as const,
  binding: {
    family,
    saveResultAs: selection,
  },
  zone: "characterArea" as const,
  player: "opponent" as const,
  visibility: "publicOnly" as const,
  onFailure: "failClosed" as const,
});

const selectCharacterTarget = (selection: SelectionId): SequenceSegment => ({
  connector: "always",
  saveResultAs: selection,
  effect: {
    type: "selectTargets",
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "opponent",
      zone: "characterArea",
      filter: { categories: ["character"] },
      min: 0,
      max: 1,
      allowFewerIfUnavailable: true,
      visibility: "public",
    },
  },
});

const revealAndSelectFromSet = (
  set: SelectionSetId,
  selection: SelectionId,
): SequenceSegment[] => [
  {
    connector: "always",
    saveResultAs: set,
    effect: {
      type: "revealTop",
      player: "self",
      count: 3,
      saveAs: set,
      visibility: "bothPlayers",
    },
  },
  {
    connector: "then",
    effect: {
      type: "selectFromSet",
      set,
      chooser: "self",
      min: 0,
      max: 1,
      saveAs: selection,
    },
  },
];

const withSaveResultKinds = (
  segment: SequenceSegment,
  saveResultKinds: readonly string[],
): SequenceSegment =>
  ({
    ...segment,
    saveResultKinds,
  }) as SequenceSegment;

test("explicit save-result metadata accepts every valid producer kind", () => {
  const hand = "saved-result:explicit-hand" as SelectionId;
  const trash = "saved-result:explicit-trash" as SelectionId;
  const donCards = "saved-result:explicit-don-cards" as SelectionId;
  const donTargets = "saved-result:explicit-don-targets" as SelectionId;
  const target = "saved-result:explicit-target" as SelectionId;
  const set = "saved-result:explicit-set" as SelectionSetId;
  const setSelection = "saved-result:explicit-set-selection" as SelectionId;
  const chosen = "saved-result:explicit-number" as SelectionId;
  const revealSet = revealAndSelectFromSet(set, setSelection)[0];
  assert.ok(revealSet);

  assertSupported([
    withSaveResultKinds(selectHand(hand), ["selectedCards:hand"]),
    withSaveResultKinds(selectTrash(trash), ["selectedCards:trash"]),
    withSaveResultKinds(selectCostAreaDonCards(donCards), [
      "selectedCards:don",
    ]),
    withSaveResultKinds(selectCostAreaDonTargets(donTargets), [
      "selectedTargets",
      "selectedCards:don",
    ]),
    withSaveResultKinds(selectCharacterTarget(target), ["selectedTargets"]),
    withSaveResultKinds(revealSet, ["selectedCards:set"]),
    {
      connector: "always",
      saveResultAs: "saved-result:explicit-paid-cost",
      saveResultKinds: ["paidCost"],
      effect: {
        type: "payCost",
        cost: { type: "restDon", count: 1, optional: true },
      },
    },
    {
      connector: "always",
      saveResultAs: "saved-result:explicit-draw",
      saveResultKinds: ["producedObjects"],
      effect: { type: "draw", player: "self", count: 1 },
    },
    {
      connector: "always",
      effect: {
        type: "chooseNumber",
        chooser: "self",
        purpose: "cost",
        min: 0,
        max: 10,
        saveAs: chosen,
      },
      saveResultKinds: ["chosenNumber"],
    },
  ]);
});

test("explicit save-result metadata rejects mismatched producer kinds", () => {
  const hand = "saved-result:explicit-wrong-hand" as SelectionId;
  const donTargets = "saved-result:explicit-wrong-don-targets" as SelectionId;

  assertUnsupported([
    withSaveResultKinds(selectCostAreaDonTargets(donTargets), [
      "selectedCards:don",
    ]),
  ]);
  assertUnsupported([
    withSaveResultKinds(selectCostAreaDonTargets(donTargets), [
      "selectedTargets",
    ]),
  ]);
  assertUnsupported([
    withSaveResultKinds(selectHand(hand), ["selectedCards:don"]),
  ]);
  assertUnsupported([
    withSaveResultKinds(selectHand(hand), ["selectedTargets"]),
  ]);
  assertUnsupported([
    withSaveResultKinds(
      {
        connector: "always",
        saveResultAs: "saved-result:explicit-draw-paid",
        effect: { type: "draw", player: "self", count: 1 },
      },
      ["paidCost"],
    ),
  ]);
  assertUnsupported([
    withSaveResultKinds(
      {
        connector: "always",
        saveResultAs: "saved-result:explicit-cost-produced",
        effect: {
          type: "payCost",
          cost: { type: "restDon", count: 1, optional: true },
        },
      },
      ["producedObjects"],
    ),
  ]);
  assertUnsupported([withSaveResultKinds(selectHand(hand), ["chosenNumber"])]);
});

test("selectedCards matrix accepts hand selection moved from hand", () => {
  const selection = "saved-result:hand-move" as SelectionId;

  assertSupported([
    selectHand(selection),
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: "hand",
        to: "deck",
        position: "bottom",
      },
    },
  ]);
});

test("selectedCards matrix accepts trash selection moved from trash", () => {
  const selection = "saved-result:trash-move" as SelectionId;

  assertSupported([
    selectTrash(selection),
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: "trash",
        to: "deck",
        position: "bottom",
      },
    },
  ]);
});

test("selectedCards matrix accepts selected DON cards attached to a saved field target", () => {
  const donSelection = "saved-result:don-cards" as SelectionId;
  const targetSelection = "saved-result:don-target" as SelectionId;

  assertSupported([
    selectCostAreaDonCards(donSelection),
    selectLeaderTarget(targetSelection),
    {
      connector: "then",
      effect: {
        type: "attachSelectedDon",
        selection: donSelection,
        target: savedLeaderOrCharacterTarget(targetSelection),
      },
    },
  ]);
});

test("selectedCards matrix accepts cost-area DON targets as attachable selected DON", () => {
  const donSelection = "saved-result:don-targets" as SelectionId;
  const targetSelection = "saved-result:leader-target" as SelectionId;

  assertSupported([
    selectCostAreaDonTargets(donSelection),
    selectLeaderTarget(targetSelection),
    {
      connector: "then",
      effect: {
        type: "attachSelectedDon",
        selection: donSelection,
        target: savedLeaderOrCharacterTarget(targetSelection),
      },
    },
  ]);
});

test("selectedCards matrix preserves selectedTargets capability on cost-area DON targets", () => {
  const donSelection = "saved-result:don-targets-dual" as SelectionId;

  assertSupported([
    selectCostAreaDonTargets(donSelection),
    {
      connector: "then",
      effect: {
        type: "activate",
        target: {
          type: "savedFieldObject",
          binding: {
            family: "selectedTargets",
            saveResultAs: donSelection,
          },
          zone: "costArea",
          player: "self",
          visibility: "publicOnly",
          onFailure: "failClosed",
        },
      },
    },
  ]);
});

test("selectedCards matrix accepts revealed set selection played from set", () => {
  const set = "saved-result:set-play" as SelectionSetId;
  const selection = "saved-result:set-play-selection" as SelectionId;

  assertSupported([
    ...revealAndSelectFromSet(set, selection),
    {
      connector: "then",
      effect: {
        type: "playSelected",
        selection,
        ignoreCost: true,
      },
    },
  ]);
});

test("selectedCards matrix accepts hand selection played from hand", () => {
  const selection = "saved-result:hand-play" as SelectionId;

  assertSupported([
    selectHand(selection),
    {
      connector: "then",
      effect: {
        type: "playSelected",
        selection,
        ignoreCost: true,
      },
    },
  ]);
});

test("selectedCards matrix accepts trash selection played from trash", () => {
  const selection = "saved-result:trash-play" as SelectionId;

  assertSupported([
    selectTrash(selection),
    {
      connector: "then",
      effect: {
        type: "playSelected",
        selection,
        ignoreCost: true,
      },
    },
  ]);
});

test("selectedCards matrix rejects DON selection played as a card", () => {
  const selection = "saved-result:don-play-rejected" as SelectionId;

  assertUnsupported([
    selectCostAreaDonCards(selection),
    {
      connector: "then",
      effect: {
        type: "playSelected",
        selection,
        ignoreCost: true,
      },
    },
  ]);
});

test("selectedCards matrix accepts hand selection activated as event", () => {
  const selection = "saved-result:hand-event" as SelectionId;

  assertSupported([
    selectHand(selection),
    {
      connector: "then",
      effect: {
        type: "activateSelectedEvent",
        selection,
        trigger: { type: "main" },
        ignoreCost: true,
      },
    },
  ]);
});

test("selectedCards matrix accepts hand selection reveal", () => {
  const selection = "saved-result:hand-reveal" as SelectionId;

  assertSupported([
    selectHand(selection),
    {
      connector: "then",
      effect: {
        type: "revealSelected",
        selection,
        visibility: "bothPlayers",
      },
    },
  ]);
});

test("selectedCards matrix accepts set selection reveal", () => {
  const set = "saved-result:set-reveal" as SelectionSetId;
  const selection = "saved-result:set-reveal-selection" as SelectionId;

  assertSupported([
    ...revealAndSelectFromSet(set, selection),
    {
      connector: "then",
      effect: {
        type: "revealSelected",
        selection,
        visibility: "bothPlayers",
      },
    },
  ]);
});

test("selectedCards matrix accepts trash selection moved to hand", () => {
  const selection = "saved-result:trash-to-hand" as SelectionId;

  assertSupported([
    selectTrash(selection),
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: "trash",
        to: "hand",
      },
    },
  ]);
});

test("selectedCards matrix accepts selectCards saveAs without segment saveResultAs", () => {
  const selection = "saved-result:effect-save-as-trash" as SelectionId;

  assertSupported([
    {
      connector: "always",
      effect: {
        type: "selectCards",
        player: "self",
        zone: "trash",
        chooser: "self",
        visibility: "bothPlayers",
        min: 0,
        max: 1,
        saveAs: selection,
      },
    },
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: "trash",
        to: "hand",
      },
    },
  ]);
});

test("selectedCards matrix accepts trashFromHand saveResultAs as hand selection", () => {
  const selection = "saved-result:trashed-hand-card" as SelectionId;

  assertSupported([
    {
      connector: "always",
      effect: { type: "draw", player: "self", count: 0 },
    },
    {
      connector: "then",
      saveResultAs: selection,
      effect: {
        type: "trashFromHand",
        player: "self",
        chooser: "self",
        count: 1,
      },
    },
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: "hand",
        to: "deck",
        position: "bottom",
      },
    },
  ]);
});

test("selectedCards matrix accepts set selection moved to hand", () => {
  const set = "saved-result:set-to-hand" as SelectionSetId;
  const selection = "saved-result:set-to-hand-selection" as SelectionId;

  assertSupported([
    ...revealAndSelectFromSet(set, selection),
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: set,
        to: "hand",
      },
    },
  ]);
});

test("selectedCards matrix accepts single hand selection moved to life", () => {
  const selection = "saved-result:hand-to-life" as SelectionId;

  assertSupported([
    selectHand(selection),
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: "hand",
        to: "life",
        position: "top",
      },
    },
  ]);
});

test("selectedCards matrix accepts trash selection moved to life", () => {
  const selection = "saved-result:trash-to-life" as SelectionId;

  assertSupported([
    selectTrash(selection),
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: "trash",
        to: "life",
        position: "bottom",
      },
    },
  ]);
});

test("selectedCards matrix accepts set selection moved to life", () => {
  const set = "saved-result:set-to-life" as SelectionSetId;
  const selection = "saved-result:set-to-life-selection" as SelectionId;

  assertSupported([
    ...revealAndSelectFromSet(set, selection),
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: set,
        to: "life",
        position: "bottom",
      },
    },
  ]);
});

test("selectedCards matrix rejects hand selection attached as DON", () => {
  const selection = "saved-result:hand-attach-rejected" as SelectionId;
  const targetSelection = "saved-result:hand-attach-target" as SelectionId;

  assertUnsupported([
    selectHand(selection),
    selectLeaderTarget(targetSelection),
    {
      connector: "then",
      effect: {
        type: "attachSelectedDon",
        selection,
        target: savedLeaderOrCharacterTarget(targetSelection),
      },
    },
  ]);
});

test("selectedCards matrix rejects DON selection moved as a hand card", () => {
  const selection = "saved-result:don-hand-move-rejected" as SelectionId;

  assertUnsupported([
    selectCostAreaDonCards(selection),
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: "hand",
        to: "deck",
        position: "bottom",
      },
    },
  ]);
});

test("selectedCards matrix rejects hand selection moved to hand", () => {
  const selection = "saved-result:hand-to-hand-rejected" as SelectionId;

  assertUnsupported([
    selectHand(selection),
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: "hand",
        to: "hand",
      },
    },
  ]);
});

test("selectedCards matrix rejects multi-card hand selection moved to life", () => {
  const selection = "saved-result:hand-to-life-multi-rejected" as SelectionId;

  assertUnsupported([
    selectHand(selection, 2),
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: "hand",
        to: "life",
        position: "top",
      },
    },
  ]);
});

test("selectedCards matrix rejects trash selection moved through hand-to-life path", () => {
  const selection = "saved-result:trash-hand-life-rejected" as SelectionId;

  assertUnsupported([
    selectTrash(selection),
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: "hand",
        to: "life",
        position: "top",
      },
    },
  ]);
});

test("selectedCards matrix rejects hand selection moved through trash-to-life path", () => {
  const selection = "saved-result:hand-trash-life-rejected" as SelectionId;

  assertUnsupported([
    selectHand(selection),
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection,
        from: "trash",
        to: "life",
        position: "bottom",
      },
    },
  ]);
});

test("selectedCards matrix rejects missing selectedCards reference", () => {
  assertUnsupported([
    {
      connector: "always",
      effect: {
        type: "moveSelected",
        selection: "saved-result:missing-selection" as SelectionId,
        from: "trash",
        to: "hand",
      },
    },
  ]);
});

test("selectedTargets matrix accepts saved target KO", () => {
  const selection = "saved-result:ko-target" as SelectionId;

  assertSupported([
    selectCharacterTarget(selection),
    {
      connector: "then",
      effect: {
        type: "ko",
        target: savedCharacterTarget(selection),
      },
    },
  ]);
});

test("selectedTargets matrix accepts saved target trash", () => {
  const selection = "saved-result:trash-target" as SelectionId;

  assertSupported([
    selectCharacterTarget(selection),
    {
      connector: "then",
      effect: {
        type: "trash",
        target: savedCharacterTarget(selection),
      },
    },
  ]);
});

test("selectedTargets matrix accepts saved target bounce", () => {
  const selection = "saved-result:bounce-target" as SelectionId;

  assertSupported([
    selectCharacterTarget(selection),
    {
      connector: "then",
      effect: {
        type: "bounce",
        target: savedCharacterTarget(selection),
        destination: "hand",
      },
    },
  ]);
});

test("selectedTargets matrix accepts saved target rest", () => {
  const selection = "saved-result:rest-target" as SelectionId;

  assertSupported([
    selectCharacterTarget(selection),
    {
      connector: "then",
      effect: {
        type: "rest",
        target: savedCharacterTarget(selection),
      },
    },
  ]);
});

test("selectedTargets matrix accepts saved target activation", () => {
  const selection = "saved-result:activate-target" as SelectionId;

  assertSupported([
    selectCharacterTarget(selection),
    {
      connector: "then",
      effect: {
        type: "activate",
        target: savedCharacterTarget(selection),
      },
    },
  ]);
});

test("selectedTargets matrix accepts saved target attack redirection", () => {
  const selection = "saved-result:attack-target" as SelectionId;

  assertSupported([
    selectCharacterTarget(selection),
    {
      connector: "then",
      effect: {
        type: "changeAttackTarget",
        target: savedCharacterTarget(selection),
      },
    },
  ]);
});

test("selectedTargets matrix accepts saved target power modification", () => {
  const selection = "saved-result:power-target" as SelectionId;

  assertSupported([
    selectCharacterTarget(selection),
    {
      connector: "then",
      effect: {
        type: "modifyPower",
        target: savedCharacterTarget(selection),
        value: 2000,
        duration: { type: "thisTurn" },
      },
    },
  ]);
});

test("selectedTargets matrix accepts saved target cost modification", () => {
  const selection = "saved-result:cost-target" as SelectionId;

  assertSupported([
    selectCharacterTarget(selection),
    {
      connector: "then",
      effect: {
        type: "modifyCost",
        player: "self",
        target: savedCharacterTarget(selection),
        value: -1,
        duration: { type: "thisTurn" },
      },
    },
  ]);
});

test("selectedTargets matrix accepts saved target base power set", () => {
  const selection = "saved-result:base-power-target" as SelectionId;

  assertSupported([
    selectCharacterTarget(selection),
    {
      connector: "then",
      effect: {
        type: "setBasePower",
        target: savedCharacterTarget(selection),
        value: 7000,
        duration: { type: "thisTurn" },
      },
    },
  ]);
});

test("selectedTargets matrix accepts selectAllTargets feeding forEachSavedTarget", () => {
  const selection = "saved-result:all-targets" as SelectionId;
  const current = "saved-result:current-target";

  assertSupported([
    {
      connector: "always",
      saveResultAs: selection,
      effect: {
        type: "selectAllTargets",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "opponent",
          zone: "characterArea",
          filter: { categories: ["character"] },
          visibility: "public",
        },
      },
    },
    {
      connector: "then",
      effect: {
        type: "forEachSavedTarget",
        selection,
        saveCurrentAs: current,
        effect: {
          type: "rest",
          target: savedCharacterTarget(current, "forEachSavedTarget"),
        },
      },
    },
  ]);
});

test("selectedTargets matrix carries nested sequence producers to later siblings", () => {
  const selection = "saved-result:nested-target" as SelectionId;

  assertSupported([
    {
      connector: "always",
      effect: {
        type: "sequence",
        effects: [selectCharacterTarget(selection)],
      },
    },
    {
      connector: "then",
      effect: {
        type: "rest",
        target: savedCharacterTarget(selection),
      },
    },
  ]);
});

test("selectedTargets matrix carries double-nested sequence producers to outer nested siblings", () => {
  const selection = "saved-result:double-nested-target" as SelectionId;

  assertSupported([
    {
      connector: "always",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "sequence",
              effects: [
                selectCharacterTarget(selection),
                {
                  connector: "then",
                  effect: {
                    type: "rest",
                    target: savedCharacterTarget(selection),
                  },
                },
              ],
            },
          },
          {
            connector: "then",
            effect: {
              type: "cannotBecomeActive",
              target: savedCharacterTarget(selection),
              duration: { type: "untilStartOfNextTurn", player: "opponent" },
            },
          },
        ],
      },
    },
  ]);
});

test("selectedTargets matrix accepts selectedCards owner constraints", () => {
  const ownerSelection = "saved-result:owner-card" as SelectionId;
  const targetSelection = "saved-result:owner-target" as SelectionId;

  assertSupported([
    selectTrash(ownerSelection),
    {
      connector: "then",
      saveResultAs: targetSelection,
      effect: {
        type: "selectTargets",
        ownerConstraint: {
          type: "sameAsSavedReferenceOwner",
          selection: ownerSelection,
        },
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "anyPlayer",
          zone: "characterArea",
          filter: { categories: ["character"] },
          min: 0,
          max: 1,
          allowFewerIfUnavailable: true,
          visibility: "public",
        },
      },
    },
  ]);
});

test("selectedTargets matrix accepts selectedTargets owner constraints", () => {
  const ownerSelection = "saved-result:owner-target-source" as SelectionId;
  const targetSelection = "saved-result:owner-target-target" as SelectionId;

  assertSupported([
    selectCharacterTarget(ownerSelection),
    {
      connector: "then",
      saveResultAs: targetSelection,
      effect: {
        type: "selectTargets",
        ownerConstraint: {
          type: "sameAsSavedReferenceOwner",
          selection: ownerSelection,
        },
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "anyPlayer",
          zone: "characterArea",
          filter: { categories: ["character"] },
          min: 0,
          max: 1,
          allowFewerIfUnavailable: true,
          visibility: "public",
        },
      },
    },
  ]);
});

test("selectedTargets matrix rejects missing savedFieldObject binding", () => {
  assertUnsupported([
    {
      connector: "always",
      effect: {
        type: "ko",
        target: savedCharacterTarget("saved-result:missing-target"),
      },
    },
  ]);
});

test("selectedTargets matrix rejects wrong savedFieldObject family", () => {
  const selection = "saved-result:wrong-family-target" as SelectionId;

  assertUnsupported([
    selectCharacterTarget(selection),
    {
      connector: "then",
      effect: {
        type: "ko",
        target: savedCharacterTarget(selection, "paidCost"),
      },
    },
  ]);
});

test("paidCost matrix accepts saved paid field cost as savedFieldObject target", () => {
  const paidCost = "saved-result:paid-field-cost";

  assertSupported([
    {
      connector: "always",
      saveResultAs: paidCost,
      effect: {
        type: "payCost",
        cost: {
          type: "restFromField",
          count: 1,
          chooser: "self",
          optional: true,
          filter: { categories: ["character"] },
        },
      },
    },
    {
      connector: "then",
      effect: {
        type: "ko",
        target: savedCharacterTarget(paidCost, "paidCost"),
      },
    },
  ]);
});

test("producedObjects matrix accepts draw produced object as savedFieldObject target", () => {
  const drawnObject = "saved-result:drawn-object";

  assertSupported([
    {
      connector: "always",
      saveResultAs: drawnObject,
      effect: {
        type: "draw",
        count: 1,
        player: "self",
      },
    },
    {
      connector: "then",
      effect: {
        type: "ko",
        target: savedCharacterTarget(drawnObject, "producedObjects"),
      },
    },
  ]);
});

test("producedObjects matrix accepts playSelected produced object as savedFieldObject target", () => {
  const selection = "saved-result:played-selection" as SelectionId;
  const playedObject = "saved-result:played-object";

  assertSupported([
    selectHand(selection),
    {
      connector: "then",
      saveResultAs: playedObject,
      effect: {
        type: "playSelected",
        selection,
        ignoreCost: true,
      },
    },
    {
      connector: "then",
      effect: {
        type: "ko",
        target: savedCharacterTarget(playedObject, "producedObjects"),
      },
    },
  ]);
});

test("producedObjects matrix accepts trigger card played seed as savedFieldObject target", () => {
  assertSupported([
    {
      connector: "always",
      effect: {
        type: "ko",
        target: savedCharacterTarget("trigger:cardPlayed", "producedObjects"),
      },
    },
  ]);
});

test("producedObjects matrix rejects missing producedObjects reference", () => {
  assertUnsupported([
    {
      connector: "always",
      effect: {
        type: "ko",
        target: savedCharacterTarget(
          "saved-result:missing-produced-object",
          "producedObjects",
        ),
      },
    },
  ]);
});

test("paidCost matrix rejects missing paidCost reference", () => {
  assertUnsupported([
    {
      connector: "always",
      effect: {
        type: "ko",
        target: savedCharacterTarget(
          "saved-result:missing-paid-cost",
          "paidCost",
        ),
      },
    },
  ]);
});

test("chosenNumber matrix accepts chooseNumber savedNumber in selectFromSet filter", () => {
  const numberSelection = "saved-result:number" as SelectionId;
  const set = "saved-result:number-set" as SelectionSetId;
  const cardSelection = "saved-result:number-card" as SelectionId;

  assertSupported([
    {
      connector: "always",
      effect: {
        type: "chooseNumber",
        chooser: "self",
        purpose: "number",
        min: 1,
        max: 4,
        saveAs: numberSelection,
      },
    },
    {
      connector: "then",
      effect: {
        type: "revealTop",
        player: "self",
        zone: "deck",
        count: 5,
        saveAs: set,
        visibility: "bothPlayers",
      },
    },
    {
      connector: "then",
      effect: {
        type: "selectFromSet",
        set,
        chooser: "self",
        min: 0,
        max: 1,
        filter: {
          statComparisons: [
            {
              stat: "cost",
              op: "lte",
              value: { type: "savedNumber", selection: numberSelection },
            },
          ],
        },
        saveAs: cardSelection,
      },
    },
  ]);
});

test("chosenNumber matrix accepts drawUpTo saved draw quantity in selectFromSet filter", () => {
  const numberSelection = "saved-result:draw-quantity" as SelectionId;
  const set = "saved-result:draw-quantity-set" as SelectionSetId;
  const cardSelection = "saved-result:draw-quantity-card" as SelectionId;
  const drawUpToEffect = {
    type: "drawUpTo",
    player: "self",
    count: 3,
    saveAs: numberSelection,
  } as Extract<Effect, { type: "drawUpTo" }> & { saveAs: SelectionId };

  assertSupported([
    {
      connector: "always",
      effect: drawUpToEffect,
    },
    {
      connector: "then",
      effect: {
        type: "revealTop",
        player: "self",
        zone: "deck",
        count: 5,
        saveAs: set,
        visibility: "bothPlayers",
      },
    },
    {
      connector: "then",
      effect: {
        type: "selectFromSet",
        set,
        chooser: "self",
        min: 0,
        max: 1,
        filter: {
          statComparisons: [
            {
              stat: "cost",
              op: "lte",
              value: { type: "savedNumber", selection: numberSelection },
            },
          ],
        },
        saveAs: cardSelection,
      },
    },
  ]);
});

test("remainder matrix accepts revealTop selection set for placeSetRemainder", () => {
  const set = "saved-result:remainder-set" as SelectionSetId;

  assertSupported([
    {
      connector: "always",
      effect: {
        type: "revealTop",
        player: "self",
        zone: "deck",
        count: 5,
        saveAs: set,
        visibility: "chooserOnly",
      },
    },
    {
      connector: "then",
      effect: {
        type: "placeSetRemainder",
        set,
        owner: "self",
        destination: "deck",
        position: "topOrBottom",
        order: "chooser",
      },
    },
  ]);
});

test("chosenNumber matrix rejects missing savedNumber reference", () => {
  const set = "saved-result:missing-number-set" as SelectionSetId;
  const cardSelection = "saved-result:missing-number-card" as SelectionId;

  assertUnsupported([
    {
      connector: "always",
      effect: {
        type: "revealTop",
        player: "self",
        zone: "deck",
        count: 5,
        saveAs: set,
        visibility: "bothPlayers",
      },
    },
    {
      connector: "then",
      effect: {
        type: "selectFromSet",
        set,
        chooser: "self",
        min: 0,
        max: 1,
        filter: {
          statComparisons: [
            {
              stat: "cost",
              op: "lte",
              value: {
                type: "savedNumber",
                selection: "saved-result:missing-number" as SelectionId,
              },
            },
          ],
        },
        saveAs: cardSelection,
      },
    },
  ]);
});

test("remainder matrix rejects missing selection set reference", () => {
  assertUnsupported([
    {
      connector: "always",
      effect: {
        type: "placeSetRemainder",
        set: "saved-result:missing-remainder-set" as SelectionSetId,
        owner: "self",
        destination: "deck",
        position: "topOrBottom",
        order: "chooser",
      },
    },
  ]);
});

test("composition matrix accepts nested sequence selectedCards for later sibling consumer", () => {
  const selection = "saved-result:nested-selected-card" as SelectionId;

  assertSupported([
    {
      connector: "always",
      effect: {
        type: "sequence",
        effects: [selectHand(selection)],
      },
    },
    {
      connector: "then",
      effect: {
        type: "playSelected",
        selection,
        ignoreCost: true,
      },
    },
  ]);
});

test("composition matrix accepts flattened sequence selectedTargets for later sibling consumer", () => {
  const selection = "saved-result:nested-selected-target" as SelectionId;

  assertSupported([
    {
      connector: "always",
      effect: {
        type: "sequence",
        effects: [selectCharacterTarget(selection)],
      },
    },
    {
      connector: "then",
      effect: {
        type: "rest",
        target: savedCharacterTarget(selection),
      },
    },
  ]);
});

test("composition matrix rejects conditional branch-local selectedCards leaking to outer siblings", () => {
  const selection = "saved-result:conditional-branch-card" as SelectionId;

  assertUnsupported([
    {
      connector: "always",
      effect: {
        type: "conditional",
        if: { type: "yourTurn" },
        then: {
          type: "sequence",
          effects: [selectHand(selection)],
        },
      },
    },
    {
      connector: "then",
      effect: {
        type: "playSelected",
        selection,
        ignoreCost: true,
      },
    },
  ]);
});

test("composition matrix accepts choice branches with independent saved references", () => {
  const handSelection = "saved-result:choice-hand-card" as SelectionId;
  const trashSelection = "saved-result:choice-trash-card" as SelectionId;

  assertSupported([
    {
      connector: "always",
      effect: {
        type: "choice",
        chooser: "self",
        min: 0,
        max: 1,
        options: [
          {
            id: "choice:hand",
            effect: {
              type: "sequence",
              effects: [
                selectHand(handSelection),
                {
                  connector: "then",
                  effect: {
                    type: "playSelected",
                    selection: handSelection,
                    ignoreCost: true,
                  },
                },
              ],
            },
          },
          {
            id: "choice:trash",
            effect: {
              type: "sequence",
              effects: [
                selectTrash(trashSelection),
                {
                  connector: "then",
                  effect: {
                    type: "moveSelected",
                    selection: trashSelection,
                    from: "trash",
                    to: "hand",
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ]);
});

test("composition matrix rejects merging saved references across choice branches", () => {
  const selection = "saved-result:choice-branch-card" as SelectionId;

  assertUnsupported([
    {
      connector: "always",
      effect: {
        type: "choice",
        chooser: "self",
        min: 0,
        max: 1,
        options: [
          {
            id: "choice:producer",
            effect: {
              type: "sequence",
              effects: [selectHand(selection)],
            },
          },
          {
            id: "choice:consumer",
            effect: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  effect: {
                    type: "playSelected",
                    selection,
                    ignoreCost: true,
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ]);
});
