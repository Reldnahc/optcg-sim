import type {
  ActiveEffectTextPresentation,
  CardId,
  EffectDefinition,
  GameState,
  InstanceId,
  PlayerId,
} from "@optcg/types";

import { activeEffectTextPresentationForEffectBlock } from "../runtime/effect-presentation.js";
import type { SelectedTargetKoReplacementCandidate } from "./primitives.js";

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const activeEffectTextPresentationFromPayloadValue = (
  value: unknown,
): ActiveEffectTextPresentation | undefined => {
  if (!isObjectRecord(value) || !isObjectRecord(value["source"])) {
    return undefined;
  }
  const source = value["source"];
  const activeSpanIds = value["activeSpanIds"];
  if (
    typeof source["instanceId"] !== "string" ||
    typeof source["cardId"] !== "string" ||
    typeof source["playerId"] !== "string" ||
    !Array.isArray(activeSpanIds) ||
    !activeSpanIds.every(
      (spanId): spanId is `span:${string}` =>
        typeof spanId === "string" && spanId.startsWith("span:"),
    )
  ) {
    return undefined;
  }
  const textKind = value["textKind"];
  return {
    source: {
      instanceId: source["instanceId"] as InstanceId,
      cardId: source["cardId"] as CardId,
      playerId: source["playerId"] as PlayerId,
    },
    ...(textKind === "effect" || textKind === "trigger" ? { textKind } : {}),
    activeSpanIds,
  };
};

export const replacementCandidatePresentation = (
  state: GameState,
  candidate: SelectedTargetKoReplacementCandidate,
): ActiveEffectTextPresentation | undefined => {
  const resolvedCard = state.cardManifest.cards[candidate.source.cardId];
  const definitionId = resolvedCard?.support.effectDefinitionId;
  const definition =
    definitionId === undefined
      ? undefined
      : state.cardManifest.effectDefinitions?.[definitionId];
  const effectBlock = definition?.effects.find(
    (effect): effect is EffectDefinition["effects"][number] =>
      effect.id === candidate.effectBlockId,
  );
  return resolvedCard === undefined || effectBlock === undefined
    ? undefined
    : activeEffectTextPresentationForEffectBlock({
        effectBlock,
        resolvedCard,
        source: candidate.source,
      });
};
