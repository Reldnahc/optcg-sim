import type {
  CardInstance,
  ContinuousEffectRecord,
  GameState,
} from "@optcg/types";

import { cardMatchesContinuousModifierTarget } from "../../runtime/continuous/target-matching.js";

const currentCardsForContinuousMatching = (state: GameState): CardInstance[] =>
  Object.values(state.players).flatMap((player) => [
    player.leader,
    ...player.characters,
    ...(player.stage === undefined ? [] : [player.stage]),
    ...player.costArea,
    ...player.hand,
    ...player.trash,
    ...player.deck,
    ...player.donDeck,
    ...player.life.map((lifeCard) => lifeCard.card),
  ]);

const continuousRecordCurrentlyApplies = (
  state: GameState,
  record: ContinuousEffectRecord,
): boolean => {
  const target = record.modifier.target;
  if (target.type === "player" || target.type === "allMatching") {
    return true;
  }
  return currentCardsForContinuousMatching(state).some((card) =>
    cardMatchesContinuousModifierTarget(state, card, record),
  );
};

export const continuousRecordsCurrentlyApply = (
  state: GameState,
  records: readonly ContinuousEffectRecord[],
): boolean =>
  records.some((record) => continuousRecordCurrentlyApplies(state, record));
