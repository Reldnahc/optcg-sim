import type { CardId, Effect, SelectionId } from "@optcg/types";
import {
  buildSequenceEffect,
  toEffectId,
  type ReusableComposedParserClause,
} from "./composed-parser-builder.js";

export const startOfGameTypedStagePlayParserRuleId =
  "exact:start-of-game:play-up-to-1-typed-stage-from-self-deck";

export type StartOfGameTimingPhraseParse = {
  readonly bodyText: string;
  readonly prefix: "at the start of the game, ";
};

export type PlayVerbParse = {
  readonly bodyText: string;
  readonly prefix: "play ";
};

export type UpToOneCardinalityParse = {
  readonly bodyText: string;
  readonly max: 1;
  readonly min: 0;
  readonly text: "up to 1";
};

export type TypedStageFilterParse = {
  readonly bodyText: string;
  readonly category: "stage";
  readonly typeName: string;
};

export type SelfDeckSourceParse = {
  readonly bodyText: "";
  readonly sourceZone: "deck";
};

export function parseStartOfGameTimingPhrase(
  sourceText: string,
): StartOfGameTimingPhraseParse | undefined {
  const prefix = "at the start of the game, " as const;
  if (!sourceText.startsWith(prefix)) {
    return undefined;
  }

  return {
    bodyText: sourceText.slice(prefix.length),
    prefix,
  };
}

export function parsePlayVerbPrefix(
  sourceText: string,
): PlayVerbParse | undefined {
  const prefix = "play " as const;
  if (!sourceText.startsWith(prefix)) {
    return undefined;
  }

  return {
    bodyText: sourceText.slice(prefix.length),
    prefix,
  };
}

export function parseUpToOneCardinalityPrefix(
  sourceText: string,
): UpToOneCardinalityParse | undefined {
  const prefix = "up to 1 ";
  if (!sourceText.startsWith(prefix)) {
    return undefined;
  }

  return {
    bodyText: sourceText.slice(prefix.length),
    max: 1,
    min: 0,
    text: "up to 1",
  };
}

export function parseTypedStageFilter(
  sourceText: string,
): TypedStageFilterParse | undefined {
  const match = /^\{([^{}]+)\} type Stage card(.*)$/.exec(sourceText);
  if (match === null) {
    return undefined;
  }

  const typeName = match[1]?.trim() ?? "";
  const bodyText = match[2] ?? "";
  if (typeName.length === 0 || bodyText.length === 0) {
    return undefined;
  }

  return {
    bodyText,
    category: "stage",
    typeName,
  };
}

export function parseSelfDeckSourceSuffix(
  sourceText: string,
): SelfDeckSourceParse | undefined {
  return sourceText === " from your deck" || sourceText === " from your deck."
    ? { bodyText: "", sourceZone: "deck" }
    : undefined;
}

export function parseStartOfGameTypedStagePlayClause(
  cardId: CardId,
  sourceText: string,
): ReusableComposedParserClause | undefined {
  const timing = parseStartOfGameTimingPhrase(sourceText);
  if (timing === undefined) {
    return undefined;
  }

  const play = parsePlayVerbPrefix(timing.bodyText);
  if (play === undefined) {
    return undefined;
  }

  const cardinality = parseUpToOneCardinalityPrefix(play.bodyText);
  if (cardinality === undefined) {
    return undefined;
  }

  const filter = parseTypedStageFilter(cardinality.bodyText);
  if (filter === undefined) {
    return undefined;
  }

  if (parseSelfDeckSourceSuffix(filter.bodyText) === undefined) {
    return undefined;
  }

  const selection = "selected:start-of-game" as SelectionId;
  return {
    effectBlock: {
      category: "auto",
      effect: buildSequenceEffect([
        {
          connector: "always",
          effect: createStartOfGameStageSearchEffect({
            max: cardinality.max,
            min: cardinality.min,
            typeName: filter.typeName,
          }),
        },
        {
          connector: "ifPreviousSucceeded",
          effect: {
            ignoreCost: true,
            selection,
            type: "playSelected",
          },
        },
      ]),
      id: toEffectId(
        `${String(cardId)}:auto-start-of-game-play-up-to-1-typed-stage-from-self-deck`,
      ),
      sourcePresencePolicy: "mustRemainInSameZone",
      trigger: { type: "startOfGame" },
    },
    parserRuleId: startOfGameTypedStagePlayParserRuleId,
  };
}

export function createStartOfGameStageSearchEffect({
  max,
  min,
  typeName,
}: {
  readonly max: 1;
  readonly min: 0;
  readonly typeName: string;
}): Effect {
  return {
    request: {
      destination: "stageArea",
      filter: {
        categories: ["stage"],
        typesAny: [typeName],
      },
      max,
      min,
      player: "self",
      revealTo: "chooserOnly",
      shuffleAfter: false,
      zone: "deck",
    },
    type: "search",
  };
}
