import { describe, expect, it } from "vitest";

import {
  battleDurationParsers,
  fieldEffectDurationParsers,
  opponentNextEndPhaseDurationPrimitive,
  opponentNextRefreshPhaseDurationPrimitive,
  parseDurationFromSet,
  parseOpponentNextEndPhaseDuration,
  parseOpponentNextRefreshPhaseDuration,
  parseSelfNextRefreshPhaseDuration,
  parseThisTurnDuration,
  replacementDurationParsers,
  refreshRestrictionDurationParsers,
  restrictionDurationParsers,
  selfNextRefreshPhaseDurationPrimitive,
  thisTurnDurationPrimitive,
} from "./index.js";

describe("field-effect duration parsers", () => {
  it("defines durations as primitive parents", () => {
    expect(opponentNextRefreshPhaseDurationPrimitive).toEqual({
      primitiveId: "duration:opponentNextRefreshPhase",
      matches: [{ id: "in-opponent-next-refresh-phase" }],
    });
    expect(opponentNextEndPhaseDurationPrimitive).toEqual({
      primitiveId: "duration:opponentNextEndPhase",
      matches: [
        { id: "until-end-opponent-next-end-phase" },
        { id: "until-end-opponent-next-turn" },
      ],
    });
    expect(selfNextRefreshPhaseDurationPrimitive).toEqual({
      primitiveId: "duration:selfNextRefreshPhase",
      matches: [{ id: "in-self-next-refresh-phase" }],
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

  it("parses self next Refresh Phase duration", () => {
    expect(
      parseSelfNextRefreshPhaseDuration({
        text: "in your next Refresh Phase.",
      }),
    ).toEqual({
      duration: { type: "untilStartOfNextTurn", player: "self" },
      evidence: ["duration:selfNextRefreshPhase"],
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

  it("parses durations through named semantic capability groups", () => {
    expect(
      parseDurationFromSet(
        { text: "until the start of your next turn" },
        fieldEffectDurationParsers,
      ),
    ).toMatchObject({
      duration: { type: "untilStartOfNextTurn", player: "self" },
      evidence: ["duration:selfNextTurnStart"],
      rest: "",
    });

    expect(
      parseDurationFromSet(
        { text: "in your next Refresh Phase" },
        refreshRestrictionDurationParsers,
      ),
    ).toMatchObject({
      duration: { type: "untilStartOfNextTurn", player: "self" },
      evidence: ["duration:selfNextRefreshPhase"],
      rest: "",
    });

    expect(
      parseDurationFromSet(
        { text: "during this battle" },
        battleDurationParsers,
      ),
    ).toMatchObject({
      duration: { type: "thisBattle" },
      evidence: ["duration:thisBattle"],
      rest: "",
    });
  });

  it("fails closed when a duration is outside the semantic group", () => {
    expect(
      parseDurationFromSet(
        { text: "during this battle" },
        restrictionDurationParsers,
      ),
    ).toBeUndefined();

    expect(
      parseDurationFromSet(
        { text: "until the start of your next turn" },
        replacementDurationParsers,
      ),
    ).toBeUndefined();
  });
});
