import type {
  ActiveEffectTextPresentation,
  CardId,
  EngineEvent,
  InstanceId,
  PlayerView,
  PlayerId,
} from "@optcg/types";

interface EffectSpotlightActiveSource {
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

const latestResolvedSpotlightSource = (
  events: readonly EngineEvent[],
): EffectSpotlightActiveSource | undefined => {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === "effectQueued") {
      return undefined;
    }
    if (event?.type === "cardPlayed") {
      return playedCardPresentation(event);
    }
    if (event?.type !== "effectResolved" || !isObjectRecord(event.payload)) {
      continue;
    }
    const presentation = event.payload["presentation"];
    if (isActiveEffectTextPresentation(presentation)) {
      return {
        active: presentation,
        key: String(event.id),
        mode: "resolved",
      };
    }
  }
  return undefined;
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
    return {
      active: activeEffectText,
      key: liveKey(activeEffectText, "active"),
      mode: "live",
    };
  }
  return latestResolvedSpotlightSource(events);
};
