import type {
  ActiveEffectTextPresentation,
  CardRef,
  EffectSpotlightHistory,
  EffectSpotlightHistoryEntry,
  EffectTextSpotlightHistoryEntry,
  EffectTextSpanId,
  EngineEvent,
  PublicPendingDecisionId,
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

const isActiveEffectTextPresentation = (
  value: unknown,
): value is ActiveEffectTextPresentation => {
  if (!isObjectRecord(value) || !isCardRef(value["source"])) {
    return false;
  }
  const activeSpanIds = value["activeSpanIds"];
  return (
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

const stringArrayField = (
  value: unknown,
): readonly EffectTextSpanId[] | null =>
  Array.isArray(value) &&
  value.every((entry) => typeof entry === "string" && entry.startsWith("span:"))
    ? (value as readonly EffectTextSpanId[])
    : null;

const spotlightEntryForEvent = (
  event: EngineEvent,
): EffectSpotlightHistoryEntry | undefined => {
  if (
    event.type !== "spotlightEntryCreated" ||
    !isObjectRecord(event.payload)
  ) {
    return undefined;
  }
  const entry = event.payload["entry"];
  if (!isObjectRecord(entry)) {
    return undefined;
  }
  const id = entry["id"];
  const key = entry["key"];
  const semanticKey = entry["semanticKey"];
  const mode = entry["mode"];
  const status = entry["status"];
  if (
    typeof id !== "string" ||
    typeof key !== "string" ||
    typeof semanticKey !== "string" ||
    (mode !== "live" && mode !== "resolved") ||
    (status !== "pending" && status !== "resolved")
  ) {
    return undefined;
  }
  if (entry["kind"] === "combat") {
    const combat = entry["combat"];
    const resolvedEventId = entry["resolvedEventId"];
    if (!isObjectRecord(combat) || typeof resolvedEventId !== "string") {
      return undefined;
    }
    const eventKind = combat["eventKind"];
    if (mode !== "resolved" || status !== "resolved") {
      return undefined;
    }
    if (eventKind === "counterUsed") {
      const source = combat["source"];
      const target = combat["target"];
      if (!isCardRef(source) || !isCardRef(target)) {
        return undefined;
      }
      const counterPower = combat["counterPower"];
      const targetPower = combat["targetPower"];
      return {
        kind: "combat",
        id,
        key,
        semanticKey,
        mode,
        status,
        combat: {
          eventKind,
          source,
          target,
          ...(typeof counterPower === "number" ? { counterPower } : {}),
          ...(typeof targetPower === "number" ? { targetPower } : {}),
        },
        resolvedEventId: resolvedEventId as EngineEvent["id"],
      };
    }
    const attacker = combat["attacker"];
    const defender = combat["defender"];
    if (
      (eventKind !== "attackDeclared" &&
        eventKind !== "blockerActivated" &&
        eventKind !== "damageDealt") ||
      !isCardRef(attacker) ||
      !isCardRef(defender)
    ) {
      return undefined;
    }
    const attackerPower = combat["attackerPower"];
    const defenderPower = combat["defenderPower"];
    const amount = combat["amount"];
    if (eventKind === "damageDealt") {
      if (
        typeof attackerPower !== "number" ||
        typeof defenderPower !== "number" ||
        typeof amount !== "number"
      ) {
        return undefined;
      }
      return {
        kind: "combat",
        id,
        key,
        semanticKey,
        mode,
        status,
        combat: {
          eventKind,
          attacker,
          defender,
          attackerPower,
          defenderPower,
          amount,
        },
        resolvedEventId: resolvedEventId as EngineEvent["id"],
      };
    }
    return {
      kind: "combat",
      id,
      key,
      semanticKey,
      mode,
      status,
      combat: {
        eventKind,
        attacker,
        defender,
        ...(typeof attackerPower === "number" ? { attackerPower } : {}),
        ...(typeof defenderPower === "number" ? { defenderPower } : {}),
      },
      resolvedEventId: resolvedEventId as EngineEvent["id"],
    };
  }
  if (entry["kind"] === "playedCard") {
    const source = entry["source"];
    const resolvedEventId = entry["resolvedEventId"];
    if (
      !isCardRef(source) ||
      mode !== "resolved" ||
      status !== "resolved" ||
      typeof resolvedEventId !== "string"
    ) {
      return undefined;
    }
    return {
      kind: "playedCard",
      id,
      key,
      semanticKey,
      mode,
      status,
      source,
      resolvedEventId: resolvedEventId as EngineEvent["id"],
    };
  }
  const active = entry["active"];
  if (
    !isActiveEffectTextPresentation(active) ||
    (entry["kind"] !== undefined && entry["kind"] !== "effectText")
  ) {
    return undefined;
  }
  const pendingDecisionId = entry["pendingDecisionId"];
  const resolvedEventId = entry["resolvedEventId"];
  const activeSpanIds = stringArrayField(active.activeSpanIds);
  if (activeSpanIds === null) {
    return undefined;
  }
  return {
    ...(entry["kind"] === "effectText" ? { kind: "effectText" as const } : {}),
    id,
    key,
    semanticKey,
    mode,
    status,
    active,
    ...(typeof pendingDecisionId === "string"
      ? { pendingDecisionId: pendingDecisionId as PublicPendingDecisionId }
      : {}),
    ...(typeof resolvedEventId === "string"
      ? { resolvedEventId: resolvedEventId as EngineEvent["id"] }
      : {}),
  };
};

const isEffectTextSpotlightEntry = (
  entry: EffectSpotlightHistoryEntry,
): entry is EffectTextSpotlightHistoryEntry =>
  entry.kind === undefined || entry.kind === "effectText";

const effectTextContinuityKey = (
  entry: EffectTextSpotlightHistoryEntry,
): string =>
  [
    entry.active.textKind ?? "effect",
    String(entry.active.source.playerId),
    String(entry.active.source.instanceId),
    String(entry.active.source.cardId),
    entry.active.activeSpanIds.join("+"),
  ].join("|");

const removeStalePendingEffectTextEntries = (
  entries: readonly EffectSpotlightHistoryEntry[],
): readonly EffectSpotlightHistoryEntry[] => {
  const seenEffectTextKeys = new Set<string>();
  const kept: EffectSpotlightHistoryEntry[] = [];
  for (const entry of [...entries].reverse()) {
    if (!isEffectTextSpotlightEntry(entry)) {
      kept.push(entry);
      continue;
    }
    const key = effectTextContinuityKey(entry);
    if (entry.mode === "live" && entry.status === "pending") {
      if (seenEffectTextKeys.has(key)) {
        continue;
      }
      seenEffectTextKeys.add(key);
      kept.push(entry);
      continue;
    }
    seenEffectTextKeys.add(key);
    kept.push(entry);
  }
  return kept.reverse();
};

export const effectSpotlightHistoryFromPlayerViewState = ({
  events,
}: {
  readonly events: readonly EngineEvent[];
}): EffectSpotlightHistory | undefined => {
  const rawEntries = events.flatMap((event) => {
    const entry = spotlightEntryForEvent(event);
    return entry === undefined ? [] : [entry];
  });
  const entries = removeStalePendingEffectTextEntries(rawEntries);
  const presentKey = entries.at(-1)?.key;
  return entries.length === 0 || presentKey === undefined
    ? undefined
    : { entries, presentKey };
};
