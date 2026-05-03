import { expect, test } from "vitest";

import type {
  CausalityRef,
  EffectId,
  EngineEvent,
  EngineEventId,
  EventVisibility,
  QueueEntryId,
  StateSeq,
} from "./index.js";

test("event concern contracts compile", () => {
  const visibility: EventVisibility = { type: "public" };
  const causedBy: CausalityRef = {
    type: "effect",
    queueEntryId: "queue-1" as QueueEntryId,
    effectId: "effect-1" as EffectId,
  };
  const event: EngineEvent = {
    id: "event-1" as EngineEventId,
    seq: 1,
    type: "cardMoved",
    payload: {},
    visibility,
    createdAtStateSeq: 1 as StateSeq,
    causedBy,
  };

  expect(event.type).toBe("cardMoved");
});
