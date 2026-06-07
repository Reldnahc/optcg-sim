import type {
  ActiveEffectTextPresentation,
  EngineEvent,
  PlayerView,
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

const latestResolvedEffectPresentation = (
  events: readonly EngineEvent[],
): EffectSpotlightActiveSource | undefined => {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
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
  return latestResolvedEffectPresentation(events);
};
