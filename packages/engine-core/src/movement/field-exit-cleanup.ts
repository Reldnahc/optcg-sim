import type {
  CardInstance,
  CardRef,
  ContinuousEffectRecord,
  GameState,
  ZoneRef,
} from "@optcg/types";

const inPlayZones = new Set<ZoneRef["zone"]>([
  "leaderArea",
  "characterArea",
  "stageArea",
  "costArea",
]);

export const isInPlayZone = (zone: ZoneRef["zone"]): boolean =>
  inPlayZones.has(zone);

const cardMatchesRef = (card: CardInstance, ref: CardRef): boolean =>
  card.instanceId === ref.instanceId &&
  card.cardId === ref.cardId &&
  card.controller === ref.playerId;

const targetReferencesCard = (
  target: ContinuousEffectRecord["modifier"]["target"],
  card: CardInstance,
): boolean => target.type === "exactCard" && cardMatchesRef(card, target.card);

const recordReferencesLeavingCard = (
  record: ContinuousEffectRecord,
  leavingCards: readonly CardInstance[],
): boolean =>
  leavingCards.some(
    (card) =>
      cardMatchesRef(card, record.source) ||
      targetReferencesCard(record.modifier.target, card),
  );

export const clearFieldOnlyCardState = (card: CardInstance): CardInstance => {
  const cleared = { ...card, attachedDon: [] };
  delete cleared.state;
  delete cleared.turnPlayed;
  return cleared;
};

export const clearFieldExitContinuousEffects = (
  state: GameState,
  leavingCards: readonly CardInstance[],
): GameState => {
  const cardsLeavingPlay = leavingCards.filter((card) =>
    isInPlayZone(card.zone.zone),
  );
  if (cardsLeavingPlay.length === 0 || state.continuousEffects.length === 0) {
    return state;
  }
  return {
    ...state,
    continuousEffects: state.continuousEffects.filter(
      (record) => !recordReferencesLeavingCard(record, cardsLeavingPlay),
    ),
  };
};
