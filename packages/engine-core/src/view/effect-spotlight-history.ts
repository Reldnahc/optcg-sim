import type {
  ActiveEffectTextPresentation,
  CardId,
  CardRef,
  CombatSpotlightPresentation,
  DecisionId,
  EffectId,
  EffectSpotlightHistory,
  EffectSpotlightHistoryEntry,
  EffectTextSpanId,
  EngineEvent,
  InstanceId,
  PlayerId,
  QueueEntryId,
} from "@optcg/types";

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isCardRef = (value: unknown): value is CardRef => {
  if (!isObjectRecord(value)) {
    return false;
  }
  return (
    typeof value["playerId"] === "string" &&
    typeof value["instanceId"] === "string" &&
    typeof value["cardId"] === "string"
  );
};

const numberPayloadValue = (
  payload: Record<string, unknown>,
  key: string,
): number | undefined =>
  typeof payload[key] === "number" ? payload[key] : undefined;

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
    activeSpanIds.length > 0 &&
    activeSpanIds.every(
      (spanId) => typeof spanId === "string" && spanId.startsWith("span:"),
    )
  );
};

const sequenceSpanPrefix = "span:sequence:";
const searchSpanPrefix = "span:search:";
const costSpanPrefix = "span:cost";
const bodySpanPrefix = "span:body";
const choiceOptionSpanPattern = /^span:choice:\d+:/u;

const isResolvedStepSpanId = (spanId: EffectTextSpanId): boolean =>
  (spanId.startsWith(sequenceSpanPrefix) ||
    spanId.startsWith(searchSpanPrefix) ||
    spanId.startsWith(costSpanPrefix) ||
    spanId === bodySpanPrefix ||
    spanId.startsWith(`${bodySpanPrefix}:`) ||
    choiceOptionSpanPattern.test(spanId)) &&
  spanId !== "span:search:then";

const splitResolvedSpanIds = (
  activeSpanIds: readonly EffectTextSpanId[],
): readonly EffectTextSpanId[] => {
  const splitSpanIds = activeSpanIds.filter(isResolvedStepSpanId);
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

const effectEventPayload = (
  event: EngineEvent,
): {
  readonly queueEntryId?: string;
  readonly effectBlockId?: string;
} => {
  if (!isObjectRecord(event.payload)) {
    return {};
  }
  const queueEntryId = event.payload["queueEntryId"];
  const effectBlockId = event.payload["effectBlockId"];
  return {
    ...(typeof queueEntryId === "string" ? { queueEntryId } : {}),
    ...(typeof effectBlockId === "string" ? { effectBlockId } : {}),
  };
};

const semanticKeyForActive = (active: ActiveEffectTextPresentation): string =>
  [
    String(active.source.playerId),
    String(active.source.instanceId),
    String(active.source.cardId),
    active.textKind ?? "effect",
    active.activeSpanIds.join("\n"),
  ].join("|");

const combatSemanticKey = (combat: CombatSpotlightPresentation): string =>
  [
    "combat",
    combat.eventKind,
    String(combat.attacker.playerId),
    String(combat.attacker.instanceId),
    String(combat.attacker.cardId),
    String(combat.defender.playerId),
    String(combat.defender.instanceId),
    String(combat.defender.cardId),
    combat.attackerPower === undefined ? "" : String(combat.attackerPower),
    combat.defenderPower === undefined ? "" : String(combat.defenderPower),
  ].join("|");

const sameEffectTextSource = (
  left: ActiveEffectTextPresentation["source"],
  right: ActiveEffectTextPresentation["source"],
): boolean =>
  left.instanceId === right.instanceId &&
  left.cardId === right.cardId &&
  left.playerId === right.playerId;

const spanKey = (spanIds: readonly EffectTextSpanId[]): string =>
  spanIds.join("\n");

const pendingEntryId = (
  pendingDecisionId: DecisionId | string,
  active: ActiveEffectTextPresentation,
): string =>
  `pending:${String(pendingDecisionId)}:${semanticKeyForActive(active)}`;

const resolvedEntryId = (
  event: EngineEvent,
  active: ActiveEffectTextPresentation,
): string => `resolved:${String(event.id)}:${active.activeSpanIds.join("\n")}`;

const resolvedEntryForActive = ({
  active,
  event,
  key,
}: {
  readonly active: ActiveEffectTextPresentation;
  readonly event: EngineEvent;
  readonly key: string;
}): EffectSpotlightHistoryEntry => {
  const metadata = effectEventPayload(event);
  return {
    id: resolvedEntryId(event, active),
    key,
    semanticKey: semanticKeyForActive(active),
    mode: "resolved",
    status: "resolved",
    active,
    resolvedEventId: event.id,
    ...(metadata.queueEntryId === undefined
      ? {}
      : { queueEntryId: metadata.queueEntryId as QueueEntryId }),
    ...(metadata.effectBlockId === undefined
      ? {}
      : { effectBlockId: metadata.effectBlockId as EffectId }),
  };
};

const combatEntryForEvent = (
  event: EngineEvent,
): EffectSpotlightHistoryEntry | undefined => {
  if (event.visibility.type !== "public" || !isObjectRecord(event.payload)) {
    return undefined;
  }

  if (event.type === "attackDeclared") {
    const attacker = event.payload["attacker"];
    const defender = event.payload["target"];
    if (!isCardRef(attacker) || !isCardRef(defender)) {
      return undefined;
    }
    const attackerPower = numberPayloadValue(event.payload, "attackerPower");
    const defenderPower = numberPayloadValue(event.payload, "defenderPower");
    const combat: CombatSpotlightPresentation = {
      eventKind: "attackDeclared",
      attacker,
      defender,
      ...(attackerPower === undefined ? {} : { attackerPower }),
      ...(defenderPower === undefined ? {} : { defenderPower }),
    };
    return {
      kind: "combat",
      id: `combat:${String(event.id)}`,
      key: String(event.id),
      semanticKey: combatSemanticKey(combat),
      mode: "resolved",
      status: "resolved",
      combat,
      resolvedEventId: event.id,
    };
  }

  if (event.type === "blockerActivated") {
    const attacker = event.payload["attacker"];
    const defender = event.payload["blocker"];
    if (!isCardRef(attacker) || !isCardRef(defender)) {
      return undefined;
    }
    const attackerPower = numberPayloadValue(event.payload, "attackerPower");
    const defenderPower = numberPayloadValue(event.payload, "defenderPower");
    const combat: CombatSpotlightPresentation = {
      eventKind: "blockerActivated",
      attacker,
      defender,
      ...(attackerPower === undefined ? {} : { attackerPower }),
      ...(defenderPower === undefined ? {} : { defenderPower }),
    };
    return {
      kind: "combat",
      id: `combat:${String(event.id)}`,
      key: String(event.id),
      semanticKey: combatSemanticKey(combat),
      mode: "resolved",
      status: "resolved",
      combat,
      resolvedEventId: event.id,
    };
  }

  return undefined;
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

  const active: ActiveEffectTextPresentation = {
    source: {
      playerId: playerId as PlayerId,
      instanceId: instanceId as InstanceId,
      cardId: cardId as CardId,
    },
    textKind: "effect",
    activeSpanIds: [],
  };
  return {
    id: resolvedEntryId(event, active),
    key: String(event.id),
    semanticKey: semanticKeyForActive(active),
    mode: "resolved",
    status: "resolved",
    active,
    resolvedEventId: event.id,
  };
};

const resolvedEntriesForEvent = (
  event: EngineEvent,
): readonly EffectSpotlightHistoryEntry[] => {
  const combatEntry = combatEntryForEvent(event);
  if (combatEntry !== undefined) {
    return [combatEntry];
  }

  const presentation = presentationForEvent(event);
  if (presentation === undefined) {
    return [];
  }
  const splitSpanIds = splitResolvedSpanIds(presentation.activeSpanIds);
  if (splitSpanIds.length === 0) {
    return [
      resolvedEntryForActive({
        active: presentation,
        event,
        key: String(event.id),
      }),
    ];
  }
  return splitSpanIds.map((spanId) =>
    resolvedEntryForActive({
      active: {
        ...presentation,
        activeSpanIds: [spanId],
      },
      event,
      key: `${String(event.id)}:${spanId}`,
    }),
  );
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

const isEffectTextEntry = (
  entry: EffectSpotlightHistoryEntry,
): entry is EffectSpotlightHistoryEntry & {
  readonly active: ActiveEffectTextPresentation;
} => entry.kind !== "combat";

const isEffectSpotlightForPlayedCard = (
  entry: EffectSpotlightHistoryEntry,
  playedCard: EffectSpotlightHistoryEntry,
): boolean =>
  isEffectTextEntry(entry) &&
  isEffectTextEntry(playedCard) &&
  entry.active.activeSpanIds.length > 0 &&
  sameEffectTextSource(entry.active.source, playedCard.active.source);

const hasEffectSpotlightForPlayedCard = (
  entries: readonly EffectSpotlightHistoryEntry[],
  playedCard: EffectSpotlightHistoryEntry,
): boolean =>
  entries.some((entry) => isEffectSpotlightForPlayedCard(entry, playedCard));

const sourceMatchesPlayedCardEntry = (
  source: CardRef | undefined,
  playedCard: EffectSpotlightHistoryEntry,
): boolean =>
  source === undefined ||
  (isEffectTextEntry(playedCard) &&
    sameEffectTextSource(source, playedCard.active.source));

const resolvedSpotlightEntriesForEvents = (
  events: readonly EngineEvent[],
  activeEffectText?: ActiveEffectTextPresentation,
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
    if (event.type === "effectResolved" && skipNextEffectResolved) {
      skipNextEffectResolved = false;
      continue;
    }
    if (event.type === "cardPlayed") {
      if (pendingPlayedCard !== undefined) {
        entries.push(pendingPlayedCard);
      }
      pendingPlayedCard = playedCardEntryForEvent(event);
      continue;
    }
    if (event.type === "effectQueued") {
      if (
        pendingPlayedCard !== undefined &&
        sourceMatchesPlayedCardEntry(event.source, pendingPlayedCard)
      ) {
        pendingPlayedCard = undefined;
      }
      continue;
    }
    const resolvedEntries = resolvedEntriesForEvent(event);
    if (pendingPlayedCard !== undefined && resolvedEntries.length > 0) {
      if (
        !hasEffectSpotlightForPlayedCard(resolvedEntries, pendingPlayedCard)
      ) {
        entries.push(pendingPlayedCard);
      }
      pendingPlayedCard = undefined;
    }
    entries.push(...resolvedEntries);
  }
  if (pendingPlayedCard !== undefined) {
    const liveEntrySuppressesPlayedCard =
      activeEffectText !== undefined &&
      activeEffectText.activeSpanIds.length > 0 &&
      isEffectTextEntry(pendingPlayedCard) &&
      sameEffectTextSource(
        activeEffectText.source,
        pendingPlayedCard.active.source,
      );
    if (!liveEntrySuppressesPlayedCard) {
      entries.push(pendingPlayedCard);
    }
  }
  return entries;
};

const sameEffectTextPresentation = (
  left: ActiveEffectTextPresentation,
  right: ActiveEffectTextPresentation,
): boolean =>
  sameEffectTextSource(left.source, right.source) &&
  (left.textKind ?? "effect") === (right.textKind ?? "effect") &&
  spanKey(left.activeSpanIds) === spanKey(right.activeSpanIds);

const matchingResolvedEntryKeySinceLastQueue = ({
  activeEffectText,
  events,
}: {
  readonly activeEffectText: ActiveEffectTextPresentation;
  readonly events: readonly EngineEvent[];
}): string | undefined => {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event === undefined || event.type === "effectQueued") {
      return undefined;
    }
    const matchingEntry = resolvedEntriesForEvent(event).find(
      (entry) =>
        entry.kind !== "combat" &&
        sameEffectTextPresentation(entry.active, activeEffectText),
    );
    if (matchingEntry !== undefined) {
      return matchingEntry.key;
    }
  }
  return undefined;
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
  const entries = resolvedSpotlightEntriesForEvents(events, activeEffectText);
  const matchingResolvedEntryKey =
    activeEffectText === undefined
      ? undefined
      : matchingResolvedEntryKeySinceLastQueue({ activeEffectText, events });
  const liveEntry =
    activeEffectText === undefined ||
    (matchingResolvedEntryKey !== undefined && pendingDecisionId === undefined)
      ? undefined
      : {
          id:
            pendingDecisionId === undefined
              ? `active:${semanticKeyForActive(activeEffectText)}`
              : pendingEntryId(pendingDecisionId, activeEffectText),
          key: liveEntryKey(activeEffectText, pendingDecisionId),
          semanticKey: semanticKeyForActive(activeEffectText),
          mode: "live" as const,
          status: "pending" as const,
          active: activeEffectText,
          ...(pendingDecisionId === undefined
            ? {}
            : { pendingDecisionId: pendingDecisionId as DecisionId }),
        };
  const historyEntries =
    liveEntry === undefined
      ? entries
      : [
          ...entries.filter(
            (entry) => entry.semanticKey !== liveEntry.semanticKey,
          ),
          liveEntry,
        ];
  const presentKey = historyEntries.at(-1)?.key;
  return historyEntries.length === 0 || presentKey === undefined
    ? undefined
    : { entries: historyEntries, presentKey };
};
