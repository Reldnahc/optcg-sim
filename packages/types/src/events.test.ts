import { expect, test } from "vitest";

import type {
  CausalityRef,
  EffectId,
  EngineEvent,
  EngineEventId,
  EventVisibility,
  PlayerId,
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

test("event visibility variants compile for canonical union", () => {
  const publicVisibility: EventVisibility = { type: "public" };
  const privateVisibility: EventVisibility = {
    type: "private",
    playerId: "player-1" as PlayerId,
  };
  const hiddenVisibility: EventVisibility = { type: "hidden" };
  const replayOnlyVisibility: EventVisibility = { type: "replayOnly" };
  const serverOnlyVisibility: EventVisibility = { type: "serverOnly" };

  expect(publicVisibility.type).toBe("public");
  expect(privateVisibility.type).toBe("private");
  expect(hiddenVisibility.type).toBe("hidden");
  expect(replayOnlyVisibility.type).toBe("replayOnly");
  expect(serverOnlyVisibility.type).toBe("serverOnly");
});
