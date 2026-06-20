import type {
  CardFilter,
  CardId,
  EffectBlock,
  EffectDefinition,
  EffectId,
  GameState,
  ResolvedCard,
  Trigger,
} from "@optcg/types";

export const supportForFilterEntryPoint = (
  state: GameState,
  cardId: CardId,
  effectEntryPoint: CardFilter["effectEntryPoint"] | undefined,
): ResolvedCard["support"] | undefined => {
  if (effectEntryPoint?.mode !== "with") {
    return undefined;
  }
  const definitionId = `${String(cardId)}.behavior-probe-entrypoint`;
  const trigger = effectEntryPoint.trigger;
  const definition: EffectDefinition = {
    cardId,
    implementationStatus: "implemented-dsl",
    effects: [
      {
        id: `${String(cardId)}:entrypoint:1` as EffectId,
        category: categoryForTrigger(trigger),
        trigger,
        ...(effectEntryPoint.condition === undefined
          ? {}
          : { condition: effectEntryPoint.condition }),
        sourcePresencePolicy: "resolveFromDestinationZone",
        effect: { type: "draw", player: "self", count: 1 },
      },
    ],
    metadata: {
      sourceTextHash: "behavior-probe-entrypoint-source",
      rulesVersion: "behavior-probe",
      effectDefinitionsVersion: "behavior-probe",
      tested: true,
      reviewer: "behavior-probe",
    },
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [definitionId]: definition,
  };
  return {
    cardId,
    status: "implemented-dsl",
    tested: true,
    rulesVersion: "behavior-probe",
    cardDataVersion: "behavior-probe",
    sourceTextHash: "behavior-probe-entrypoint-source",
    behaviorHash: "behavior-probe-entrypoint-behavior",
    effectDefinitionId: definitionId,
  };
};

const categoryForTrigger = (trigger: Trigger): EffectBlock["category"] =>
  trigger.type === "activateMain" ? "activate" : "auto";
