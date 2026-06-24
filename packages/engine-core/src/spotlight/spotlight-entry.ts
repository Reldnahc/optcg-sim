import type {
  ActiveEffectTextPresentation,
  CardRef,
  CombatSpotlightHistoryEntry,
  CombatSpotlightPresentation,
  EffectId,
  EffectTextSpanId,
  EffectTextSpotlightHistoryEntry,
  EngineEventId,
  PlayedCardSpotlightHistoryEntry,
  PublicPendingDecisionId,
  QueueEntryId,
  SpotlightDisclosureVisibility,
  SpotlightEntryCardRefDisclosure,
  SpotlightTargetLinkDisclosure,
} from "@optcg/types";

const sequenceSpanPrefix = "span:sequence:";
const searchSpanPrefix = "span:search:";
const costSpanPrefix = "span:cost";
const bodySpanPrefix = "span:body";
const replacementSpanId = "span:replacement";
const choiceOptionSpanPattern = /^span:choice:\d+:/u;

const isResolvedStepSpanId = (spanId: EffectTextSpanId): boolean =>
  (spanId.startsWith(sequenceSpanPrefix) ||
    spanId.startsWith(searchSpanPrefix) ||
    spanId.startsWith(costSpanPrefix) ||
    spanId === bodySpanPrefix ||
    spanId.startsWith(`${bodySpanPrefix}:`) ||
    spanId === replacementSpanId ||
    choiceOptionSpanPattern.test(spanId)) &&
  spanId !== "span:search:then";

export const splitEffectTextSpotlightPresentation = (
  active: ActiveEffectTextPresentation,
): readonly ActiveEffectTextPresentation[] => {
  const splitSpanIds = active.activeSpanIds.filter(isResolvedStepSpanId);
  if (splitSpanIds.length === 0) {
    return [];
  }
  return splitSpanIds.map((spanId) => ({
    ...active,
    activeSpanIds: [spanId],
    ...(active.targetLinks === undefined
      ? {}
      : {
          targetLinks: active.targetLinks.filter(
            (link) => link.spanId === spanId,
          ),
        }),
  }));
};

const spanKey = (spanIds: readonly EffectTextSpanId[]): string =>
  spanIds.join("+");

const effectTextAnchorKey = (
  prefix: "effect" | "pending",
  anchorEventId: EngineEventId,
  active: ActiveEffectTextPresentation,
): string =>
  `spotlight:${prefix}:${String(anchorEventId)}:${spanKey(
    active.activeSpanIds,
  )}`;

const effectTextSemanticKey = (
  prefix: "effect" | "pending",
  anchorEventId: EngineEventId,
  active: ActiveEffectTextPresentation,
): string =>
  [
    prefix,
    String(anchorEventId),
    active.textKind ?? "effect",
    spanKey(active.activeSpanIds),
  ].join("|");

export const effectTextSpotlightEntry = ({
  active,
  anchorEventId,
  effectBlockId,
  queueEntryId,
}: {
  readonly active: ActiveEffectTextPresentation;
  readonly anchorEventId: EngineEventId;
  readonly effectBlockId?: EffectId | undefined;
  readonly queueEntryId?: QueueEntryId | undefined;
}): EffectTextSpotlightHistoryEntry => {
  const key = effectTextAnchorKey("effect", anchorEventId, active);
  return {
    id: key,
    key,
    semanticKey: effectTextSemanticKey("effect", anchorEventId, active),
    mode: "resolved",
    status: "resolved",
    active,
    resolvedEventId: anchorEventId,
    ...(queueEntryId === undefined ? {} : { queueEntryId }),
    ...(effectBlockId === undefined ? {} : { effectBlockId }),
  };
};

export const pendingEffectTextSpotlightEntry = ({
  active,
  anchorEventId,
  pendingDecisionId,
}: {
  readonly active: ActiveEffectTextPresentation;
  readonly anchorEventId: EngineEventId;
  readonly pendingDecisionId: PublicPendingDecisionId;
}): EffectTextSpotlightHistoryEntry => {
  const key = effectTextAnchorKey("pending", anchorEventId, active);
  return {
    id: key,
    key,
    semanticKey: effectTextSemanticKey("pending", anchorEventId, active),
    mode: "live",
    status: "pending",
    active,
    pendingDecisionId,
  };
};

const combatAnchorKey = (
  anchorEventId: EngineEventId,
  combat: CombatSpotlightPresentation,
): string => `spotlight:combat:${String(anchorEventId)}:${combat.eventKind}`;

const combatSemanticKey = (combat: CombatSpotlightPresentation): string =>
  [
    "combat",
    combat.eventKind,
    String(combat.attacker.playerId),
    String(combat.attacker.instanceId),
    String(combat.defender.playerId),
    String(combat.defender.instanceId),
  ].join("|");

export const combatSpotlightEntry = ({
  anchorEventId,
  combat,
}: {
  readonly anchorEventId: EngineEventId;
  readonly combat: CombatSpotlightPresentation;
}): CombatSpotlightHistoryEntry => {
  const key = combatAnchorKey(anchorEventId, combat);
  return {
    kind: "combat",
    id: key,
    key,
    semanticKey: combatSemanticKey(combat),
    mode: "resolved",
    status: "resolved",
    combat,
    resolvedEventId: anchorEventId,
  };
};

export const playedCardSpotlightEntry = ({
  anchorEventId,
  source,
}: {
  readonly anchorEventId: EngineEventId;
  readonly source: CardRef;
}): PlayedCardSpotlightHistoryEntry => {
  const key = `spotlight:playedCard:${String(anchorEventId)}`;
  return {
    kind: "playedCard",
    id: key,
    key,
    semanticKey: [
      "playedCard",
      String(anchorEventId),
      String(source.playerId),
      String(source.instanceId),
    ].join("|"),
    mode: "resolved",
    status: "resolved",
    source,
    resolvedEventId: anchorEventId,
  };
};

export const entryCardRefDisclosure = ({
  card,
  role,
  visibility,
}: {
  readonly card: CardRef;
  readonly role: SpotlightEntryCardRefDisclosure["role"];
  readonly visibility: SpotlightDisclosureVisibility;
}): SpotlightEntryCardRefDisclosure => ({
  role,
  cardInstanceId: card.instanceId,
  visibility,
});

export const targetLinkDisclosure = ({
  card,
  relation,
  spanId,
  visibility,
}: {
  readonly card: CardRef;
  readonly relation: SpotlightTargetLinkDisclosure["relation"];
  readonly spanId: EffectTextSpanId;
  readonly visibility: SpotlightDisclosureVisibility;
}): SpotlightTargetLinkDisclosure => ({
  spanId,
  relation,
  cardInstanceId: card.instanceId,
  visibility,
});

export const spotlightDisclosureVisibilityForCardRef = (
  card: CardRef,
): SpotlightDisclosureVisibility => {
  const zone = card.zone?.zone;
  return zone === "hand" ||
    zone === "deck" ||
    zone === "life" ||
    zone === "donDeck"
    ? { type: "private", playerId: card.playerId }
    : { type: "public" };
};
