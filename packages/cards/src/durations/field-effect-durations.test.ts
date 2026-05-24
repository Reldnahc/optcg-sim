import { describe, expect, it } from "vitest";

import {
  opponentNextEndPhaseDurationPrimitive,
  opponentNextRefreshPhaseDurationPrimitive,
  parseOpponentNextEndPhaseDuration,
  parseOpponentNextRefreshPhaseDuration,
} from "./field-effect-durations.js";

describe("field-effect duration parsers", () => {
  it("defines durations as primitive parents", () => {
    expect(opponentNextRefreshPhaseDurationPrimitive).toEqual({
      primitiveId: "duration:opponentNextRefreshPhase",
      matches: [{ id: "in-opponent-next-refresh-phase" }],
    });
    expect(opponentNextEndPhaseDurationPrimitive).toEqual({
      primitiveId: "duration:opponentNextEndPhase",
      matches: [{ id: "until-end-opponent-next-end-phase" }],
    });
  });

  it("parses opponent next Refresh Phase duration", () => {
    expect(
      parseOpponentNextRefreshPhaseDuration({
        text: "in your opponent's next Refresh Phase.",
      }),
    ).toEqual({
      evidence: ["duration:opponentNextRefreshPhase"],
      rest: "",
    });
  });

  it("parses opponent next End Phase duration", () => {
    expect(
      parseOpponentNextEndPhaseDuration({
        text: "until the end of your opponent's next End Phase.",
      }),
    ).toEqual({
      evidence: ["duration:opponentNextEndPhase"],
      rest: "",
    });
  });
});
