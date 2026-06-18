import type {
  Effect,
  CardFilter,
  SavedFieldObjectTargetBinding,
  SelectCardsEffect,
  SelectTargetsEffect,
  Target,
} from "@optcg/types";

import { isSupportedHandSelectionCardFilter } from "../../actions/state.js";
import { isSupportedAttachDonTargetFilter } from "../support-filters.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type SequenceSegmentEffect = SequenceEffect["effects"][number]["effect"];

export type MoveSelectedEffect = Extract<Effect, { type: "moveSelected" }>;
export type AttachSelectedDonEffect = Extract<
  Effect,
  { type: "attachSelectedDon" }
>;
export type PlaySourceEffect = Extract<Effect, { type: "playSource" }>;
export type RevealTopEffect = Extract<Effect, { type: "revealTop" }>;
export type SelectFromSetEffect = Extract<Effect, { type: "selectFromSet" }>;
export type ChooseNumberEffect = Extract<Effect, { type: "chooseNumber" }>;
export type RevealSelectedEffect = Extract<Effect, { type: "revealSelected" }>;
export type PlaceSetRemainderEffect = Extract<
  Effect,
  { type: "placeSetRemainder" }
>;
export type SavedSelectedCardsKind =
  | "hand"
  | "deck"
  | "trash"
  | "life"
  | "don"
  | "set";

const zoneNames = new Set<string>([
  "hand",
  "deck",
  "trash",
  "life",
  "costArea",
  "characterArea",
  "stageArea",
  "leaderArea",
  "donDeck",
  "noZone",
]);

const isSelectionSetSource = (source: MoveSelectedEffect["from"]): boolean =>
  !zoneNames.has(source);

export const savedSelectedCardsKindForSelectCardsSegment = (
  effect: SequenceSegmentEffect,
): SavedSelectedCardsKind | undefined => {
  if (
    effect.type !== "selectCards" ||
    !isSupportedHandSelectionCardFilter(effect.filter) ||
    !Number.isInteger(effect.min) ||
    !Number.isInteger(effect.max) ||
    effect.min < 0 ||
    effect.max < effect.min
  ) {
    return undefined;
  }
  if (
    effect.zone === "hand" &&
    effect.player === effect.chooser &&
    (effect.player === "self" || effect.player === "opponent") &&
    (effect.visibility === "chooserOnly" || effect.visibility === "bothPlayers")
  ) {
    return "hand";
  }
  if (
    effect.zone === "deck" &&
    effect.player === effect.chooser &&
    effect.player === "self" &&
    effect.visibility === "chooserOnly"
  ) {
    return "deck";
  }
  if (
    effect.zone === "trash" &&
    (effect.player === "self" || effect.player === "opponent") &&
    (effect.chooser === "self" || effect.chooser === "opponent") &&
    effect.visibility === "bothPlayers"
  ) {
    return "trash";
  }
  if (
    effect.zone === "life" &&
    (effect.player === "self" || effect.player === "opponent") &&
    (effect.chooser === "self" || effect.chooser === "opponent") &&
    effect.visibility === "chooserOnly"
  ) {
    return "life";
  }
  if (
    effect.zone === "costArea" &&
    (effect.player === "self" || effect.player === "opponent") &&
    effect.chooser === "self" &&
    effect.visibility === "bothPlayers"
  ) {
    return "don";
  }
  return undefined;
};

export const isSupportedSequenceSelectCardsSegment = (
  effect: SequenceSegmentEffect,
  canConsumeSavedFieldObject: (
    binding: SavedFieldObjectTargetBinding,
  ) => boolean = () => false,
): effect is SelectCardsEffect =>
  effect.type === "selectCards" &&
  savedSelectedCardsKindForSelectCardsSegment(effect) !== undefined &&
  hasSupportedSavedColorRelations(effect.filter, canConsumeSavedFieldObject);

const hasSupportedSavedColorRelations = (
  filter: CardFilter | undefined,
  canConsumeSavedFieldObject: (
    binding: SavedFieldObjectTargetBinding,
  ) => boolean,
): boolean => {
  if (filter === undefined) {
    return true;
  }
  if (
    filter.anyOf?.every((candidate) =>
      hasSupportedSavedColorRelations(candidate, canConsumeSavedFieldObject),
    ) === false
  ) {
    return false;
  }
  const relation = filter.colorRelation;
  return relation === undefined || canConsumeSavedFieldObject(relation.binding);
};

export const savedSelectedCardsKindForSelectTargetsSegment = (
  effect: SequenceSegmentEffect,
): SavedSelectedCardsKind | undefined => {
  if (effect.type !== "selectTargets") {
    return undefined;
  }
  const request: SelectTargetsEffect["request"] = effect.request;
  const zones = "zones" in request ? request.zones : [request.zone];
  const selectsCostAreaDon =
    request.chooser === "self" &&
    (request.player === "self" ||
      request.player === "opponent" ||
      request.player === "anyPlayer") &&
    zones.length > 0 &&
    zones.every((zone) => zone === "costArea") &&
    request.visibility === "public" &&
    request.filter?.categories?.length === 1 &&
    request.filter.categories[0] === "don";
  return selectsCostAreaDon ? "don" : undefined;
};

export const isSupportedMoveSelectedSegment = (
  effect: SequenceSegmentEffect,
  selectionKind?: SavedSelectedCardsKind,
  selectionMax?: number,
  hasSourceSet = false,
): effect is MoveSelectedEffect =>
  effect.type === "moveSelected" &&
  ((effect.from === "trash" &&
    effect.to === "hand" &&
    effect.position === undefined &&
    effect.destinationFaceUp === undefined &&
    selectionKind === "trash") ||
    (effect.from === "trash" &&
      effect.to === "life" &&
      (effect.position === "top" || effect.position === "bottom") &&
      selectionKind === "trash") ||
    (effect.from === "trash" &&
      effect.to === "deck" &&
      effect.position === "bottom" &&
      effect.destinationFaceUp === undefined &&
      selectionKind === "trash") ||
    (effect.from === "life" &&
      effect.to === "trash" &&
      effect.position === undefined &&
      effect.destinationFaceUp === undefined &&
      selectionKind === "life") ||
    (effect.from === "hand" &&
      effect.to === "deck" &&
      (effect.position === "top" ||
        effect.position === "bottom" ||
        effect.position === "topOrBottom") &&
      effect.destinationFaceUp === undefined &&
      selectionKind === "hand") ||
    (effect.from === "hand" &&
      effect.to === "life" &&
      (effect.position === "top" || effect.position === "bottom") &&
      (effect.destinationFaceUp === undefined ||
        typeof effect.destinationFaceUp === "boolean") &&
      selectionKind === "hand" &&
      selectionMax === 1) ||
    (isSelectionSetSource(effect.from) &&
      effect.to === "hand" &&
      effect.position === undefined &&
      effect.destinationFaceUp === undefined &&
      selectionKind === "set" &&
      hasSourceSet) ||
    (isSelectionSetSource(effect.from) &&
      effect.to === "life" &&
      (effect.position === "top" || effect.position === "bottom") &&
      (effect.destinationFaceUp === undefined ||
        typeof effect.destinationFaceUp === "boolean") &&
      selectionKind === "set" &&
      hasSourceSet));

export const isSupportedAttachSelectedDonSegment = (
  effect: SequenceSegmentEffect,
  selectionKind?: SavedSelectedCardsKind,
): effect is AttachSelectedDonEffect =>
  effect.type === "attachSelectedDon" &&
  selectionKind === "don" &&
  effect.target.type === "savedFieldObject" &&
  (effect.target.player === "self" ||
    effect.target.player === "opponent" ||
    effect.target.player === "anyPlayer") &&
  (((effect.target.zone === "leaderArea" ||
    effect.target.zone === "characterArea") &&
    effect.target.zones === undefined) ||
    (effect.target.zone === undefined &&
      effect.target.zones?.every(
        (zone) => zone === "leaderArea" || zone === "characterArea",
      ) === true)) &&
  effect.target.controller === undefined &&
  (effect.target.binding.family === "selectedTargets" ||
    effect.target.binding.family === "forEachSavedTarget") &&
  isSupportedAttachDonTargetFilter(effect.target.filter);

export const isSupportedPlaySourceSegment = (
  effect: SequenceSegmentEffect,
): effect is PlaySourceEffect =>
  effect.type === "playSource" &&
  effect.source.type === "triggerCard" &&
  effect.ignoreCost === true;

export const isSupportedRevealTopSegment = (
  effect: SequenceSegmentEffect,
): effect is RevealTopEffect =>
  effect.type === "revealTop" &&
  (effect.player === "self" || effect.player === "opponent") &&
  (effect.zone === undefined ||
    effect.zone === "deck" ||
    effect.zone === "life") &&
  (effect.visibility === "bothPlayers" ||
    effect.visibility === "chooserOnly") &&
  Number.isInteger(effect.count) &&
  effect.count > 0 &&
  (effect.min === undefined ||
    (Number.isInteger(effect.min) &&
      effect.min >= 0 &&
      effect.min <= effect.count));

export const isSupportedSelectFromSetSegment = (
  effect: SequenceSegmentEffect,
  hasSavedNumber: (selection: string) => boolean = () => false,
): effect is SelectFromSetEffect =>
  effect.type === "selectFromSet" &&
  effect.chooser === "self" &&
  Number.isInteger(effect.min) &&
  Number.isInteger(effect.max) &&
  effect.min >= 0 &&
  effect.max >= effect.min &&
  isSupportedHandSelectionCardFilter(effect.filter) &&
  hasSupportedSavedNumberFilterReferences(effect.filter, hasSavedNumber);

export const isSupportedChooseNumberSegment = (
  effect: SequenceSegmentEffect,
): effect is ChooseNumberEffect =>
  effect.type === "chooseNumber" &&
  effect.chooser === "self" &&
  Number.isInteger(effect.min) &&
  Number.isInteger(effect.max) &&
  effect.min >= 0 &&
  effect.max >= effect.min;

const hasSupportedSavedNumberFilterReferences = (
  filter: SelectFromSetEffect["filter"],
  hasSavedNumber: (selection: string) => boolean,
): boolean => {
  if (filter === undefined) {
    return true;
  }
  if (
    filter.anyOf?.every((candidate) =>
      hasSupportedSavedNumberFilterReferences(candidate, hasSavedNumber),
    ) === false
  ) {
    return false;
  }
  return (
    filter.statComparisons?.every((comparison) => {
      return (
        comparison.value.type === "savedNumber" &&
        hasSavedNumber(String(comparison.value.selection))
      );
    }) ?? true
  );
};

export const isSupportedRevealSelectedSegment = (
  effect: SequenceSegmentEffect,
): effect is RevealSelectedEffect =>
  effect.type === "revealSelected" &&
  (effect.visibility === "bothPlayers" || effect.visibility === "chooserOnly");

export const isSupportedPlaceSetRemainderSegment = (
  effect: SequenceSegmentEffect,
): effect is PlaceSetRemainderEffect =>
  effect.type === "placeSetRemainder" &&
  effect.owner === "self" &&
  ((effect.destination === "deck" &&
    (((effect.position === "bottom" || effect.position === "top") &&
      (effect.order === "chooser" || effect.order === "original")) ||
      (effect.position === "topOrBottom" && effect.order === "chooser"))) ||
    (effect.destination === "trash" &&
      effect.position === "bottom" &&
      effect.order === "original"));

export type SavedFieldObjectSelectionTarget = Extract<
  Target,
  { type: "savedFieldObject" }
>;
