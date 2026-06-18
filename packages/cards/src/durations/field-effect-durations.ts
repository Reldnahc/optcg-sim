import type { Duration } from "@optcg/types";

import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface DurationParseResult {
  readonly duration?: Duration;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

type DurationParser = (input: ParseInput) => DurationParseResult | undefined;

export type DurationParserSet = readonly DurationParser[];

interface NextTurnEndDurationParseOptions {
  readonly player: Extract<Duration, { type: "untilEndOfNextTurn" }>["player"];
  readonly pattern: RegExp;
  readonly evidence: PrimitiveEvidence;
}

interface NextTurnStartDurationParseOptions {
  readonly player: Extract<
    Duration,
    { type: "untilStartOfNextTurn" }
  >["player"];
  readonly pattern: RegExp;
  readonly evidence: PrimitiveEvidence;
}

export const opponentNextRefreshPhaseDurationPrimitive = {
  primitiveId: "duration:opponentNextRefreshPhase",
  matches: [{ id: "in-opponent-next-refresh-phase" }],
} as const;

export const selfNextRefreshPhaseDurationPrimitive = {
  primitiveId: "duration:selfNextRefreshPhase",
  matches: [{ id: "in-self-next-refresh-phase" }],
} as const;

export const opponentNextEndPhaseDurationPrimitive = {
  primitiveId: "duration:opponentNextEndPhase",
  matches: [
    { id: "until-end-opponent-next-end-phase" },
    { id: "until-end-opponent-next-turn" },
  ],
} as const;

export const selfNextEndPhaseDurationPrimitive = {
  primitiveId: "duration:selfNextEndPhase",
  matches: [{ id: "until-end-self-next-turn" }],
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
  return parseNextTurnStartDuration(input, {
    player: "opponent",
    pattern: /^in your opponent's next Refresh Phase\.?$/i,
    evidence: "duration:opponentNextRefreshPhase",
  });
}

export function parseSelfNextRefreshPhaseDuration(
  input: ParseInput,
): DurationParseResult | undefined {
  return parseNextTurnStartDuration(input, {
    player: "self",
    pattern: /^in your next Refresh Phase\.?$/i,
    evidence: "duration:selfNextRefreshPhase",
  });
}

export function parseOpponentNextEndPhaseDuration(
  input: ParseInput,
): DurationParseResult | undefined {
  return parseNextTurnEndDuration(input, {
    player: "opponent",
    pattern: /^until the end of your opponent's next (?:End Phase|turn)\.?$/i,
    evidence: "duration:opponentNextEndPhase",
  });
}

export function parseSelfNextEndPhaseDuration(
  input: ParseInput,
): DurationParseResult | undefined {
  return parseNextTurnEndDuration(input, {
    player: "self",
    pattern: /^until the end of your next turn\.?$/i,
    evidence: "duration:selfNextEndPhase",
  });
}

function parseNextTurnEndDuration(
  input: ParseInput,
  options: NextTurnEndDurationParseOptions,
): DurationParseResult | undefined {
  if (!options.pattern.test(input.text)) {
    return undefined;
  }

  return {
    duration: { type: "untilEndOfNextTurn", player: options.player },
    evidence: [options.evidence],
    rest: "",
  };
}

export function parseSelfNextTurnStartDuration(
  input: ParseInput,
): DurationParseResult | undefined {
  return parseNextTurnStartDuration(input, {
    player: "self",
    pattern: /^until the start of your next turn\.?$/i,
    evidence: "duration:selfNextTurnStart",
  });
}

function parseNextTurnStartDuration(
  input: ParseInput,
  options: NextTurnStartDurationParseOptions,
): DurationParseResult | undefined {
  if (!options.pattern.test(input.text)) {
    return undefined;
  }

  return {
    duration: { type: "untilStartOfNextTurn", player: options.player },
    evidence: [options.evidence],
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
  parseSelfNextEndPhaseDuration,
  parseOpponentNextRefreshPhaseDuration,
  parseSelfNextRefreshPhaseDuration,
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
  parseSelfNextTurnStartDuration,
  parseThisTurnDuration,
] as const;

export const refreshRestrictionDurationParsers = [
  parseOpponentNextRefreshPhaseDuration,
  parseSelfNextRefreshPhaseDuration,
  parseThisTurnDuration,
] as const;

export const thisTurnOnlyDurationParsers = [parseThisTurnDuration] as const;

export const opponentNextEndOnlyDurationParsers = [
  parseOpponentNextEndPhaseDuration,
] as const;

export const selfNextTurnStartOnlyDurationParsers = [
  parseSelfNextTurnStartDuration,
] as const;

export const replacementDurationParsers = [parseThisTurnDuration] as const;
