import type { Effect, SelectCardsEffect, Target } from "@optcg/types";

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
export type PlaceSetRemainderEffect = Extract<
  Effect,
  { type: "placeSetRemainder" }
>;

export const isSupportedSequenceSelectCardsSegment = (
  effect: SequenceSegmentEffect,
): effect is SelectCardsEffect =>
  effect.type === "selectCards" &&
  isSupportedHandSelectionCardFilter(effect.filter) &&
  Number.isInteger(effect.min) &&
  Number.isInteger(effect.max) &&
  effect.min >= 0 &&
  effect.max >= effect.min &&
  ((effect.zone === "hand" &&
    effect.player === effect.chooser &&
    (effect.player === "self" || effect.player === "opponent") &&
    effect.visibility === "chooserOnly" &&
    String(effect.saveAs).startsWith("handSelection:")) ||
    (effect.zone === "trash" &&
      effect.player === "self" &&
      effect.chooser === "self" &&
      effect.visibility === "bothPlayers" &&
      String(effect.saveAs).startsWith("trashSelection:")) ||
    (effect.zone === "costArea" &&
      effect.player === "self" &&
      effect.chooser === "self" &&
      effect.visibility === "bothPlayers" &&
      String(effect.saveAs).startsWith("donSelection:")));

export const isSupportedTrashToHandMoveSelectedSegment = (
  effect: SequenceSegmentEffect,
): effect is MoveSelectedEffect =>
  effect.type === "moveSelected" &&
  ((effect.from === "trash" &&
    effect.to === "hand" &&
    effect.position === undefined &&
    effect.destinationFaceUp === undefined &&
    String(effect.selection).startsWith("trashSelection:")) ||
    (effect.from === "trash" &&
      effect.to === "life" &&
      effect.position === "top" &&
      String(effect.selection).startsWith("trashSelection:")) ||
    (effect.from === "hand" &&
      effect.to === "deck" &&
      (effect.position === "top" ||
        effect.position === "bottom" ||
        effect.position === "topOrBottom") &&
      effect.destinationFaceUp === undefined &&
      String(effect.selection).startsWith("handSelection:")));

export const isSupportedAttachSelectedDonSegment = (
  effect: SequenceSegmentEffect,
): effect is AttachSelectedDonEffect =>
  effect.type === "attachSelectedDon" &&
  String(effect.selection).startsWith("donSelection:") &&
  effect.target.type === "savedFieldObject" &&
  effect.target.player === "self" &&
  ((effect.target.zone === "characterArea" &&
    effect.target.zones === undefined) ||
    (effect.target.zone === undefined &&
      effect.target.zones?.every(
        (zone) => zone === "leaderArea" || zone === "characterArea",
      ) === true)) &&
  effect.target.controller === undefined &&
  effect.target.binding.family === "selectedTargets" &&
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
  effect.player === "self" &&
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
): effect is SelectFromSetEffect =>
  effect.type === "selectFromSet" &&
  effect.chooser === "self" &&
  Number.isInteger(effect.min) &&
  Number.isInteger(effect.max) &&
  effect.min >= 0 &&
  effect.max >= effect.min &&
  isSupportedHandSelectionCardFilter(effect.filter);

export const isSupportedPlaceSetRemainderSegment = (
  effect: SequenceSegmentEffect,
): effect is PlaceSetRemainderEffect =>
  effect.type === "placeSetRemainder" &&
  effect.owner === "self" &&
  effect.destination === "deck" &&
  (effect.position === "bottom" || effect.position === "top") &&
  (effect.order === "chooser" || effect.order === "original");

export type SavedFieldObjectSelectionTarget = Extract<
  Target,
  { type: "savedFieldObject" }
>;
