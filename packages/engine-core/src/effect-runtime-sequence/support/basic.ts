import type { Effect } from "@optcg/types";

import { isSupportedMoveCardsEffect } from "../../effect-runtime-move-cards.js";
import { isSupportedPlaceTopDeckCardsEffect } from "../../effect-runtime-top-deck-placement.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type SequenceSegmentEffect = SequenceEffect["effects"][number]["effect"];

export type DrawEffect = Extract<Effect, { type: "draw" }>;
export type DrawUpToEffect = Extract<Effect, { type: "drawUpTo" }>;
export type MoveCardsEffect = Extract<Effect, { type: "moveCards" }>;
export type ReturnDonEffect = Extract<Effect, { type: "returnDon" }>;
export type TrashFromHandEffect = Extract<Effect, { type: "trashFromHand" }>;
export type PlaceTopDeckCardsEffect = Extract<
  Effect,
  { type: "placeTopDeckCards" }
>;

export const isSupportedDrawSegment = (
  effect: SequenceSegmentEffect,
): effect is DrawEffect =>
  effect.type === "draw" &&
  effect.player === "self" &&
  Number.isInteger(effect.count) &&
  effect.count >= 0;

export const isSupportedDrawUpToSegment = (
  effect: SequenceSegmentEffect,
): effect is DrawUpToEffect =>
  effect.type === "drawUpTo" &&
  effect.player === "self" &&
  Number.isInteger(effect.count) &&
  effect.count >= 0;

export const isSupportedTrashFromHandSegment = (
  effect: SequenceSegmentEffect,
): effect is TrashFromHandEffect =>
  effect.type === "trashFromHand" &&
  (effect.player === "self" || effect.player === "opponent") &&
  effect.chooser === effect.player &&
  effect.filter === undefined &&
  Number.isInteger(effect.count) &&
  effect.count > 0;

export const isSupportedMoveCardsSegment = (
  effect: SequenceSegmentEffect,
): effect is MoveCardsEffect =>
  effect.type === "moveCards" && isSupportedMoveCardsEffect(effect);

export const isSupportedReturnDonSegment = (
  effect: SequenceSegmentEffect,
): effect is ReturnDonEffect =>
  effect.type === "returnDon" &&
  effect.player === "opponent" &&
  Number.isInteger(effect.count) &&
  effect.count > 0;

export const isSupportedPlaceTopDeckCardsSegment = (
  effect: SequenceSegmentEffect,
): effect is PlaceTopDeckCardsEffect =>
  effect.type === "placeTopDeckCards" &&
  isSupportedPlaceTopDeckCardsEffect(effect);
