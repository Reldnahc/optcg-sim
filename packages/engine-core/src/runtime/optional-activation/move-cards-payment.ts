import type {
  CardInstance,
  InstanceId,
  PaymentOption,
  PlayerState,
} from "@optcg/types";

type MoveCardsPaymentOption = Extract<PaymentOption, { type: "moveCards" }>;

export const selectedCountSatisfiesMoveCardsPayment = (
  selectedCount: number,
  option: MoveCardsPaymentOption,
): boolean => {
  if (option.maxCount === "available") {
    return selectedCount >= Math.max(1, option.count);
  }
  if (typeof option.maxCount === "number") {
    return selectedCount >= option.count && selectedCount <= option.maxCount;
  }
  return selectedCount === option.count;
};

export const selectedMoveCardsPaymentCards = (
  player: PlayerState,
  option: MoveCardsPaymentOption,
  selected: readonly InstanceId[],
): CardInstance[] | undefined => {
  const selectedCards = selected.map((selectedId) =>
    moveCardsPaymentCandidates(player, option).find(
      (candidate) => candidate.instanceId === selectedId,
    ),
  );
  return selectedCards.every((card): card is CardInstance => card !== undefined)
    ? selectedCards
    : undefined;
};

const moveCardsPaymentCandidates = (
  player: PlayerState,
  option: MoveCardsPaymentOption,
): readonly CardInstance[] => {
  if (option.from.zone === "hand") {
    return player.hand;
  }
  if (option.from.zone === "trash") {
    return player.trash;
  }
  if (option.from.zone === "deck") {
    return player.deck;
  }
  if (option.from.zone === "characterArea") {
    return player.characters;
  }
  if (option.from.zone === "stageArea") {
    return player.stage === undefined ? [] : [player.stage];
  }
  if (option.from.zone === "life") {
    return player.life.map((entry) => entry.card);
  }
  return [];
};
