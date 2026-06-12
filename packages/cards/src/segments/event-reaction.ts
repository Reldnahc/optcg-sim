import type {
  Attribute,
  CardFilter,
  Condition,
  PlayerRef,
  Trigger,
} from "@optcg/types";

import type { ExpressionParseResult, ParseInput } from "../types.js";
import type { SourceSlice } from "../source-slices.js";
import { parseCardFilterPredicates } from "../filters/index.js";

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

const triggerActivatedForBothPlayers = (): Trigger =>
  anyOfTrigger([
    { type: "triggerActivated", player: "self" },
    { type: "triggerActivated", player: "opponent" },
  ]);

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

const opponentEventOrBlockerActivatedTrigger = (): Trigger => ({
  type: "opponentActivated",
  activations: ["event", "blocker"],
});

const opponentBlockerActivatedTrigger = (): Trigger => ({
  type: "opponentActivated",
  activations: ["blocker"],
});

const activatedEventOrTriggerTrigger = (): Trigger => ({
  type: "opponentActivated",
  activations: ["event", "trigger"],
});

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

const parseCharacterFilter = (
  text: string,
): { filter: CardFilter; evidence: ExpressionParseResult["evidence"] } => {
  const parsed = parseCardFilterPredicates(
    { text },
    { powerSemantics: "printed" },
  );
  if (
    parsed === undefined ||
    parsed.rest.length > 0 ||
    parsed.filter.categories?.includes("character") !== true
  ) {
    return {
      filter: { categories: ["character"] },
      evidence: ["filter:category:character"],
    };
  }
  return { filter: parsed.filter, evidence: parsed.evidence };
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

  return undefined;
}

const parseSharedLifeRemovedEitherPlayerPredicate: ReactionPredicateParser = ({
  text,
}) => {
  if (
    text.trim().toLowerCase() !==
    "a card is removed from your or your opponent's life cards"
  ) {
    return undefined;
  }

  return {
    trigger: lifeRemovedTrigger(["self", "opponent"]),
    evidence: ["trigger:lifeRemoved", "player:self", "player:opponent"],
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

  if (
    normalized.toLowerCase() === "your opponent activates an event or [trigger]"
  ) {
    return {
      trigger: activatedEventOrTriggerTrigger(),
      evidence: [
        "trigger:opponentActivated",
        "activation:event",
        "activation:trigger",
      ],
    };
  }

  const removedByYourEffect =
    /^a Character is removed from the field by your effect$/iu.exec(normalized);
  if (removedByYourEffect !== null) {
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

  const yourTypedOpponentRemoved =
    /^your (?<filter>.+? Character(?: card)?) is removed from the field by your opponent's effect or K\.O\.'d$/iu.exec(
      normalized,
    );
  const opponentRemovedFilter = yourTypedOpponentRemoved?.groups?.["filter"];
  if (opponentRemovedFilter !== undefined) {
    const parsed = parseCharacterFilter(opponentRemovedFilter);
    return {
      trigger: {
        type: "fieldRemoved",
        player: "self",
        filter: parsed.filter,
        sourceController: "opponent",
        sourceKind: "any",
      },
      evidence: ["trigger:fieldRemoved", "player:self", ...parsed.evidence],
    };
  }

  const yourTypedRemoved =
    /^your (?<filter>.+? Character(?: card)?) is removed from the field$/iu.exec(
      normalized,
    );
  const yourTypedFilter = yourTypedRemoved?.groups?.["filter"];
  if (yourTypedFilter !== undefined) {
    const parsed = parseCharacterFilter(yourTypedFilter);
    return {
      trigger: {
        type: "fieldRemoved",
        player: "self",
        filter: parsed.filter,
        sourceKind: "any",
      },
      evidence: ["trigger:fieldRemoved", "player:self", ...parsed.evidence],
    };
  }

  if (normalized.toLowerCase() === "you play a character with a [trigger]") {
    return {
      trigger: {
        type: "cardPlayed",
        player: "self",
        filter: {
          categories: ["character"],
          effectEntryPoint: { mode: "with", trigger: { type: "trigger" } },
        },
      },
      evidence: [
        "trigger:cardPlayed",
        "player:self",
        "filter:category:character",
        "filter:effectEntryPoint",
        "filter:effectEntryPoint:with",
      ],
    };
  }

  if (
    normalized.toLowerCase() ===
    "your opponent plays a character with a base cost of 8 or more, or when your opponent plays a character using a character's effect"
  ) {
    return {
      trigger: {
        type: "cardPlayed",
        player: "opponent",
        anyOf: [
          {
            filter: {
              categories: ["character"],
              baseCost: { op: "gte", value: 8 },
            },
          },
          {
            filter: { categories: ["character"] },
            sourceFilter: { categories: ["character"] },
          },
        ],
      },
      evidence: [
        "trigger:cardPlayed",
        "player:opponent",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
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
        "player:self",
        "filter:category:character",
      ],
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
    parseSharedLifeRemovedEitherPlayerPredicate,
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

  const opponentActivation =
    /^your opponent activates (?<activation>an Event or \[Blocker\]|\[Blocker\])$/iu.exec(
      normalized,
    );
  const activation = opponentActivation?.groups?.["activation"];
  if (activation !== undefined) {
    const isBlockerOnly = activation.toLowerCase() === "[blocker]";
    return {
      trigger: isBlockerOnly
        ? opponentBlockerActivatedTrigger()
        : opponentEventOrBlockerActivatedTrigger(),
      allowBodyBlockPatch: true,
      evidence: [
        "trigger:opponentActivated",
        ...(isBlockerOnly ? [] : (["activation:event"] as const)),
        "activation:blocker",
      ],
    };
  }

  const handTrashedByEffect =
    /^a card is trashed from your hand by (?:(?:an effect)|(?:your \{(?<type>[^}]+)\} type card's effect))$/iu.exec(
      normalized,
    );
  if (handTrashedByEffect !== null) {
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
  }

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

  if (normalized.toLowerCase() === "a [trigger] activates") {
    return {
      trigger: triggerActivatedForBothPlayers(),
      evidence: [
        "activation:trigger",
        "player:self",
        "player:opponent",
        "composition:triggerAnyOf",
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

  const yourTypedKOD = /^your (?<filter>.+) is K\.O\.'d$/iu.exec(normalized);
  const yourTypedFilter = yourTypedKOD?.groups?.["filter"];
  if (
    yourTypedFilter !== undefined &&
    /\bCharacter(?: card)?\b/iu.test(yourTypedFilter)
  ) {
    const parsed = parseCharacterFilter(yourTypedFilter);
    return {
      trigger: {
        type: "fieldRemoved",
        player: "self",
        filter: parsed.filter,
        sourceKind: "ko",
      },
      evidence: ["trigger:fieldRemoved", "player:self", ...parsed.evidence],
    };
  }

  if (
    normalized.toLowerCase() ===
    "this character is k.o.'d by your opponent's effect"
  ) {
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

  const donReturned =
    /^a DON!! card on (?:your|the) field is returned to your DON!! deck(?<byYourEffect> by your effect)?$/iu.exec(
      normalized,
    );
  if (donReturned !== null) {
    const byYourEffect = donReturned.groups?.["byYourEffect"] !== undefined;
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
        ...(byYourEffect
          ? (["player:self", "replacementSource:cardEffect"] as const)
          : []),
      ],
    };
  }

  if (
    normalized.toLowerCase() === "a card is added to your hand from your life"
  ) {
    return {
      trigger: lifeRemovedTrigger(["self"], "hand"),
      evidence: ["trigger:lifeRemoved", "player:self", "destination:hand"],
    };
  }

  const lifeRemoved =
    /^a card is removed from (?<player>your|your opponent's) Life cards$/iu.exec(
      normalized,
    );
  const lifeRemovedPlayer = lifeRemoved?.groups?.["player"];
  if (lifeRemovedPlayer !== undefined) {
    const player =
      lifeRemovedPlayer.toLowerCase() === "your" ? "self" : "opponent";
    return {
      trigger: lifeRemovedTrigger([player]),
      evidence: ["trigger:lifeRemoved", `player:${player}`],
    };
  }

  const characterPlayed =
    /^(?<player>you|your opponent) plays? (?<filter>.+? Character(?: card)?)$/iu.exec(
      normalized,
    );
  const characterPlayedPlayer = characterPlayed?.groups?.["player"];
  const characterPlayedFilter = characterPlayed?.groups?.["filter"];
  if (
    characterPlayedPlayer !== undefined &&
    characterPlayedFilter !== undefined
  ) {
    const parsed = parseCharacterFilter(characterPlayedFilter);
    const player =
      characterPlayedPlayer.toLowerCase() === "you" ? "self" : "opponent";
    return {
      trigger: {
        type: "cardPlayed",
        player,
        filter: parsed.filter,
      },
      evidence: ["trigger:cardPlayed", `player:${player}`, ...parsed.evidence],
    };
  }

  const yourTrashCardPlayed =
    /^(?:a|your) (?<filter>.+? Character(?: card)?) is played from your trash$/iu.exec(
      normalized,
    );
  const yourTrashPlayedFilter = yourTrashCardPlayed?.groups?.["filter"];
  if (yourTrashPlayedFilter !== undefined) {
    const parsed = parseCharacterFilter(yourTrashPlayedFilter);
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

  return undefined;
};

export const implicitReactionPredicateParsers: readonly ReactionPredicateParser[] =
  [
    parseSharedLifeRemovedEitherPlayerPredicate,
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
    /^If that Character has the <(?<attribute>[^>]+)> attribute,\s*(?<body>.+)$/iu.exec(
      body,
    );
  const attribute = attackerAttribute?.groups?.["attribute"];
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
            attributesAny: [attribute as Attribute],
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
