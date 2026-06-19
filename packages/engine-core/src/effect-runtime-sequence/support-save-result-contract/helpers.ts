import assert from "node:assert/strict";

import type {
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  SelectionId,
  SelectionSetId,
  Target,
} from "@optcg/types";

import { isSupportedSequenceBlock } from "../support.js";

export type SequenceEffect = Extract<Effect, { type: "sequence" }>;
export type SequenceSegment = SequenceEffect["effects"][number];

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

export const assertSupported = (effects: SequenceSegment[]) => {
  assert.equal(
    isSupportedSequenceBlock(syntheticEntry(), block(effects)),
    true,
  );
};

export const assertUnsupported = (effects: SequenceSegment[]) => {
  assert.equal(
    isSupportedSequenceBlock(syntheticEntry(), block(effects)),
    false,
  );
};

export const selectHand = (
  selection: SelectionId,
  max = 1,
): SequenceSegment => ({
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

export const selectTrash = (selection: SelectionId): SequenceSegment => ({
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

export const selectDeck = (selection: SelectionId): SequenceSegment => ({
  connector: "always",
  saveResultAs: selection,
  effect: {
    type: "selectCards",
    player: "self",
    zone: "deck",
    chooser: "self",
    visibility: "chooserOnly",
    min: 0,
    max: 1,
    saveAs: selection,
  },
});

export const selectHandOrTrash = (
  selection: SelectionId,
  max = 2,
): SequenceSegment => ({
  connector: "always",
  saveResultAs: selection,
  effect: {
    type: "selectCards",
    player: "self",
    zones: ["hand", "trash"],
    chooser: "self",
    visibility: "chooserOnly",
    min: 0,
    max,
    saveAs: selection,
  },
});

export const selectCostAreaDonCards = (
  selection: SelectionId,
): SequenceSegment => ({
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

export const selectCostAreaDonTargets = (
  selection: SelectionId,
): SequenceSegment => ({
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

export const selectLeaderTarget = (
  selection: SelectionId,
): SequenceSegment => ({
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

export const savedLeaderOrCharacterTarget = (
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

export const savedCharacterTarget = (
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

export const selectCharacterTarget = (
  selection: SelectionId,
): SequenceSegment => ({
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

export const revealAndSelectFromSet = (
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

export const withSaveResultKinds = (
  segment: SequenceSegment,
  saveResultKinds: readonly string[],
): SequenceSegment =>
  ({
    ...segment,
    saveResultKinds,
  }) as SequenceSegment;
