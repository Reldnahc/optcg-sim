import type {
  CardInstance,
  CardRef,
  ContinuousEffectRecord,
  GameState,
  PlayerId,
} from "@optcg/types";

export const createCounterEventPowerRecord = (
  state: GameState,
  controllerId: PlayerId,
  handCard: CardInstance,
  target: CardRef,
  value: number,
): ContinuousEffectRecord | null => {
  const metadata = state.cardManifest.cards[handCard.cardId];
  if (metadata === undefined) {
    return null;
  }
  return {
    id: `continuous:counter:${String(handCard.instanceId)}:${String(state.seq + 1)}`,
    source: {
      instanceId: handCard.instanceId,
      cardId: handCard.cardId,
      playerId: controllerId,
      zone: handCard.zone,
    },
    sourceSnapshot: {
      instanceId: handCard.instanceId,
      cardId: handCard.cardId,
      ownerId: handCard.owner,
      controllerId,
      zone: handCard.zone,
      category: metadata.category,
      colors: metadata.colors,
      ...(metadata.cost === undefined ? {} : { cost: metadata.cost }),
      ...(metadata.power === undefined ? {} : { power: metadata.power }),
      ...(metadata.counter === undefined ? {} : { counter: metadata.counter }),
      ...(metadata.life === undefined ? {} : { life: metadata.life }),
      keywords: metadata.printedKeywords,
    },
    controller: controllerId,
    modifier: {
      layer: "powerAdd",
      target: {
        type: "exactCard",
        card: target,
        binding: {
          family: "selectedTargets",
          saveResultAs: `${String(handCard.cardId)}:counter`,
          objectIndex: 0,
        },
        createdAtStateSeq: state.seq,
      },
      operation: { type: "addPower", value },
    },
    duration: { type: "thisBattle" },
    createdBy: { type: "ruleProcess", name: "counterStep" },
    createdAtStateSeq: state.seq,
  };
};
