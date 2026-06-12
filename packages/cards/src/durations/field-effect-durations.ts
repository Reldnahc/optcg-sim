import type { Duration } from "@optcg/types";

import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface DurationParseResult {
  readonly duration?: Duration;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

type DurationParser = (input: ParseInput) => DurationParseResult | undefined;

export type DurationParserSet = readonly DurationParser[];

export const opponentNextRefreshPhaseDurationPrimitive = {
  primitiveId: "duration:opponentNextRefreshPhase",
  matches: [{ id: "in-opponent-next-refresh-phase" }],
} as const;

export const opponentNextEndPhaseDurationPrimitive = {
  primitiveId: "duration:opponentNextEndPhase",
  matches: [
    { id: "until-end-opponent-next-end-phase" },
    { id: "until-end-opponent-next-turn" },
  ],
} as const;

export const thisTurnDurationPrimitive = {
  primitiveId: "duration:thisTurn",
  matches: [{ id: "during-this-turn" }],
} as const;

export const thisBattleDurationPrimitive = {
  primitiveId: "duration:thisBattle",
  matches: [{ id: "during-this-battle" }],
} as const;

export const selfNextTurnStartDurationPrimitive = {
  primitiveId: "duration:selfNextTurnStart",
  matches: [{ id: "until-start-self-next-turn" }],
} as const;

export function parseOpponentNextRefreshPhaseDuration(
  input: ParseInput,
): DurationParseResult | undefined {
  if (!/^in your opponent's next Refresh Phase\.?$/i.test(input.text)) {
    return undefined;
  }

  return {
    duration: { type: "untilStartOfNextTurn", player: "opponent" },
    evidence: ["duration:opponentNextRefreshPhase"],
    rest: "",
  };
}

export function parseOpponentNextEndPhaseDuration(
  input: ParseInput,
): DurationParseResult | undefined {
  if (
    !/^until the end of your opponent's next (?:End Phase|turn)\.?$/i.test(
      input.text,
    )
  ) {
    return undefined;
  }

  return {
    duration: { type: "untilEndOfNextTurn", player: "opponent" },
    evidence: ["duration:opponentNextEndPhase"],
    rest: "",
  };
}

export function parseSelfNextTurnStartDuration(
  input: ParseInput,
): DurationParseResult | undefined {
  if (!/^until the start of your next turn\.?$/i.test(input.text)) {
    return undefined;
  }

  return {
    duration: { type: "untilStartOfNextTurn", player: "self" },
    evidence: ["duration:selfNextTurnStart"],
    rest: "",
  };
}

export function parseThisTurnDuration(
  input: ParseInput,
): DurationParseResult | undefined {
  if (!/^during this turn\.?$/i.test(input.text)) {
    return undefined;
  }

  return {
    duration: { type: "thisTurn" },
    evidence: ["duration:thisTurn"],
    rest: "",
  };
}

export function parseThisBattleDuration(
  input: ParseInput,
): DurationParseResult | undefined {
  if (!/^during this battle\.?$/i.test(input.text)) {
    return undefined;
  }

  return {
    duration: { type: "thisBattle" },
    evidence: ["duration:thisBattle"],
    rest: "",
  };
}

export function parseDurationFromSet(
  input: ParseInput,
  parsers: DurationParserSet,
): DurationParseResult | undefined {
  for (const parser of parsers) {
    const parsed = parser(input);
    if (parsed !== undefined) {
      return parsed;
    }
  }
  return undefined;
}

export const fieldEffectDurationParsers = [
  parseOpponentNextEndPhaseDuration,
  parseOpponentNextRefreshPhaseDuration,
  parseSelfNextTurnStartDuration,
  parseThisTurnDuration,
  parseThisBattleDuration,
] as const;

export const battleDurationParsers = [parseThisBattleDuration] as const;

export const basePowerSwapDurationParsers = [
  parseThisTurnDuration,
  parseThisBattleDuration,
] as const;

export const restrictionDurationParsers = [
  parseOpponentNextEndPhaseDuration,
  parseOpponentNextRefreshPhaseDuration,
  parseThisTurnDuration,
] as const;

export const attackRestrictionDurationParsers = [
  parseOpponentNextEndPhaseDuration,
  parseThisTurnDuration,
] as const;

export const refreshRestrictionDurationParsers = [
  parseOpponentNextRefreshPhaseDuration,
  parseThisTurnDuration,
] as const;

export const thisTurnOnlyDurationParsers = [parseThisTurnDuration] as const;

export const opponentNextEndOnlyDurationParsers = [
  parseOpponentNextEndPhaseDuration,
] as const;

export const replacementDurationParsers = [parseThisTurnDuration] as const;

export const parseExplicitFieldEffectDuration = (
  input: ParseInput,
): DurationParseResult | undefined =>
  parseDurationFromSet(input, fieldEffectDurationParsers);
