import type { Effect } from "@optcg/types";

import { isSupportedMoveCardsEffect } from "../../effect-runtime-move-cards.js";
import { isSupportedPlaceTopDeckCardsEffect } from "../../effect-runtime-top-deck-placement.js";
import { isSupportedDamageEffect } from "../../runtime/primitives/execute.js";
import { isSupportedTrashFromHandUntilCountBody } from "../../runtime/primitives/trash-from-hand-until.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type SequenceSegmentEffect = SequenceEffect["effects"][number]["effect"];

export type DrawEffect = Extract<Effect, { type: "draw" }>;
export type DrawUpToEffect = Extract<Effect, { type: "drawUpTo" }>;
export type DamageEffect = Extract<Effect, { type: "damage" }>;
export type MoveCardsEffect = Extract<Effect, { type: "moveCards" }>;
export type ReturnDonEffect = Extract<Effect, { type: "returnDon" }>;
export type ReorderLifeEffect = Extract<Effect, { type: "reorderLife" }>;
export type SetLifeFaceUpEffect = Extract<Effect, { type: "setLifeFaceUp" }>;
export type TrashFromHandEffect = Extract<Effect, { type: "trashFromHand" }>;
export type TrashFromHandUntilCountEffect = Extract<
  Effect,
  { type: "trashFromHandUntilCount" }
>;
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

export const isSupportedTrashFromHandUntilCountSegment = (
  effect: SequenceSegmentEffect,
): effect is TrashFromHandUntilCountEffect =>
  effect.type === "trashFromHandUntilCount" &&
  isSupportedTrashFromHandUntilCountBody(effect);

export const isSupportedMoveCardsSegment = (
  effect: SequenceSegmentEffect,
): effect is MoveCardsEffect =>
  effect.type === "moveCards" && isSupportedMoveCardsEffect(effect);

export const isSupportedDamageSegment = (
  effect: SequenceSegmentEffect,
): effect is DamageEffect =>
  effect.type === "damage" && isSupportedDamageEffect(effect);

export const isSupportedReturnDonSegment = (
  effect: SequenceSegmentEffect,
): effect is ReturnDonEffect =>
  effect.type === "returnDon" &&
  effect.player === "opponent" &&
  Number.isInteger(effect.count) &&
  effect.count > 0;

export const isSupportedReorderLifeSegment = (
  effect: SequenceSegmentEffect,
): effect is ReorderLifeEffect =>
  effect.type === "reorderLife" &&
  effect.player === "opponent" &&
  effect.viewer === "self";

export const isSupportedSetLifeFaceUpSegment = (
  effect: SequenceSegmentEffect,
): effect is SetLifeFaceUpEffect =>
  effect.type === "setLifeFaceUp" && effect.player === "self" && !effect.faceUp;

export const isSupportedPlaceTopDeckCardsSegment = (
  effect: SequenceSegmentEffect,
): effect is PlaceTopDeckCardsEffect =>
  effect.type === "placeTopDeckCards" &&
  isSupportedPlaceTopDeckCardsEffect(effect);
