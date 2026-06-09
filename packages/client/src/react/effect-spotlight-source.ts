import type {
  ActiveEffectTextPresentation,
  CardId,
  EngineEvent,
  InstanceId,
  PlayerView,
  PlayerId,
} from "@optcg/types";

export interface EffectSpotlightActiveSource {
  readonly active: ActiveEffectTextPresentation;
  readonly key: string;
  readonly mode: "live" | "resolved";
}

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isActiveEffectTextPresentation = (
  value: unknown,
): value is ActiveEffectTextPresentation => {
  if (!isObjectRecord(value) || !isObjectRecord(value["source"])) {
    return false;
  }
  const source = value["source"];
  const activeSpanIds = value["activeSpanIds"];
  return (
    typeof source["instanceId"] === "string" &&
    typeof source["cardId"] === "string" &&
    typeof source["playerId"] === "string" &&
    (value["textKind"] === undefined ||
      value["textKind"] === "effect" ||
      value["textKind"] === "trigger") &&
    Array.isArray(activeSpanIds) &&
    activeSpanIds.every(
      (spanId) => typeof spanId === "string" && spanId.startsWith("span:"),
    )
  );
};

const sequenceSpanPrefix = "span:sequence:";
const searchSpanPrefix = "span:search:";

const splitResolvedSpanIds = (
  activeSpanIds: readonly ActiveEffectTextPresentation["activeSpanIds"][number][],
): readonly ActiveEffectTextPresentation["activeSpanIds"][number][] => {
  const splitSpanIds = activeSpanIds.filter(
    (spanId) =>
      spanId.startsWith(sequenceSpanPrefix) ||
      spanId.startsWith(searchSpanPrefix),
  );
  return splitSpanIds.length > 1 ? splitSpanIds : [];
};

const resolvedSpotlightSourcesForEvent = (
  event: EngineEvent,
): readonly EffectSpotlightActiveSource[] => {
  if (event.type === "cardPlayed") {
    const source = playedCardPresentation(event);
    return source === undefined ? [] : [source];
  }
  if (
    (event.type !== "effectResolved" && event.type !== "replacementApplied") ||
    !isObjectRecord(event.payload)
  ) {
    return [];
  }
  const presentation = event.payload["presentation"];
  if (!isActiveEffectTextPresentation(presentation)) {
    return [];
  }
  const splitSpanIds = splitResolvedSpanIds(presentation.activeSpanIds);
  if (splitSpanIds.length === 0) {
    return [
      {
        active: presentation,
        key: String(event.id),
        mode: "resolved",
      },
    ];
  }
  return splitSpanIds.map((spanId) => ({
    active: {
      ...presentation,
      activeSpanIds: [spanId],
    },
    key: `${String(event.id)}:${spanId}`,
    mode: "resolved" as const,
  }));
};

const noEffectDecisionResponseTypes = new Set(["paymentDeclined"]);

const isNoEffectDecisionResolvedEvent = (event: EngineEvent): boolean => {
  if (event.type !== "decisionResolved" || !isObjectRecord(event.payload)) {
    return false;
  }
  const responseType = event.payload["responseType"];
  if (
    typeof responseType === "string" &&
    noEffectDecisionResponseTypes.has(responseType)
  ) {
    return true;
  }
  return responseType === "targets" && event.payload["selectedCount"] === 0;
};

const clearsNoEffectDecisionCandidate = (event: EngineEvent): boolean =>
  event.type !== "decisionResolved" &&
  event.type !== "effectResolved" &&
  event.type !== "ruleProcessingChecked";

export const resolvedEffectTextSourcesForSpotlight = (
  events: readonly EngineEvent[],
): readonly EffectSpotlightActiveSource[] => {
  const sources: EffectSpotlightActiveSource[] = [];
  let pendingPlayedCard: EffectSpotlightActiveSource | undefined;
  let skipNextEffectResolved = false;
  for (const event of events) {
    if (isNoEffectDecisionResolvedEvent(event)) {
      skipNextEffectResolved = true;
    } else if (clearsNoEffectDecisionCandidate(event)) {
      skipNextEffectResolved = false;
    }
    if (event.type === "cardPlayed") {
      if (pendingPlayedCard !== undefined) {
        sources.push(pendingPlayedCard);
      }
      pendingPlayedCard = playedCardPresentation(event);
      continue;
    }
    if (event.type === "effectQueued") {
      pendingPlayedCard = undefined;
      continue;
    }
    if (event.type === "effectResolved" && skipNextEffectResolved) {
      skipNextEffectResolved = false;
      continue;
    }
    sources.push(...resolvedSpotlightSourcesForEvent(event));
  }
  if (pendingPlayedCard !== undefined) {
    sources.push(pendingPlayedCard);
  }
  return sources;
};

const playedCardPresentation = (
  event: EngineEvent,
): EffectSpotlightActiveSource | undefined => {
  if (!isObjectRecord(event.payload)) {
    return undefined;
  }
  const playerId = event.payload["playerId"];
  const instanceId = event.payload["instanceId"];
  const cardId = event.payload["cardId"];
  const category = event.payload["category"];
  if (
    typeof playerId !== "string" ||
    typeof instanceId !== "string" ||
    typeof cardId !== "string" ||
    (category !== "character" && category !== "stage")
  ) {
    return undefined;
  }
  return {
    active: {
      source: {
        playerId: playerId as PlayerId,
        instanceId: instanceId as InstanceId,
        cardId: cardId as CardId,
      },
      textKind: "effect",
      activeSpanIds: [],
    },
    key: String(event.id),
    mode: "resolved",
  };
};

const liveKey = (
  active: ActiveEffectTextPresentation,
  prefix: string,
): string =>
  [
    prefix,
    String(active.source.instanceId),
    active.textKind ?? "",
    active.activeSpanIds.join("\n"),
  ].join("|");

const splitResolvedSourceKeyIndex = (key: string): number =>
  key.indexOf(":span:");

const sameEffectTextSource = (
  left: ActiveEffectTextPresentation["source"],
  right: ActiveEffectTextPresentation["source"],
): boolean =>
  left.instanceId === right.instanceId &&
  left.cardId === right.cardId &&
  left.playerId === right.playerId;

const newestSplitResolvedSourcesForActive = ({
  activeEffectText,
  events,
}: {
  readonly activeEffectText: ActiveEffectTextPresentation;
  readonly events: readonly EngineEvent[];
}): readonly EffectSpotlightActiveSource[] => {
  const sources = resolvedEffectTextSourcesForSpotlight(events);
  let latestGroupKey: string | undefined;
  let latestGroup: EffectSpotlightActiveSource[] | undefined;
  for (const source of sources) {
    const splitIndex = splitResolvedSourceKeyIndex(source.key);
    if (
      source.mode !== "resolved" ||
      splitIndex < 0 ||
      !sameEffectTextSource(source.active.source, activeEffectText.source)
    ) {
      continue;
    }
    const groupKey = source.key.slice(0, splitIndex);
    if (groupKey !== latestGroupKey) {
      latestGroupKey = groupKey;
      latestGroup = [];
    }
    latestGroup?.push(source);
  }
  return latestGroup ?? [];
};

export const activeEffectTextSourceForSpotlight = ({
  activeEffectText,
  events,
  pendingDecision,
}: {
  readonly activeEffectText: PlayerView["activeEffectText"];
  readonly pendingDecision: PlayerView["pendingDecision"];
  readonly events: readonly EngineEvent[];
}): EffectSpotlightActiveSource | undefined => {
  if (pendingDecision?.presentation.activeEffectText !== undefined) {
    const pendingActiveEffectText =
      pendingDecision.presentation.activeEffectText;
    return {
      active: pendingActiveEffectText,
      key: liveKey(
        pendingActiveEffectText,
        `decision:${String(pendingDecision.id)}`,
      ),
      mode: "live",
    };
  }
  if (pendingDecision !== undefined) {
    return undefined;
  }
  if (activeEffectText !== undefined) {
    const splitResolvedSources = newestSplitResolvedSourcesForActive({
      activeEffectText,
      events,
    });
    if (splitResolvedSources.length > 0) {
      return splitResolvedSources.at(-1);
    }
    return {
      active: activeEffectText,
      key: liveKey(activeEffectText, "active"),
      mode: "live",
    };
  }
  return resolvedEffectTextSourcesForSpotlight(events).at(-1);
};

export const activeEffectTextSourcesForSpotlight = ({
  activeEffectText,
  events,
  pendingDecision,
}: {
  readonly activeEffectText: PlayerView["activeEffectText"];
  readonly pendingDecision: PlayerView["pendingDecision"];
  readonly events: readonly EngineEvent[];
}): readonly EffectSpotlightActiveSource[] => {
  const resolvedSources = resolvedEffectTextSourcesForSpotlight(events);
  const activeSource = activeEffectTextSourceForSpotlight({
    activeEffectText,
    pendingDecision,
    events,
  });
  if (activeSource?.mode === "live") {
    return [...resolvedSources, activeSource];
  }
  if (pendingDecision !== undefined) {
    return activeSource === undefined ? [] : [activeSource];
  }
  if (activeEffectText !== undefined) {
    const splitResolvedSources = newestSplitResolvedSourcesForActive({
      activeEffectText,
      events,
    });
    return splitResolvedSources.length === 0
      ? activeSource === undefined
        ? []
        : [activeSource]
      : splitResolvedSources;
  }
  return resolvedSources;
};
