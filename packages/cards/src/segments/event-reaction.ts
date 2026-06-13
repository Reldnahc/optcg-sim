import type { Condition, PlayerRef, Trigger } from "@optcg/types";

import type { ExpressionParseResult, ParseInput } from "../types.js";
import type { SourceSlice } from "../source-slices.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import { parseAngleAttribute } from "../filters/predicates/types.js";
import {
  containsCharacterCategoryText,
  parseCharacterFilter,
} from "./event-reaction-character-filter.js";
import { parseAttackDeclaredPredicate } from "./event-reaction-predicates/attack-declared.js";
import { parseActivationPredicate } from "./event-reaction-predicates/activation.js";

const lifeRemovedTrigger = (
  players: PlayerRef[],
  destination?: Extract<Trigger, { type: "lifeRemoved" }>["destination"],
): Trigger => ({
  type: "lifeRemoved",
  players,
  ...(destination === undefined ? {} : { destination }),
});

const damageDealtTrigger = (players: PlayerRef[]): Trigger => ({
  type: "damageDealt",
  players,
});

const anyOfTrigger = (triggers: readonly Trigger[]): Trigger => {
  const first = triggers[0];
  return first !== undefined && triggers.length === 1
    ? first
    : { type: "anyOf", triggers: [...triggers] };
};

const handTrashedByEffectTrigger = (
  sourceFilter?: Extract<
    Trigger,
    { type: "handTrashedByEffect" }
  >["sourceFilter"],
): Trigger => ({
  type: "handTrashedByEffect",
  player: "self",
  ...(sourceFilter === undefined ? {} : { sourceFilter }),
});

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

const bodySource = (
  input: ParseInput,
  body: string,
): SourceSlice | undefined => {
  if (input.source === undefined) {
    return undefined;
  }
  const bodyStart = input.text.indexOf(body);
  if (bodyStart < 0) {
    return undefined;
  }
  return {
    text: body,
    rawText: body,
    start: input.source.start + bodyStart,
    end: input.source.start + bodyStart + body.length,
  };
};

const parseReactionBody = (
  expressionParser: (input: ParseInput) => ExpressionParseResult | undefined,
  input: ParseInput,
  body: string,
): ExpressionParseResult | undefined => {
  const source = bodySource(input, body);
  return expressionParser({
    text: body,
    ...(source === undefined ? {} : { source }),
  });
};

const toSequenceExpression = (
  parsed: ExpressionParseResult,
): ExpressionParseResult["effect"] =>
  parsed.effect.type === "sequence"
    ? parsed.effect
    : {
        type: "sequence",
        effects: [{ connector: "always", effect: parsed.effect }],
      };

const onlyMatchingCharactersCondition = (
  text: string,
):
  | { condition: Condition; evidence: ExpressionParseResult["evidence"] }
  | undefined => {
  const match = /^you only have Characters with (?<predicate>.+)$/iu.exec(text);
  const predicateText = match?.groups?.["predicate"];
  if (predicateText === undefined) {
    return undefined;
  }
  const parsed = parseCardFilterPredicates(
    { text: `Characters with ${predicateText}` },
    { powerSemantics: "current" },
  );
  if (
    parsed === undefined ||
    parsed.rest.length > 0 ||
    parsed.filter.categories?.includes("character") !== true
  ) {
    return undefined;
  }
  return {
    condition: {
      type: "onlyMatchingFieldCards",
      zone: "characterArea",
      player: "self",
      filter: parsed.filter,
    },
    evidence: [
      "condition:onlyMatchingFieldCards",
      "player:self",
      "zone:characterArea",
      ...parsed.evidence,
    ],
  };
};

export interface ReactionPredicateInput {
  readonly text: string;
  readonly entryPoint?: ParseInput["entryPoint"];
}

export interface ReactionPredicateResult {
  readonly trigger: Trigger;
  readonly evidence: ExpressionParseResult["evidence"];
  readonly condition?: Condition;
  readonly allowBodyBlockPatch?: boolean;
}

export type ReactionPredicateParser = (
  input: ReactionPredicateInput,
) => ReactionPredicateResult | undefined;

export function parseReactionPredicateFromSet(
  input: ReactionPredicateInput,
  parsers: readonly ReactionPredicateParser[],
): ReactionPredicateResult | undefined {
  for (const parser of parsers) {
    const parsed = parser(input);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  const alternatives = reactionPredicateAlternatives(input.text);
  if (alternatives.length < 2) {
    return undefined;
  }
  const parsed = alternatives.map((text) =>
    parseReactionPredicateFromSet({ ...input, text }, parsers),
  );
  if (parsed.some((predicate) => predicate === undefined)) {
    return undefined;
  }
  return composeReactionPredicates(
    parsed.filter(
      (predicate): predicate is ReactionPredicateResult =>
        predicate !== undefined,
    ),
  );
}

function reactionPredicateAlternatives(text: string): readonly string[] {
  const normalized = text.trim();
  const whenAlternatives = normalized.split(/,\s+or\s+when\s+/iu);
  if (whenAlternatives.length > 1) {
    return whenAlternatives.map((part) => part.trim());
  }
  return normalized
    .split(/\s+or\s+(?=(?:you|your)\b(?!\s+opponent's\b))/iu)
    .map((part) => part.trim());
}

function composeReactionPredicates(
  predicates: readonly ReactionPredicateResult[],
): ReactionPredicateResult | undefined {
  if (predicates.length === 0) {
    return undefined;
  }
  if (predicates.length === 1) {
    return predicates[0];
  }
  if (predicates.some((predicate) => predicate.condition !== undefined)) {
    return undefined;
  }
  return {
    trigger: composeReactionTriggers(
      predicates.map((predicate) => predicate.trigger),
    ),
    evidence: [
      ...predicates.flatMap((predicate) => predicate.evidence),
      "composition:triggerAnyOf",
    ],
    ...(predicates.some((predicate) => predicate.allowBodyBlockPatch === true)
      ? { allowBodyBlockPatch: true }
      : {}),
  };
}

function composeReactionTriggers(triggers: readonly Trigger[]): Trigger {
  const first = triggers[0];
  if (
    first?.type === "cardPlayed" &&
    triggers.every(
      (trigger) =>
        trigger.type === "cardPlayed" &&
        trigger.player === first.player &&
        trigger.anyOf === undefined,
    )
  ) {
    return {
      type: "cardPlayed",
      player: first.player,
      anyOf: triggers.map((trigger) => {
        if (trigger.type !== "cardPlayed") {
          return {};
        }
        return {
          ...(trigger.filter === undefined ? {} : { filter: trigger.filter }),
          ...(trigger.sourceZone === undefined
            ? {}
            : { sourceZone: trigger.sourceZone }),
          ...(trigger.sourceFilter === undefined
            ? {}
            : { sourceFilter: trigger.sourceFilter }),
        };
      }),
    };
  }
  return anyOfTrigger(triggers);
}

const parseLifeRemovedPredicate: ReactionPredicateParser = ({ text }) => {
  const normalized = text.trim();
  const addedToHand = /^a card is added to your hand from your Life$/iu.exec(
    normalized,
  );
  if (addedToHand !== null) {
    return {
      trigger: lifeRemovedTrigger(["self"], "hand"),
      evidence: ["trigger:lifeRemoved", "player:self", "destination:hand"],
    };
  }

  const removed =
    /^a card is removed from (?<owner>your|your opponent's|your or your opponent's) Life cards$/iu.exec(
      normalized,
    );
  const owner = removed?.groups?.["owner"];
  if (owner === undefined) {
    return undefined;
  }

  const parsedOwner = parseLifeRemovedOwner(owner);
  return {
    trigger: lifeRemovedTrigger(parsedOwner.players),
    evidence: ["trigger:lifeRemoved", ...parsedOwner.evidence],
  };
};

const parseLifeRemovedOwner = (
  owner: string,
): {
  readonly players: PlayerRef[];
  readonly evidence: readonly ExpressionParseResult["evidence"][number][];
} => {
  const normalized = owner.toLowerCase();
  if (normalized === "your") {
    return { players: ["self"], evidence: ["player:self"] };
  }
  if (normalized === "your opponent's") {
    return { players: ["opponent"], evidence: ["player:opponent"] };
  }
  return {
    players: ["self", "opponent"],
    evidence: ["player:self", "player:opponent"],
  };
};

const parseDonReturnedPredicate: ReactionPredicateParser = ({ text }) => {
  const returned =
    /^a DON!! card on (?<field>your|the) field is returned to your DON!! deck(?<byYourEffect> by your effect)?$/iu.exec(
      text.trim(),
    );
  if (returned === null) {
    return undefined;
  }

  const byYourEffect = returned.groups?.["byYourEffect"] !== undefined;
  return {
    trigger: {
      type: "donReturned",
      player: "self",
      ...(byYourEffect
        ? {
            sourceController: "self" as const,
            sourceKind: "effect" as const,
          }
        : {}),
    },
    evidence: [
      "trigger:donReturned",
      "player:self",
      ...(byYourEffect ? (["replacementSource:cardEffect"] as const) : []),
    ],
  };
};

const parseFieldRemovedPredicate: ReactionPredicateParser = ({ text }) => {
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
      evidence: [
        "trigger:fieldRemoved",
        "target:thisCharacter",
        "player:self",
        "filter:category:character",
        "replacementSource:opponent",
        "replacementSource:cardEffect",
      ],
    };
  }

  const yourCharacter =
    /^(?:one of your|your) (?<filter>.+) is (?<removal>K\.O\.'d|removed from the field(?: by your opponent's effect(?: or K\.O\.'d)?)?)$/iu.exec(
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
    trigger: {
      type: "fieldRemoved",
      player: "self",
      filter: parsed.filter,
      ...source.trigger,
    },
    evidence: [
      "trigger:fieldRemoved",
      "player:self",
      ...parsed.evidence,
      ...source.evidence,
    ],
  };
};

const parseFieldRemovalSource = (
  text: string,
):
  | {
      readonly trigger: Pick<
        Extract<Trigger, { type: "fieldRemoved" }>,
        "sourceController" | "sourceKind"
      >;
      readonly evidence: readonly ExpressionParseResult["evidence"][number][];
    }
  | undefined => {
  if (text.toLowerCase() === "k.o.'d") {
    return { trigger: { sourceKind: "ko" }, evidence: [] };
  }
  if (text.toLowerCase() === "removed from the field") {
    return { trigger: { sourceKind: "any" }, evidence: [] };
  }
  if (
    text.toLowerCase() === "removed from the field by your opponent's effect"
  ) {
    return {
      trigger: { sourceController: "opponent", sourceKind: "effect" },
      evidence: ["replacementSource:opponent", "replacementSource:cardEffect"],
    };
  }
  if (
    text.toLowerCase() ===
    "removed from the field by your opponent's effect or k.o.'d"
  ) {
    return {
      trigger: { sourceController: "opponent", sourceKind: "any" },
      evidence: ["replacementSource:opponent"],
    };
  }
  return undefined;
};

const parseCardPlayedPredicate: ReactionPredicateParser = ({ text }) => {
  const normalized = text.trim();

  const playedFromTrash =
    /^(?:a|your) (?<filter>.+) is played from your trash$/iu.exec(normalized);
  const trashFilter = playedFromTrash?.groups?.["filter"];
  if (trashFilter !== undefined && containsCharacterCategoryText(trashFilter)) {
    const parsed = parseCharacterFilter(trashFilter);
    if (parsed === undefined) {
      return undefined;
    }
    return {
      trigger: {
        type: "cardPlayed",
        player: "self",
        sourceZone: "trash",
        filter: parsed.filter,
      },
      evidence: [
        "trigger:cardPlayed",
        "player:self",
        "zone:trash",
        ...parsed.evidence,
      ],
    };
  }

  const played = /^(?<player>you|your opponent) plays? (?<filter>.+)$/iu.exec(
    normalized,
  );
  const playedPlayer = played?.groups?.["player"];
  const playedFilter = played?.groups?.["filter"];
  if (
    playedPlayer === undefined ||
    playedFilter === undefined ||
    !containsCharacterCategoryText(playedFilter)
  ) {
    return undefined;
  }

  const sourceEffect = parsePlayedUsingSourceEffect(playedFilter);
  const parsed = parseCharacterFilter(sourceEffect?.filterText ?? playedFilter);
  if (parsed === undefined) {
    return undefined;
  }
  const source = sourceEffect?.sourceFilterText;
  const parsedSource =
    source === undefined ? undefined : parseCharacterFilter(source);
  if (source !== undefined && parsedSource === undefined) {
    return undefined;
  }
  const player = playedPlayer.toLowerCase() === "you" ? "self" : "opponent";
  return {
    trigger: {
      type: "cardPlayed",
      player,
      filter: parsed.filter,
      ...(parsedSource === undefined
        ? {}
        : { sourceFilter: parsedSource.filter }),
    },
    evidence: [
      "trigger:cardPlayed",
      `player:${player}`,
      ...parsed.evidence,
      ...(parsedSource?.evidence ?? []),
    ],
  };
};

function parsePlayedUsingSourceEffect(
  text: string,
):
  | { readonly filterText: string; readonly sourceFilterText: string }
  | undefined {
  const match = /^(?<filter>.+?)\s+using\s+(?<source>.+)'s effect$/iu.exec(
    text.trim(),
  );
  const filterText = match?.groups?.["filter"];
  const sourceFilterText = match?.groups?.["source"];
  return filterText === undefined || sourceFilterText === undefined
    ? undefined
    : { filterText, sourceFilterText };
}

const parseCardRestedPredicate: ReactionPredicateParser = ({ text }) => {
  const normalized = text.trim();

  if (normalized.toLowerCase() === "this character becomes rested") {
    return {
      trigger: {
        type: "cardRested",
        target: "self",
        player: "self",
        filter: { categories: ["character"] },
      },
      evidence: [
        "trigger:cardRested",
        "target:thisCharacter",
        "player:self",
        "filter:category:character",
      ],
    };
  }

  if (
    normalized.toLowerCase() ===
    "this character is rested by your opponent's effect"
  ) {
    return {
      trigger: {
        type: "cardRested",
        target: "self",
        player: "self",
        filter: { categories: ["character"] },
        sourceController: "opponent",
        sourceKind: "effect",
      },
      evidence: [
        "trigger:cardRested",
        "target:thisCharacter",
        "player:self",
        "filter:category:character",
        "replacementSource:opponent",
        "replacementSource:cardEffect",
      ],
    };
  }

  const sourceFiltered =
    /^this Character (?:becomes|is) rested by your opponent's (?<source>.+)'s effect$/iu.exec(
      normalized,
    );
  const sourceText = sourceFiltered?.groups?.["source"];
  if (sourceText !== undefined) {
    const source = parseCharacterFilter(sourceText);
    if (source === undefined) {
      return undefined;
    }
    return {
      trigger: {
        type: "cardRested",
        target: "self",
        player: "self",
        filter: { categories: ["character"] },
        sourceController: "opponent",
        sourceKind: "effect",
        sourceFilter: source.filter,
      },
      evidence: [
        "trigger:cardRested",
        "target:thisCharacter",
        "player:self",
        "filter:category:character",
        "replacementSource:opponent",
        "replacementSource:cardEffect",
        ...source.evidence,
      ],
    };
  }

  return undefined;
};

const parseHandTrashedByEffectPredicate: ReactionPredicateParser = ({
  text,
}) => {
  const handTrashedByEffect =
    /^a card is trashed from your hand by (?:(?:an effect)|(?:your \{(?<type>[^}]+)\} type card's effect))$/iu.exec(
      text.trim(),
    );
  if (handTrashedByEffect === null) {
    return undefined;
  }

  const sourceType = handTrashedByEffect.groups?.["type"];
  return {
    trigger: handTrashedByEffectTrigger(
      sourceType === undefined ? undefined : { typesAny: [sourceType] },
    ),
    evidence: [
      "trigger:handTrashedByEffect",
      "zone:hand",
      "destination:trash",
      "player:self",
      ...(sourceType === undefined ? [] : (["filter:type"] as const)),
    ],
  };
};

const activatedReactionSpecificPredicate: ReactionPredicateParser = ({
  text,
  entryPoint,
}) => {
  const normalized = text.trim();

  if (normalized.toLowerCase() === "your opponent attacks") {
    return {
      trigger: { type: "onOpponentAttack" },
      evidence: ["entry:onOpponentAttack"],
    };
  }

  if (normalized.toLowerCase() === "your opponent's character attacks") {
    return {
      trigger: {
        type: "onOpponentAttack",
        attackerFilter: { categories: ["character"] },
      },
      evidence: ["entry:onOpponentAttack", "filter:category:character"],
    };
  }

  if (entryPoint?.trigger.type === "onOpponentAttack") {
    const condition = onlyMatchingCharactersCondition(normalized);
    if (condition !== undefined) {
      return {
        trigger: { type: "onOpponentAttack" },
        condition: condition.condition,
        evidence: ["entry:onOpponentAttack", ...condition.evidence],
      };
    }
  }

  return undefined;
};

export const activatedReactionPredicateParsers: readonly ReactionPredicateParser[] =
  [
    parseLifeRemovedPredicate,
    parseDonReturnedPredicate,
    parseFieldRemovedPredicate,
    parseCardPlayedPredicate,
    parseActivationPredicate,
    parseCardRestedPredicate,
    parseAttackDeclaredPredicate,
    parseHandTrashedByEffectPredicate,
    activatedReactionSpecificPredicate,
  ] as const;

const activatedReactionPredicate = (
  text: string,
  entryPoint: ParseInput["entryPoint"],
):
  | {
      trigger: Trigger;
      evidence: ExpressionParseResult["evidence"];
      condition?: Condition;
    }
  | undefined => {
  return parseReactionPredicateFromSet(
    { text, ...(entryPoint === undefined ? {} : { entryPoint }) },
    activatedReactionPredicateParsers,
  );
};

const implicitReactionSpecificPredicate: ReactionPredicateParser = ({
  text,
}) => {
  const normalized = text.trim();

  if (normalized.toLowerCase() === "you take damage") {
    return {
      trigger: damageDealtTrigger(["self"]),
      evidence: ["trigger:damageDealt", "player:self"],
    };
  }

  return undefined;
};

export const implicitReactionPredicateParsers: readonly ReactionPredicateParser[] =
  [
    parseLifeRemovedPredicate,
    parseDonReturnedPredicate,
    parseFieldRemovedPredicate,
    parseCardPlayedPredicate,
    parseActivationPredicate,
    parseCardRestedPredicate,
    parseAttackDeclaredPredicate,
    parseHandTrashedByEffectPredicate,
    implicitReactionSpecificPredicate,
  ] as const;

const implicitReactionPredicates = (
  text: string,
):
  | {
      trigger: Trigger;
      evidence: ExpressionParseResult["evidence"];
      allowBodyBlockPatch?: boolean;
    }
  | undefined => {
  const predicates = text
    .split(/\s+or\s+(?=(?:you|your)\b(?!\s+opponent's\b))/iu)
    .map((part) =>
      parseReactionPredicateFromSet(
        { text: part },
        implicitReactionPredicateParsers,
      ),
    );
  if (predicates.some((predicate) => predicate === undefined)) {
    return undefined;
  }
  const parsed = predicates.filter(
    (predicate): predicate is NonNullable<typeof predicate> =>
      predicate !== undefined,
  );
  if (parsed.length === 0) {
    return undefined;
  }
  return {
    trigger: anyOfTrigger(parsed.map((predicate) => predicate.trigger)),
    ...(parsed.some((predicate) => predicate.allowBodyBlockPatch === true)
      ? { allowBodyBlockPatch: true }
      : {}),
    evidence: [
      ...parsed.flatMap((predicate) => predicate.evidence),
      ...(parsed.length > 1 ? (["composition:triggerAnyOf"] as const) : []),
    ],
  };
};

const activatedReactionBodyPredicate = (
  predicate: ReturnType<typeof activatedReactionPredicate>,
  when: string,
  body: string,
):
  | {
      predicate: NonNullable<ReturnType<typeof activatedReactionPredicate>>;
      body: string;
    }
  | undefined => {
  if (predicate === undefined) {
    return undefined;
  }

  const optionalCostAndBody =
    /^You may (?<cost>trash this Character)\s+and\s+(?<body>.+)$/iu.exec(body);
  const optionalCost = optionalCostAndBody?.groups?.["cost"];
  const optionalCostBody = optionalCostAndBody?.groups?.["body"];
  if (optionalCost !== undefined && optionalCostBody !== undefined) {
    return {
      predicate,
      body: `You may ${optionalCost}: ${optionalCostBody}`,
    };
  }

  const attackerAttribute =
    /^If that Character has the (?<attribute>[<＜][^>＞]+[>＞]) attribute,\s*(?<body>.+)$/iu.exec(
      body,
    );
  const attribute = parseAngleAttribute(
    attackerAttribute?.groups?.["attribute"] ?? "",
  );
  const nextBody = attackerAttribute?.groups?.["body"];
  if (
    when.trim().toLowerCase() === "your opponent's character attacks" &&
    predicate.trigger.type === "onOpponentAttack" &&
    attribute !== undefined &&
    nextBody !== undefined
  ) {
    return {
      predicate: {
        ...predicate,
        trigger: {
          ...predicate.trigger,
          attackerFilter: {
            ...(predicate.trigger.attackerFilter ?? {}),
            categories: ["character"],
            attributesAny: [attribute],
          },
        },
        evidence: [...predicate.evidence, "filter:attribute"],
      },
      body: nextBody,
    };
  }

  return { predicate, body };
};

export function implicitEventReactionExpressionParser(options: {
  readonly expressions: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input: ParseInput) => {
    const match = /^When (?<when>.+?),\s*(?<body>.+)$/iu.exec(input.text);
    const when = match?.groups?.["when"];
    const body = match?.groups?.["body"];
    if (when === undefined || body === undefined) {
      return undefined;
    }
    const predicate = implicitReactionPredicates(when);
    if (predicate === undefined) {
      return undefined;
    }

    for (const expressionParser of options.expressions) {
      const parsed = parseReactionBody(expressionParser, input, body);
      if (parsed === undefined || parsed.rest.length > 0) {
        continue;
      }
      if (
        parsed.blockPatch !== undefined &&
        predicate.allowBodyBlockPatch !== true
      ) {
        continue;
      }
      return {
        effect: parsed.effect,
        evidence: [...predicate.evidence, ...parsed.evidence],
        rest: "",
        blockPatch: {
          ...parsed.blockPatch,
          category: "auto",
          trigger: predicate.trigger,
        },
        ...(parsed.presentationSpans === undefined
          ? {}
          : { presentationSpans: parsed.presentationSpans }),
      };
    }

    return undefined;
  };
}

export function activatedReactionExpressionParser(options: {
  readonly expressions: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input: ParseInput) => {
    const prefix = "This effect can be activated when ";
    if (!input.text.startsWith(prefix)) {
      return undefined;
    }

    for (const split of activatedReactionSplits(
      input.text.slice(prefix.length),
    )) {
      const refined = activatedReactionBodyPredicate(
        activatedReactionPredicate(split.when, input.entryPoint),
        split.when,
        split.body,
      );
      if (refined === undefined) {
        continue;
      }
      for (const expressionParser of options.expressions) {
        const parsed = parseReactionBody(expressionParser, input, refined.body);
        if (parsed === undefined || parsed.rest.length > 0) {
          continue;
        }
        return {
          effect: toSequenceExpression(parsed),
          evidence: [
            "activation:reaction",
            ...refined.predicate.evidence,
            ...(parsed.effect.type === "sequence"
              ? []
              : (["expression:sequence"] as const)),
            ...parsed.evidence,
          ],
          rest: "",
          blockPatch: {
            ...parsed.blockPatch,
            category: "activate",
            trigger: refined.predicate.trigger,
            ...(refined.predicate.condition === undefined
              ? {}
              : { condition: refined.predicate.condition }),
          },
          ...(parsed.presentationSpans === undefined
            ? {}
            : { presentationSpans: parsed.presentationSpans }),
        };
      }
    }

    return undefined;
  };
}

const activatedReactionSplits = (
  text: string,
): Array<{ readonly when: string; readonly body: string }> => {
  const splits: Array<{ readonly when: string; readonly body: string }> = [];
  for (const match of text.matchAll(/\.\s+/gu)) {
    const index = match.index;
    if (isAbbreviationPeriod(text, index)) {
      continue;
    }
    const when = text.slice(0, index).trim();
    const body = text.slice(index + match[0].length).trim();
    if (when.length > 0 && body.length > 0) {
      splits.push({ when, body });
    }
  }
  return splits;
};

const isAbbreviationPeriod = (text: string, index: number): boolean =>
  text.slice(Math.max(0, index - 3), index + 1).toLowerCase() === "k.o.";
