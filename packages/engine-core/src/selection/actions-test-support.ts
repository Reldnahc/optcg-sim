import assert from "node:assert/strict";

import type {
  CardRef,
  DecisionResponse,
  EngineError,
  EngineEvent,
  EngineResult,
} from "@optcg/types";

import { must } from "../action-test-fixtures.js";

export const assertEventsAppendToJournal = (
  result: EngineResult,
  label: string,
): void => {
  const assertStrictlyIncreasing = (
    events: readonly EngineEvent[],
    eventLabel: string,
  ): void => {
    for (let index = 1; index < events.length; index += 1) {
      const previous = must(events[index - 1], `${eventLabel} previous event`);
      const current = must(events[index], `${eventLabel} current event`);
      assert.ok(
        current.seq > previous.seq,
        `${eventLabel} seq must increase at index ${String(index)}`,
      );
    }
  };

  assertStrictlyIncreasing(result.events, `${label} result events`);
  assertStrictlyIncreasing(result.state.eventJournal, `${label} journal`);
  assert.deepEqual(
    result.state.eventJournal
      .slice(result.state.eventJournal.length - result.events.length)
      .map((event) => event.id),
    result.events.map((event) => event.id),
    `${label} events must append to journal in order`,
  );
};

export const eventReplaySnapshot = (
  result: EngineResult,
  expectedTypes: readonly string[],
  label: string,
): {
  eventSeq: readonly number[];
  eventTypes: readonly string[];
  journalSeq: readonly number[];
} => {
  assert.deepEqual(
    result.events.map((event) => event.type),
    expectedTypes,
  );
  assertEventsAppendToJournal(result, label);
  return {
    eventSeq: result.events.map((event) => event.seq),
    eventTypes: result.events.map((event) => event.type),
    journalSeq: result.state.eventJournal.map((event) => event.seq),
  };
};

export const invalidResponseCases: ReadonlyArray<{
  name: string;
  response: (targets: readonly CardRef[]) => DecisionResponse;
  reason: Extract<EngineError, { type: "invalidDecisionResponse" }>["reason"];
}> = [
  {
    name: "wrong response type",
    response: (targets) => ({ type: "cards", cards: [must(targets[0], "t0")] }),
    reason: "Response type must be targets for selectTargets.",
  },
  {
    name: "malformed target element",
    response: () => ({
      type: "targets",
      targets: [null as unknown as CardRef],
    }),
    reason: "Response targets must be CardRef values.",
  },
  {
    name: "malformed target zone",
    response: (targets) => ({
      type: "targets",
      targets: [
        {
          ...must(targets[0], "t0"),
          zone: null,
        } as unknown as CardRef,
      ],
    }),
    reason: "Response targets must be CardRef values.",
  },
  {
    name: "duplicate target",
    response: (targets) => ({
      type: "targets",
      targets: [must(targets[0], "t0"), must(targets[0], "t0")],
    }),
    reason: "Selected targets must not contain duplicates.",
  },
  {
    name: "non-candidate target",
    response: (targets) => ({
      type: "targets",
      targets: [
        {
          ...must(targets[0], "t0"),
          instanceId: "forged-target" as CardRef["instanceId"],
        },
      ],
    }),
    reason: "Selected targets must be active target candidates.",
  },
  {
    name: "too few targets",
    response: () => ({ type: "targets", targets: [] }),
    reason: "Selected target count is below the required minimum.",
  },
  {
    name: "too many targets",
    response: (targets) => ({
      type: "targets",
      targets: [must(targets[0], "t0"), must(targets[1], "t1")],
    }),
    reason: "Selected target count exceeds the allowed maximum.",
  },
];
