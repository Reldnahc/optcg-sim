import { describe, expect, it } from "vitest";

import {
  opponentNextEndPhaseDurationPrimitive,
  opponentNextRefreshPhaseDurationPrimitive,
  parseOpponentNextEndPhaseDuration,
  parseOpponentNextRefreshPhaseDuration,
  parseThisTurnDuration,
  thisTurnDurationPrimitive,
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
    expect(thisTurnDurationPrimitive).toEqual({
      primitiveId: "duration:thisTurn",
      matches: [{ id: "during-this-turn" }],
    });
  });

  it("parses opponent next Refresh Phase duration", () => {
    expect(
      parseOpponentNextRefreshPhaseDuration({
        text: "in your opponent's next Refresh Phase.",
      }),
    ).toEqual({
      duration: { type: "untilStartOfNextTurn", player: "opponent" },
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
      duration: { type: "untilEndOfNextTurn", player: "opponent" },
      evidence: ["duration:opponentNextEndPhase"],
      rest: "",
    });
  });

  it("parses this turn duration", () => {
    expect(parseThisTurnDuration({ text: "during this turn." })).toEqual({
      duration: { type: "thisTurn" },
      evidence: ["duration:thisTurn"],
      rest: "",
    });
  });
});
