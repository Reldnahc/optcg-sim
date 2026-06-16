import type {
  ActiveEffectTextPresentation,
  CardRef,
  CardId,
  EffectDefinition,
  EffectTextSpanId,
  EffectTextTargetLink,
  GameState,
  InstanceId,
  PlayerId,
  Zone,
} from "@optcg/types";

import {
  activeEffectTextPresentationForEffectBlock,
  activeEffectTextPresentationWithTargetLinks,
} from "../runtime/effect-presentation.js";
import type { SelectedTargetKoReplacementCandidate } from "./primitives.js";

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const allowedZones = new Set<Zone>([
  "hand",
  "deck",
  "trash",
  "life",
  "costArea",
  "characterArea",
  "stageArea",
  "leaderArea",
  "donDeck",
  "noZone",
]);

type ZoneSlot = NonNullable<NonNullable<CardRef["zone"]>["slot"]>;

const allowedSlots = new Set<ZoneSlot>([
  "leader",
  "stage",
  "character",
  "cost",
  "life",
  "hand",
  "deck",
  "trash",
  "donDeck",
  "temporary",
]);

const isZoneSlot = (value: string): value is ZoneSlot =>
  allowedSlots.has(value as ZoneSlot);

const allowedTargetLinkRelations = new Set<EffectTextTargetLink["relation"]>([
  "candidateTarget",
  "selectedTarget",
  "affectedCard",
]);

const zoneRefFromPayloadValue = (
  value: unknown,
): NonNullable<CardRef["zone"]> | undefined => {
  if (!isObjectRecord(value)) {
    return undefined;
  }
  const zone = value["zone"];
  if (typeof zone !== "string" || !allowedZones.has(zone as Zone)) {
    return undefined;
  }
  const zoneRef: NonNullable<CardRef["zone"]> = { zone: zone as Zone };
  const zonePlayerId = value["playerId"];
  if (typeof zonePlayerId === "string") {
    zoneRef.playerId = zonePlayerId as PlayerId;
  }
  const zoneIndex = value["index"];
  if (typeof zoneIndex === "number") {
    zoneRef.index = zoneIndex;
  }
  const zoneSlot = value["slot"];
  if (typeof zoneSlot === "string" && isZoneSlot(zoneSlot)) {
    zoneRef.slot = zoneSlot;
  }
  return zoneRef;
};

const cardRefFromPayloadValue = (value: unknown): CardRef | undefined => {
  if (!isObjectRecord(value)) {
    return undefined;
  }
  const instanceId = value["instanceId"];
  const cardId = value["cardId"];
  const playerId = value["playerId"];
  if (
    typeof instanceId !== "string" ||
    typeof cardId !== "string" ||
    typeof playerId !== "string"
  ) {
    return undefined;
  }
  const rawZone = value["zone"];
  const zone =
    rawZone === undefined ? undefined : zoneRefFromPayloadValue(rawZone);
  if (rawZone !== undefined && zone === undefined) {
    return undefined;
  }
  return {
    instanceId: instanceId as InstanceId,
    cardId: cardId as CardId,
    playerId: playerId as PlayerId,
    ...(zone === undefined ? {} : { zone }),
  };
};

const targetLinksFromPayloadValue = (
  value: unknown,
  activeSpanIds: readonly EffectTextSpanId[],
): readonly EffectTextTargetLink[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const activeSpanIdSet = new Set(activeSpanIds);
  const links = value.flatMap((candidate): EffectTextTargetLink[] => {
    if (!isObjectRecord(candidate)) {
      return [];
    }
    const spanId = candidate["spanId"];
    const relation = candidate["relation"];
    const cards = candidate["cards"];
    if (
      typeof spanId !== "string" ||
      !activeSpanIdSet.has(spanId as EffectTextSpanId) ||
      typeof relation !== "string" ||
      !allowedTargetLinkRelations.has(
        relation as EffectTextTargetLink["relation"],
      ) ||
      !Array.isArray(cards)
    ) {
      return [];
    }
    const safeCards = cards.flatMap((card) => {
      const safeCard = cardRefFromPayloadValue(card);
      return safeCard === undefined ? [] : [safeCard];
    });
    return safeCards.length === 0
      ? []
      : [
          {
            spanId: spanId as EffectTextSpanId,
            relation: relation as EffectTextTargetLink["relation"],
            cards: safeCards,
          },
        ];
  });
  return links.length === 0 ? undefined : links;
};

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
  const targetLinks = targetLinksFromPayloadValue(
    value["targetLinks"],
    activeSpanIds,
  );
  return {
    source: {
      instanceId: source["instanceId"] as InstanceId,
      cardId: source["cardId"] as CardId,
      playerId: source["playerId"] as PlayerId,
    },
    ...(textKind === "effect" || textKind === "trigger" ? { textKind } : {}),
    activeSpanIds,
    ...(targetLinks === undefined ? {} : { targetLinks }),
  };
};

export const replacementCandidatePresentation = (
  state: GameState,
  candidate: SelectedTargetKoReplacementCandidate,
  coveredTargets: readonly CardRef[],
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
  if (resolvedCard === undefined || effectBlock === undefined) {
    return undefined;
  }
  const presentation = activeEffectTextPresentationForEffectBlock({
    effectBlock,
    resolvedCard,
    source: candidate.source,
  });
  return presentation === undefined
    ? undefined
    : activeEffectTextPresentationWithTargetLinks({
        cards: coveredTargets,
        presentation,
        relation: "affectedCard",
      });
};
