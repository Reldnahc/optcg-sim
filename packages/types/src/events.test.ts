import { expect, test } from "vitest";

import type {
  CausalityRef,
  EffectId,
  EngineEvent,
  EngineEventId,
  EventVisibility,
  PlayerId,
  QueueEntryId,
  ReplacementAppliedEventPayload,
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

test("replacementApplied payload exposes only deterministic public identifiers and hashes", () => {
  const payload: ReplacementAppliedEventPayload = {
    processId: "queue-entry:ko:target:0",
    replacementId: "replacement:would-be-ko-draw-1",
    previousPayloadHash:
      "4b2d7f5c1b9b19d13c35f534cc22a0a139f8dcadc9f32d363c5cfbb2ef20b52c",
    transformedPayloadHash:
      "85b22c569ae90b3db0bd0a0ddfdacaa30b1fd10949c898367dbb8bb7e2d16f88",
  };
  const event: EngineEvent = {
    id: "event-replacement-applied" as EngineEventId,
    seq: 1,
    type: "replacementApplied",
    payload,
    visibility: { type: "public" },
    createdAtStateSeq: 1 as StateSeq,
    causedBy: { type: "replacement", replacementId: payload.replacementId },
  };

  expect(event.payload).toBe(payload);
});
