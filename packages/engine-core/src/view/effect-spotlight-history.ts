import type {
  ActiveEffectTextPresentation,
  CardId,
  DecisionId,
  EffectSpotlightHistory,
  EffectSpotlightHistoryEntry,
  EffectTextSpanId,
  EngineEvent,
  InstanceId,
  PlayerId,
} from "@optcg/types";

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
  activeSpanIds: readonly EffectTextSpanId[],
): readonly EffectTextSpanId[] => {
  const splitSpanIds = activeSpanIds.filter(
    (spanId) =>
      spanId.startsWith(sequenceSpanPrefix) ||
      spanId.startsWith(searchSpanPrefix),
  );
  return splitSpanIds.length > 1 ? splitSpanIds : [];
};

const presentationForEvent = (
  event: EngineEvent,
): ActiveEffectTextPresentation | undefined => {
  if (
    (event.type !== "effectResolved" && event.type !== "replacementApplied") ||
    !isObjectRecord(event.payload)
  ) {
    return undefined;
  }
  const presentation = event.payload["presentation"];
  return isActiveEffectTextPresentation(presentation)
    ? presentation
    : undefined;
};

const playedCardEntryForEvent = (
  event: EngineEvent,
): EffectSpotlightHistoryEntry | undefined => {
  if (event.type !== "cardPlayed" || !isObjectRecord(event.payload)) {
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
    key: String(event.id),
    mode: "resolved",
    active: {
      source: {
        playerId: playerId as PlayerId,
        instanceId: instanceId as InstanceId,
        cardId: cardId as CardId,
      },
      textKind: "effect",
      activeSpanIds: [],
    },
  };
};

const resolvedEntriesForEvent = (
  event: EngineEvent,
): readonly EffectSpotlightHistoryEntry[] => {
  const presentation = presentationForEvent(event);
  if (presentation === undefined) {
    return [];
  }
  const splitSpanIds = splitResolvedSpanIds(presentation.activeSpanIds);
  if (splitSpanIds.length === 0) {
    return [
      {
        key: String(event.id),
        mode: "resolved",
        active: presentation,
      },
    ];
  }
  return splitSpanIds.map((spanId) => ({
    key: `${String(event.id)}:${spanId}`,
    mode: "resolved" as const,
    active: {
      ...presentation,
      activeSpanIds: [spanId],
    },
  }));
};

const noEffectDecisionResponseTypes = new Set(["paymentDeclined"]);

const isNoEffectDecisionResolvedEvent = (event: EngineEvent): boolean => {
  if (event.type !== "decisionResolved" || !isObjectRecord(event.payload)) {
    return false;
  }
  const responseType = event.payload["responseType"];
  return (
    typeof responseType === "string" &&
    noEffectDecisionResponseTypes.has(responseType)
  );
};

const clearsNoEffectDecisionCandidate = (event: EngineEvent): boolean =>
  event.type !== "decisionResolved" &&
  event.type !== "effectResolved" &&
  event.type !== "ruleProcessingChecked";

const resolvedSpotlightEntriesForEvents = (
  events: readonly EngineEvent[],
): readonly EffectSpotlightHistoryEntry[] => {
  const entries: EffectSpotlightHistoryEntry[] = [];
  let pendingPlayedCard: EffectSpotlightHistoryEntry | undefined;
  let skipNextEffectResolved = false;
  for (const event of events) {
    if (isNoEffectDecisionResolvedEvent(event)) {
      skipNextEffectResolved = true;
    } else if (clearsNoEffectDecisionCandidate(event)) {
      skipNextEffectResolved = false;
    }
    if (event.type === "cardPlayed") {
      if (pendingPlayedCard !== undefined) {
        entries.push(pendingPlayedCard);
      }
      pendingPlayedCard = playedCardEntryForEvent(event);
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
    entries.push(...resolvedEntriesForEvent(event));
  }
  if (pendingPlayedCard !== undefined) {
    entries.push(pendingPlayedCard);
  }
  return entries;
};

const sameEffectTextSource = (
  left: ActiveEffectTextPresentation["source"],
  right: ActiveEffectTextPresentation["source"],
): boolean =>
  left.instanceId === right.instanceId &&
  left.cardId === right.cardId &&
  left.playerId === right.playerId;

const spanKey = (spanIds: readonly EffectTextSpanId[]): string =>
  spanIds.join("\n");

const sameEffectTextPresentation = (
  left: ActiveEffectTextPresentation,
  right: ActiveEffectTextPresentation,
): boolean =>
  sameEffectTextSource(left.source, right.source) &&
  (left.textKind ?? "effect") === (right.textKind ?? "effect") &&
  spanKey(left.activeSpanIds) === spanKey(right.activeSpanIds);

const hasMatchingResolvedPresentationSinceLastQueue = ({
  activeEffectText,
  events,
}: {
  readonly activeEffectText: ActiveEffectTextPresentation;
  readonly events: readonly EngineEvent[];
}): boolean => {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event === undefined || event.type === "effectQueued") {
      return false;
    }
    if (
      resolvedEntriesForEvent(event).some((entry) =>
        sameEffectTextPresentation(entry.active, activeEffectText),
      )
    ) {
      return true;
    }
  }
  return false;
};

const liveEntryKey = (
  active: ActiveEffectTextPresentation,
  pendingDecisionId: DecisionId | string | undefined,
): string =>
  [
    pendingDecisionId === undefined
      ? "active"
      : `decision:${String(pendingDecisionId)}`,
    String(active.source.instanceId),
    active.textKind ?? "",
    active.activeSpanIds.join("\n"),
  ].join("|");

export const effectSpotlightHistoryFromPlayerViewState = ({
  activeEffectText,
  events,
  pendingDecisionId,
}: {
  readonly activeEffectText: ActiveEffectTextPresentation | undefined;
  readonly events: readonly EngineEvent[];
  readonly pendingDecisionId?: DecisionId | string | undefined;
}): EffectSpotlightHistory | undefined => {
  const entries = resolvedSpotlightEntriesForEvents(events);
  const liveEntry =
    activeEffectText === undefined ||
    hasMatchingResolvedPresentationSinceLastQueue({ activeEffectText, events })
      ? undefined
      : {
          key: liveEntryKey(activeEffectText, pendingDecisionId),
          mode: "live" as const,
          active: activeEffectText,
        };
  const historyEntries =
    liveEntry === undefined ? entries : [...entries, liveEntry];
  const presentKey = historyEntries.at(-1)?.key;
  return historyEntries.length === 0 || presentKey === undefined
    ? undefined
    : { entries: historyEntries, presentKey };
};
