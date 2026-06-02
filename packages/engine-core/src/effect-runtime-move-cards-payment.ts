import type { PaymentOption } from "@optcg/types";

export type MoveCardsPaymentOption = Extract<
  PaymentOption,
  { type: "moveCards" }
>;

export const isSupportedMoveCardsPaymentRoute = (
  option: MoveCardsPaymentOption,
): boolean => {
  if (option.from.player !== "self" || option.to.player !== "self") {
    return false;
  }
  if (
    option.from.zone === "trash" &&
    option.from.position === undefined &&
    option.to.zone === "deck" &&
    option.to.position === "bottom"
  ) {
    return true;
  }
  return (
    option.from.zone === "life" &&
    (option.from.position === "top" || option.from.position === "bottom") &&
    option.to.zone === "hand" &&
    option.to.position === undefined
  );
};
