import type { DynamicNumberValue, Effect } from "@optcg/types";

import { isSupportedMoveCardsEffect } from "../../effect-runtime-move-cards.js";
import { isSupportedMoveMatchingLifeCardsEffect } from "../matching-life-cards.js";
import { isSupportedPlaceTopDeckCardsEffect } from "../../effect-runtime-top-deck-placement.js";
import { isSupportedDamageEffect } from "../../runtime/primitives/execute.js";
import { isSupportedTrashFromHandUntilCountBody } from "../../runtime/primitives/trash-from-hand-until.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type SequenceSegmentEffect = SequenceEffect["effects"][number]["effect"];

export type DrawEffect = Extract<Effect, { type: "draw" }>;
export type DrawUpToEffect = Extract<Effect, { type: "drawUpTo" }>;
export type DamageEffect = Extract<Effect, { type: "damage" }>;
export type MoveCardsEffect = Extract<Effect, { type: "moveCards" }>;
export type MoveMatchingLifeCardsEffect = Extract<
  Effect,
  { type: "moveMatchingLifeCards" }
>;
export type ReturnDonEffect = Extract<Effect, { type: "returnDon" }>;
export type ReorderLifeEffect = Extract<Effect, { type: "reorderLife" }>;
export type MoveLifeToDeckTopAndReorderRestEffect = Extract<
  Effect,
  { type: "moveLifeToDeckTopAndReorderRest" }
>;
export type PlaceTopLifeCardEffect = Extract<
  Effect,
  { type: "placeTopLifeCard" }
>;
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
export type ShuffleDeckEffect = Extract<Effect, { type: "shuffleDeck" }>;
export type TakeExtraTurnEffect = Extract<Effect, { type: "takeExtraTurn" }>;
export type RevealFromZoneEffect = Extract<Effect, { type: "revealFromZone" }>;

const isSupportedFieldCountValue = (
  count: number | DynamicNumberValue,
): boolean =>
  typeof count === "object" &&
  count.type === "countMatchingFieldCards" &&
  (count.player === "self" || count.player === "opponent") &&
  Number.isSafeInteger(count.multiplier) &&
  count.multiplier >= 0 &&
  count.filter.categories?.includes("character") === true;

const isSupportedFieldCountDifferenceValue = (
  count: number | DynamicNumberValue,
): boolean =>
  typeof count === "object" &&
  count.type === "fieldCountDifference" &&
  (count.minuend.player === "self" || count.minuend.player === "opponent") &&
  (count.subtrahend.player === "self" ||
    count.subtrahend.player === "opponent") &&
  count.minuend.filter?.categories?.includes("don") === true &&
  count.subtrahend.filter?.categories?.includes("don") === true &&
  (count.minimum === undefined || Number.isSafeInteger(count.minimum));

const isSupportedSegmentCount = (
  count: number | DynamicNumberValue,
  options: { positive: boolean },
): boolean =>
  typeof count === "number"
    ? Number.isInteger(count) && (options.positive ? count > 0 : count >= 0)
    : isSupportedFieldCountValue(count) ||
      isSupportedFieldCountDifferenceValue(count);

const isSupportedDrawCount = (count: number | DynamicNumberValue): boolean =>
  isSupportedSegmentCount(count, { positive: false }) ||
  (typeof count === "object" && count.type === "savedNumber");

export const isSupportedDrawSegment = (
  effect: SequenceSegmentEffect,
): effect is DrawEffect =>
  effect.type === "draw" &&
  (effect.player === "self" || effect.player === "opponent") &&
  isSupportedDrawCount(effect.count);

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
  (effect.chooser === "self" || effect.chooser === "opponent") &&
  effect.filter === undefined &&
  isSupportedSegmentCount(effect.count, { positive: true }) &&
  (effect.min === undefined ||
    (typeof effect.count === "number" &&
      Number.isInteger(effect.min) &&
      effect.min >= 0 &&
      effect.min <= effect.count));

export const isSupportedTrashFromHandUntilCountSegment = (
  effect: SequenceSegmentEffect,
): effect is TrashFromHandUntilCountEffect =>
  effect.type === "trashFromHandUntilCount" &&
  isSupportedTrashFromHandUntilCountBody(effect);

export const isSupportedMoveCardsSegment = (
  effect: SequenceSegmentEffect,
): effect is MoveCardsEffect =>
  effect.type === "moveCards" && isSupportedMoveCardsEffect(effect);

export const isSupportedMoveMatchingLifeCardsSegment = (
  effect: SequenceSegmentEffect,
): effect is MoveMatchingLifeCardsEffect =>
  effect.type === "moveMatchingLifeCards" &&
  isSupportedMoveMatchingLifeCardsEffect(effect);

export const isSupportedDamageSegment = (
  effect: SequenceSegmentEffect,
): effect is DamageEffect =>
  effect.type === "damage" && isSupportedDamageEffect(effect);

export const isSupportedReturnDonSegment = (
  effect: SequenceSegmentEffect,
): effect is ReturnDonEffect =>
  effect.type === "returnDon" &&
  (effect.player === "self" || effect.player === "opponent") &&
  isSupportedSegmentCount(effect.count, { positive: true });

export const isSupportedReorderLifeSegment = (
  effect: SequenceSegmentEffect,
): effect is ReorderLifeEffect =>
  effect.type === "reorderLife" &&
  (effect.player === "self" || effect.player === "opponent") &&
  effect.viewer === "self";

export const isSupportedMoveLifeToDeckTopAndReorderRestSegment = (
  effect: SequenceSegmentEffect,
): effect is MoveLifeToDeckTopAndReorderRestEffect =>
  effect.type === "moveLifeToDeckTopAndReorderRest" &&
  (effect.player === "self" || effect.player === "opponent") &&
  effect.viewer === "self";

export const isSupportedPlaceTopLifeCardSegment = (
  effect: SequenceSegmentEffect,
): effect is PlaceTopLifeCardEffect =>
  effect.type === "placeTopLifeCard" &&
  effect.viewer === "self" &&
  effect.players.length > 0 &&
  effect.players.every((player) => player === "self" || player === "opponent");

export const isSupportedSetLifeFaceUpSegment = (
  effect: SequenceSegmentEffect,
): effect is SetLifeFaceUpEffect =>
  effect.type === "setLifeFaceUp" && effect.player === "self" && !effect.faceUp;

export const isSupportedPlaceTopDeckCardsSegment = (
  effect: SequenceSegmentEffect,
): effect is PlaceTopDeckCardsEffect =>
  effect.type === "placeTopDeckCards" &&
  isSupportedPlaceTopDeckCardsEffect(effect);

export const isSupportedShuffleDeckSegment = (
  effect: SequenceSegmentEffect,
): effect is ShuffleDeckEffect =>
  effect.type === "shuffleDeck" &&
  (effect.player === "self" || effect.player === "opponent");

export const isSupportedTakeExtraTurnSegment = (
  effect: SequenceSegmentEffect,
): effect is TakeExtraTurnEffect =>
  effect.type === "takeExtraTurn" &&
  (effect.player === "self" || effect.player === "opponent");

export const isSupportedRevealFromZoneSegment = (
  effect: SequenceSegmentEffect,
): effect is RevealFromZoneEffect =>
  effect.type === "revealFromZone" &&
  (effect.player === "self" || effect.player === "opponent") &&
  effect.zone === "hand" &&
  effect.count === undefined &&
  effect.filter === undefined &&
  effect.to === "bothPlayers";
