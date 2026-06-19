import type { PlayerRef, Trigger } from "@optcg/types";

import type { ExpressionParseResult } from "../../types.js";
import {
  containsCharacterCategoryText,
  parseCharacterFilter,
} from "../event-reaction-character-filter.js";
import type { ReactionPredicateParser } from "../event-reaction.js";

const anyOfTrigger = (triggers: readonly Trigger[]): Trigger => {
  const first = triggers[0];
  return first !== undefined && triggers.length === 1
    ? first
    : { type: "anyOf", triggers: [...triggers] };
};

const characterFieldRemovedForBothPlayers = (params: {
  readonly sourceController?: PlayerRef;
  readonly sourceKind: NonNullable<
    Extract<Trigger, { type: "fieldRemoved" }>["sourceKind"]
  >;
}): Trigger =>
  anyOfTrigger([
    {
      type: "fieldRemoved",
      player: "self",
      filter: { categories: ["character"] },
      sourceKind: params.sourceKind,
      ...(params.sourceController === undefined
        ? {}
        : { sourceController: params.sourceController }),
    },
    {
      type: "fieldRemoved",
      player: "opponent",
      filter: { categories: ["character"] },
      sourceKind: params.sourceKind,
      ...(params.sourceController === undefined
        ? {}
        : { sourceController: params.sourceController }),
    },
  ]);

const parseFieldRemovalSource = (
  text: string,
):
  | {
      readonly triggers: readonly Pick<
        Extract<Trigger, { type: "fieldRemoved" }>,
        "sourceController" | "sourceKind" | "destination"
      >[];
      readonly evidence: readonly ExpressionParseResult["evidence"][number][];
    }
  | undefined => {
  if (text.toLowerCase() === "k.o.'d") {
    return { triggers: [{ sourceKind: "ko" }], evidence: [] };
  }
  if (text.toLowerCase() === "removed from the field") {
    return { triggers: [{ sourceKind: "any" }], evidence: [] };
  }
  if (
    text.toLowerCase() === "removed from the field by your opponent's effect"
  ) {
    return {
      triggers: [{ sourceController: "opponent", sourceKind: "effect" }],
      evidence: ["replacementSource:opponent", "replacementSource:cardEffect"],
    };
  }
  if (text.toLowerCase() === "removed from the field by your effect") {
    return {
      triggers: [{ sourceController: "self", sourceKind: "effect" }],
      evidence: ["replacementSource:self", "replacementSource:cardEffect"],
    };
  }
  if (text.toLowerCase() === "removed from the field by an effect") {
    return {
      triggers: [{ sourceKind: "effect" }],
      evidence: ["replacementSource:cardEffect"],
    };
  }
  if (
    text.toLowerCase() ===
    "removed from the field by your opponent's effect or k.o.'d"
  ) {
    return {
      triggers: [
        { sourceController: "opponent", sourceKind: "effect" },
        { sourceKind: "ko" },
      ],
      evidence: [
        "replacementSource:opponent",
        "replacementSource:cardEffect",
        "composition:triggerAnyOf",
      ],
    };
  }
  if (text.toLowerCase() === "returned to the owner's hand by your effect") {
    return {
      triggers: [
        {
          sourceController: "self",
          sourceKind: "effect",
          destination: "hand",
        },
      ],
      evidence: ["replacementSource:cardEffect", "destination:hand"],
    };
  }
  return undefined;
};

const composeFieldRemovedTrigger = (
  base: Omit<Extract<Trigger, { type: "fieldRemoved" }>, "type">,
  source: {
    readonly triggers: readonly Pick<
      Extract<Trigger, { type: "fieldRemoved" }>,
      "sourceController" | "sourceKind" | "destination"
    >[];
  },
): Trigger =>
  anyOfTrigger(
    source.triggers.map((trigger) => ({
      type: "fieldRemoved",
      ...base,
      ...trigger,
    })),
  );

export const parseFieldRemovedPredicate: ReactionPredicateParser = ({
  text,
}) => {
  const normalized = text.trim();

  if (normalized.toLowerCase() === "a character is k.o.'d") {
    return {
      trigger: characterFieldRemovedForBothPlayers({ sourceKind: "ko" }),
      evidence: [
        "trigger:fieldRemoved",
        "player:self",
        "player:opponent",
        "composition:triggerAnyOf",
        "filter:category:character",
      ],
    };
  }

  if (
    normalized.toLowerCase() ===
    "a character is removed from the field by your effect"
  ) {
    return {
      trigger: characterFieldRemovedForBothPlayers({
        sourceController: "self",
        sourceKind: "effect",
      }),
      evidence: [
        "trigger:fieldRemoved",
        "player:self",
        "player:opponent",
        "composition:triggerAnyOf",
        "filter:category:character",
      ],
    };
  }

  const thisCharacterByOpponentEffect =
    /^this Character is K\.O\.'d by your opponent's effect$/iu.exec(normalized);
  if (thisCharacterByOpponentEffect !== null) {
    return {
      trigger: {
        type: "fieldRemoved",
        target: "self",
        player: "self",
        filter: { categories: ["character"] },
        sourceController: "opponent",
        sourceKind: "effect",
      },
      sourcePresencePolicy: "resolveFromLastKnownInformation",
      evidence: [
        "trigger:fieldRemoved",
        "target:thisCharacter",
        "player:self",
        "filter:category:character",
        "replacementSource:opponent",
        "replacementSource:cardEffect",
        "sourcePresence:resolveFromLastKnownInformation",
      ],
    };
  }

  const thisCharacterByAnyEffect =
    /^this Character is K\.O\.'d by an effect$/iu.exec(normalized);
  if (thisCharacterByAnyEffect !== null) {
    return {
      trigger: {
        type: "fieldRemoved",
        target: "self",
        player: "self",
        filter: { categories: ["character"] },
        sourceKind: "effect",
      },
      sourcePresencePolicy: "resolveFromLastKnownInformation",
      evidence: [
        "trigger:fieldRemoved",
        "target:thisCharacter",
        "player:self",
        "filter:category:character",
        "replacementSource:cardEffect",
        "sourcePresence:resolveFromLastKnownInformation",
      ],
    };
  }

  const thisCharacterKo = /^this Character is K\.O\.'d$/iu.exec(normalized);
  if (thisCharacterKo !== null) {
    return {
      trigger: {
        type: "fieldRemoved",
        target: "self",
        player: "self",
        filter: { categories: ["character"] },
        sourceKind: "ko",
      },
      sourcePresencePolicy: "resolveFromLastKnownInformation",
      evidence: [
        "trigger:fieldRemoved",
        "target:thisCharacter",
        "player:self",
        "filter:category:character",
        "sourcePresence:resolveFromLastKnownInformation",
      ],
    };
  }

  const battleKo =
    /^this Character battles and K\.O\.'s your opponent's (?<filter>.+)$/iu.exec(
      normalized,
    );
  const battleKoFilterText = battleKo?.groups?.["filter"];
  if (
    battleKoFilterText !== undefined &&
    containsCharacterCategoryText(battleKoFilterText)
  ) {
    const parsed = parseCharacterFilter(battleKoFilterText);
    if (parsed === undefined) {
      return undefined;
    }
    return {
      trigger: {
        type: "fieldRemoved",
        player: "opponent",
        filter: parsed.filter,
        sourceController: "self",
        sourceKind: "battle",
        sourceTarget: "self",
      },
      evidence: [
        "trigger:fieldRemoved",
        "player:opponent",
        ...parsed.evidence,
        "protectionSource:battle",
      ],
    };
  }

  const opponentCharacter =
    /^your opponent's (?<filter>.+) is (?<removal>K\.O\.'d|removed from the field(?: by (?:your effect|an effect))?|returned to the owner's hand by your effect)$/iu.exec(
      normalized,
    );
  const opponentFilterText = opponentCharacter?.groups?.["filter"];
  const opponentRemovalText = opponentCharacter?.groups?.["removal"];
  if (
    opponentFilterText !== undefined &&
    opponentRemovalText !== undefined &&
    containsCharacterCategoryText(opponentFilterText)
  ) {
    const parsed = parseCharacterFilter(opponentFilterText);
    const source = parseFieldRemovalSource(opponentRemovalText);
    if (parsed === undefined || source === undefined) {
      return undefined;
    }
    return {
      trigger: composeFieldRemovedTrigger(
        {
          player: "opponent",
          filter: parsed.filter,
        },
        source,
      ),
      evidence: [
        "trigger:fieldRemoved",
        "player:opponent",
        ...parsed.evidence,
        ...source.evidence,
      ],
    };
  }

  const yourCharacter =
    /^(?:one of your|your) (?<filter>.+) is (?<removal>K\.O\.'d|removed from the field(?: by (?:your opponent's effect(?: or K\.O\.'d)?|an effect))?)$/iu.exec(
      normalized,
    );
  const filterText = yourCharacter?.groups?.["filter"];
  const removalText = yourCharacter?.groups?.["removal"];
  if (
    filterText === undefined ||
    removalText === undefined ||
    !containsCharacterCategoryText(filterText)
  ) {
    return undefined;
  }

  const parsed = parseCharacterFilter(filterText);
  if (parsed === undefined) {
    return undefined;
  }
  const source = parseFieldRemovalSource(removalText);
  if (source === undefined) {
    return undefined;
  }

  return {
    trigger: composeFieldRemovedTrigger(
      {
        player: "self",
        filter: parsed.filter,
      },
      source,
    ),
    evidence: [
      "trigger:fieldRemoved",
      "player:self",
      ...parsed.evidence,
      ...source.evidence,
    ],
  };
};
