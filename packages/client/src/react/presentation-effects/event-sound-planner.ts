import type { PlayerId } from "@optcg/types";

import type { PresentationEventIntent } from "./event-presentation-intents.js";
import type {
  PresentationSoundCue,
  PresentationSoundIntent,
} from "./sound-planner.js";

export interface EventSoundPlannerInput {
  readonly intents: readonly PresentationEventIntent[];
  readonly movementEventIds: ReadonlySet<string>;
  readonly currentPlayerId: PlayerId;
}

export const planEventSoundIntents = ({
  intents,
  movementEventIds,
}: EventSoundPlannerInput): PresentationSoundIntent[] =>
  intents.flatMap((intent) => {
    if (movementEventIds.has(intent.eventId)) {
      return [];
    }
    const cue: PresentationSoundCue | undefined = intent.soundCue;
    return cue === undefined
      ? []
      : [{ id: `sound:event:${intent.eventId}`, cue }];
  });
