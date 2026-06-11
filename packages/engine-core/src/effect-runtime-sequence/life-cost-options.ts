import type {
  EffectQueueEntry,
  GameState,
  OptionalPayCostDecision,
} from "@optcg/types";

export type TurnLifeFaceUpPaymentOption = Extract<
  OptionalPayCostDecision["paymentOptions"][number],
  { type: "turnLifeFaceUp" }
>;

export type SetLifeFaceUpPaymentOption = Extract<
  OptionalPayCostDecision["paymentOptions"][number],
  { type: "setLifeFaceUp" }
>;

export type LifeFaceUpPaymentOption =
  | TurnLifeFaceUpPaymentOption
  | SetLifeFaceUpPaymentOption;

export const canSetLifeFaceUp = (
  player: NonNullable<GameState["players"][EffectQueueEntry["controllerId"]]>,
  option: LifeFaceUpPaymentOption,
): boolean => {
  if (
    option.player !== "self" ||
    !Number.isInteger(option.count) ||
    option.count <= 0
  ) {
    return false;
  }
  const selected =
    option.position === "top"
      ? player.life.slice(0, option.count)
      : player.life.slice(Math.max(0, player.life.length - option.count));
  return (
    selected.length === option.count &&
    selected.every((lifeCard) => lifeCard.faceUp !== targetLifeFaceUp(option))
  );
};

export const turnLifeFaceUpPaymentOption = (
  cost: Extract<OptionalPayCostDecision["cost"], { type: "turnLifeFaceUp" }>,
): TurnLifeFaceUpPaymentOption => ({
  id: `turnLifeFaceUp:${cost.position}`,
  type: "turnLifeFaceUp",
  count: cost.count,
  player: cost.player,
  position: cost.position,
});

export const setLifeFaceUpPaymentOption = (
  cost: Extract<OptionalPayCostDecision["cost"], { type: "setLifeFaceUp" }>,
): SetLifeFaceUpPaymentOption => ({
  id: `setLifeFaceUp:${cost.position}:${String(cost.faceUp)}`,
  type: "setLifeFaceUp",
  count: cost.count,
  player: cost.player,
  position: cost.position,
  faceUp: cost.faceUp,
});

const targetLifeFaceUp = (option: LifeFaceUpPaymentOption): boolean =>
  option.type === "turnLifeFaceUp" ? true : option.faceUp;
