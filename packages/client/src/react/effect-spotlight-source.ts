import type {
  ActiveEffectTextPresentation,
  EngineEvent,
  PlayerView,
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

const latestResolvedEffectPresentation = (
  events: readonly EngineEvent[],
): ActiveEffectTextPresentation | undefined => {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type !== "effectResolved" || !isObjectRecord(event.payload)) {
      continue;
    }
    const presentation = event.payload["presentation"];
    if (isActiveEffectTextPresentation(presentation)) {
      return presentation;
    }
  }
  return undefined;
};

export const activeEffectTextForSpotlight = ({
  activeEffectText,
  events,
  pendingDecision,
}: {
  readonly activeEffectText: PlayerView["activeEffectText"];
  readonly pendingDecision: PlayerView["pendingDecision"];
  readonly events: readonly EngineEvent[];
}): ActiveEffectTextPresentation | undefined =>
  activeEffectText ??
  pendingDecision?.presentation.activeEffectText ??
  latestResolvedEffectPresentation(events);
