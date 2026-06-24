import type {
  CardFilter,
  Condition,
  Effect,
  EffectTextSpan,
  SelectionId,
} from "@optcg/types";

import { parseExactCardinality } from "../cardinality/index.js";
import { parseThenConnector } from "../connectors/index.js";
import { parseExpression } from "../expression-parser.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import { sourceSpan } from "../source-slices.js";
import type {
  ExpressionParseResult,
  InstructionParser,
  ParseInput,
  PrimitiveEvidence,
} from "../types.js";
import { syntheticInstructionSegmentParser } from "./synthetic.js";

const opponentHandRevealSelection =
  "handSelection:opponent-hand-reveal" as SelectionId;

export function opponentHandRevealExpressionParser(options: {
  readonly instructions: readonly InstructionParser[];
  readonly expressions?: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input) => {
    const parsed = parseOpponentHandRevealPrefix(input.text);
    if (parsed === undefined) {
      return undefined;
    }

    const selectedReveal = createOpponentHandRevealSequence(parsed.count);
    if (parsed.rest.length === 0) {
      const evidence = selectedReveal.evidence;
      return {
        effect: selectedReveal.effect,
        evidence,
        ...bodyPresentation(input, evidence),
        rest: "",
      };
    }

    const conditional = parseRevealedCardConditionalBody(parsed.rest, options);
    if (conditional === undefined) {
      return undefined;
    }

    const evidence: readonly PrimitiveEvidence[] = [
      ...selectedReveal.evidence,
      "condition:cardMatches",
      ...conditional.evidence,
    ];

    return {
      effect: {
        type: "sequence",
        effects: [
          ...selectedReveal.effect.effects,
          {
            connector: "then",
            effect: conditional.effect,
          },
        ],
      },
      evidence,
      ...bodyPresentation(input, evidence),
      rest: "",
    };
  };
}

function parseOpponentHandRevealPrefix(text: string):
  | {
      readonly count: number;
      readonly rest: string;
    }
  | undefined {
  const match =
    /^Choose (?<selection>.+?) from your opponent's hand;\s*your opponent reveals (?:that|those) cards?(?:\.\s*(?<rest>[\s\S]+))?\.?$/iu.exec(
      text,
    );
  const selectionText = match?.groups?.["selection"];
  const restText = match?.groups?.["rest"];
  if (selectionText === undefined) {
    return undefined;
  }
  const cardinality = parseExactCardinality({ text: selectionText });
  if (
    cardinality === undefined ||
    !/^cards?$/iu.test(cardinality.rest.trim())
  ) {
    return undefined;
  }
  return {
    count: cardinality.count,
    rest: restText?.trim() ?? "",
  };
}

function createOpponentHandRevealSequence(count: number): {
  readonly effect: Extract<Effect, { type: "sequence" }>;
  readonly evidence: readonly PrimitiveEvidence[];
} {
  return {
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          saveResultAs: opponentHandRevealSelection,
          effect: {
            type: "selectCards",
            zone: "hand",
            player: "opponent",
            chooser: "self",
            min: count,
            max: count,
            saveAs: opponentHandRevealSelection,
            visibility: "chooserOnly",
          },
        },
        {
          connector: "then",
          effect: {
            type: "revealSelected",
            selection: opponentHandRevealSelection,
            visibility: "bothPlayers",
          },
        },
      ],
    },
    evidence: [
      "expression:sequence",
      "instruction:selectCards",
      "count:positiveInteger",
      "zone:hand",
      "player:opponent",
      "chooser:self",
      "instruction:revealSelected",
      "reveal:bothPlayers",
    ],
  };
}

function parseRevealedCardConditionalBody(
  text: string,
  options: {
    readonly instructions: readonly InstructionParser[];
    readonly expressions?: readonly ((
      input: ParseInput,
    ) => ExpressionParseResult | undefined)[];
  },
): ExpressionParseResult | undefined {
  const match =
    /^If the revealed card is (?<predicate>.+?),\s*(?<body>[\s\S]+)$/iu.exec(
      text,
    );
  const predicateText = match?.groups?.["predicate"]?.trim();
  const bodyText = match?.groups?.["body"]?.trim();
  if (predicateText === undefined || bodyText === undefined) {
    return undefined;
  }
  const predicates = parseCardFilterPredicates({
    text: normalizeRevealedCardPredicate(predicateText),
  });
  if (predicates === undefined || predicates.rest.length > 0) {
    return undefined;
  }
  const body = parseBodyExpression(bodyText, options);
  if (body === undefined || body.rest.length > 0) {
    return undefined;
  }
  return {
    effect: {
      type: "conditional",
      if: selectedCardMatches(predicates.filter),
      then: body.effect,
    },
    evidence: [...predicates.evidence, ...body.evidence],
    rest: "",
  };
}

function parseBodyExpression(
  text: string,
  options: {
    readonly instructions: readonly InstructionParser[];
    readonly expressions?: readonly ((
      input: ParseInput,
    ) => ExpressionParseResult | undefined)[];
  },
): ExpressionParseResult | undefined {
  for (const expression of options.expressions ?? []) {
    const parsed = expression({ text });
    if (parsed !== undefined && parsed.rest.length === 0) {
      return parsed;
    }
  }
  return parseExpression(
    { text },
    {
      connectors: [parseThenConnector],
      segments: [syntheticInstructionSegmentParser(options.instructions)],
    },
  );
}

function selectedCardMatches(filter: CardFilter): Condition {
  return {
    type: "cardMatches",
    target: {
      type: "savedSelectedCard",
      selection: opponentHandRevealSelection,
      onFailure: "failClosed",
    },
    filter,
  };
}

function normalizeRevealedCardPredicate(predicate: string): string {
  return predicate
    .replace(/^\s*an?\s+/iu, "")
    .replace(/\bcard\b/giu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function bodyPresentation(
  input: ParseInput,
  evidence: readonly PrimitiveEvidence[],
): { readonly presentationSpans?: readonly EffectTextSpan[] } {
  return input.source === undefined
    ? {}
    : {
        presentationSpans: [
          sourceSpan("span:body", "body", input.source, evidence),
        ],
      };
}
