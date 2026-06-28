import type { EngineEvent, PlayerId } from "@optcg/types";

import {
  presentationZoneKey,
  type PresentationZoneKey,
} from "./movement-planner.js";
import type { PresentationSoundCue } from "./sound-cues.js";

export type PresentationEventSoundCue = Extract<
  PresentationSoundCue,
  | "attach"
  | "counter"
  | "damage"
  | "ko"
  | "move"
  | "rest"
  | "return"
  | "reveal"
  | "shuffle"
  | "trigger"
>;

export interface PresentationEventMovementRoute {
  readonly instanceId: string;
  readonly category: "don" | "hidden";
  readonly fromZoneKey: PresentationZoneKey;
  readonly toZoneKey: PresentationZoneKey;
}

export interface PresentationEventIntent {
  readonly eventId: string;
  readonly soundCue?: PresentationEventSoundCue | undefined;
  readonly movementRoute?: PresentationEventMovementRoute | undefined;
}

export interface PresentationEventPlannerInput {
  readonly events: readonly EngineEvent[];
  readonly currentPlayerId: PlayerId;
}

const eventSoundCues: Partial<
  Record<EngineEvent["type"], PresentationEventSoundCue>
> = {
  cardKOd: "ko",
  cardRested: "rest",
  cardRevealed: "reveal",
  counterUsed: "counter",
  damageDealt: "damage",
  deckShuffled: "shuffle",
  donAttached: "attach",
  donReturned: "return",
  lifeTaken: "damage",
  triggerActivated: "trigger",
};

const soundCueForEvent = (
  event: EngineEvent,
): PresentationEventSoundCue | undefined => eventSoundCues[event.type];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const donAttachedMovementRoute = (
  event: EngineEvent,
  currentPlayerId: PlayerId,
): PresentationEventMovementRoute | undefined => {
  if (event.type !== "donAttached" || !isRecord(event.payload)) {
    return undefined;
  }
  const donInstanceId = event.payload["donInstanceId"];
  if (typeof donInstanceId !== "string") {
    return undefined;
  }
  const fromZoneKey = presentationZoneKey(
    event.payload["from"],
    currentPlayerId,
  );
  const toZoneKey = presentationZoneKey(event.payload["to"], currentPlayerId);
  return fromZoneKey === undefined || toZoneKey === undefined
    ? undefined
    : {
        instanceId: donInstanceId,
        category: "don",
        fromZoneKey,
        toZoneKey,
      };
};

const movementRouteForEvent = (
  event: EngineEvent,
  currentPlayerId: PlayerId,
): PresentationEventMovementRoute | undefined =>
  donAttachedMovementRoute(event, currentPlayerId);

export const planPresentationEventIntents = ({
  events,
  currentPlayerId,
}: PresentationEventPlannerInput): PresentationEventIntent[] =>
  events.flatMap((event) => {
    const soundCue = soundCueForEvent(event);
    const movementRoute = movementRouteForEvent(event, currentPlayerId);
    return soundCue === undefined && movementRoute === undefined
      ? []
      : [
          {
            eventId: String(event.id),
            ...(soundCue === undefined ? {} : { soundCue }),
            ...(movementRoute === undefined ? {} : { movementRoute }),
          },
        ];
  });
