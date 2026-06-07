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

const lifeRemovedTrigger = (players: PlayerRef[]): Trigger => ({
  type: "lifeRemoved",
  players,
});

const handTrashedByEffectTrigger = (): Trigger => ({
  type: "handTrashedByEffect",
  player: "self",
});

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
  const normalized = text.trim();

  if (
    normalized.toLowerCase() ===
    "a card is removed from your or your opponent's life cards"
  ) {
    return {
      trigger: lifeRemovedTrigger(["self", "opponent"]),
      evidence: ["trigger:lifeRemoved", "player:self", "player:opponent"],
    };
  }

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
      trigger: {
        type: "fieldRemoved",
        player: "self",
        filter: { categories: ["character"] },
        sourceController: "self",
        sourceKind: "effect",
      },
      evidence: [
        "trigger:fieldRemoved",
        "player:self",
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
              cost: { op: "gte", value: 8 },
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

export function lifeRemovedReactionExpressionParser(options: {
  readonly expressions: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input: ParseInput) => {
    const match =
      /^when a card is removed from your or your opponent's Life cards,\s*(?<body>.+)$/i.exec(
        input.text,
      );
    const body = match?.groups?.["body"];
    if (body === undefined) {
      return undefined;
    }

    for (const expressionParser of options.expressions) {
      const parsed = parseReactionBody(expressionParser, input, body);
      if (parsed === undefined || parsed.rest.length > 0) {
        continue;
      }
      return {
        effect: parsed.effect,
        evidence: [
          "trigger:lifeRemoved",
          "player:self",
          "player:opponent",
          ...parsed.evidence,
        ],
        rest: "",
        blockPatch: {
          category: "auto",
          trigger: lifeRemovedTrigger(["self", "opponent"]),
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

export function opponentEventOrBlockerActivatedExpressionParser(options: {
  readonly expressions: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input: ParseInput) => {
    const match =
      /^When your opponent activates (?<activation>an Event or \[Blocker\]|\[Blocker\]),\s*(?<body>.+)$/iu.exec(
        input.text,
      );
    const activation = match?.groups?.["activation"];
    const body = match?.groups?.["body"];
    if (activation === undefined || body === undefined) {
      return undefined;
    }
    const isBlockerOnly = activation.toLowerCase() === "[blocker]";

    for (const expressionParser of options.expressions) {
      const parsed = parseReactionBody(expressionParser, input, body);
      if (parsed === undefined || parsed.rest.length > 0) {
        continue;
      }
      return {
        effect: parsed.effect,
        evidence: [
          "trigger:opponentActivated",
          ...(isBlockerOnly ? [] : (["activation:event"] as const)),
          "activation:blocker",
          ...parsed.evidence,
        ],
        rest: "",
        blockPatch: {
          ...parsed.blockPatch,
          category: "auto",
          trigger: isBlockerOnly
            ? opponentBlockerActivatedTrigger()
            : opponentEventOrBlockerActivatedTrigger(),
        },
        ...(parsed.presentationSpans === undefined
          ? {}
          : { presentationSpans: parsed.presentationSpans }),
      };
    }

    return undefined;
  };
}

export function handTrashedByEffectReactionExpressionParser(options: {
  readonly expressions: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input: ParseInput) => {
    const match =
      /^When a card is trashed from your hand by an effect,\s*(?<body>.+)$/iu.exec(
        input.text,
      );
    const body = match?.groups?.["body"];
    if (body === undefined) {
      return undefined;
    }

    for (const expressionParser of options.expressions) {
      const parsed = parseReactionBody(expressionParser, input, body);
      if (parsed === undefined || parsed.rest.length > 0) {
        continue;
      }
      return {
        effect: parsed.effect,
        evidence: [
          "trigger:handTrashedByEffect",
          "zone:hand",
          "destination:trash",
          "player:self",
          ...parsed.evidence,
        ],
        rest: "",
        blockPatch: {
          ...parsed.blockPatch,
          category: "auto",
          trigger: handTrashedByEffectTrigger(),
        },
        ...(parsed.presentationSpans === undefined
          ? {}
          : { presentationSpans: parsed.presentationSpans }),
      };
    }

    return undefined;
  };
}
