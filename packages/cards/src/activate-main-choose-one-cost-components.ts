import type { CardId, Effect, Trigger } from "@optcg/types";
import {
  buildSequenceEffect,
  findReusableComposedResiduePrefix,
  parseExactPositiveSafeInteger,
  parseOncePerTurnWrapper,
  toEffectId,
  type ReusableComposedParserClause,
  type ReusableComposedParserResidueClause,
} from "./composed-parser-builder.js";
import { activateMainChooseOneCostParserRuleId } from "./activate-main-choose-one-cost-evidence.js";

export type ActivateMainWrapperParse = {
  readonly bodyText: string;
  readonly prefix: "[Activate: Main] ";
  readonly trigger: Extract<Trigger, { type: "activateMain" }>;
};

export function parseActivateMainWrapper(
  sourceText: string,
): ActivateMainWrapperParse | undefined {
  const prefix = "[Activate: Main] ";
  if (!sourceText.startsWith(prefix)) {
    return undefined;
  }

  return {
    bodyText: sourceText.slice(prefix.length),
    prefix,
    trigger: { type: "activateMain" },
  };
}

export function parseActivateMainCostOptionalMarker(sourceText: string):
  | {
      readonly bodyText: string;
      readonly prefix: "You may ";
    }
  | undefined {
  const prefix = "You may ";
  if (!sourceText.startsWith(prefix)) {
    return undefined;
  }
  return { bodyText: sourceText.slice(prefix.length), prefix };
}

export function parseActivateMainCostChoiceConnector(sourceText: string):
  | {
      readonly left: string;
      readonly right: string;
    }
  | undefined {
  const match = /^(.+)\sor\s(.+)$/.exec(sourceText);
  if (match === null) {
    return undefined;
  }
  return { left: match[1] ?? "", right: match[2] ?? "" };
}

export function parseActivateMainChooseOneTrashFieldCostAlternative(
  sourceText: string,
):
  | {
      readonly count: number;
      readonly typeName: string;
    }
  | undefined {
  const match = /^trash (\d+) of your \{([^}]+)\} type Characters$/.exec(
    sourceText,
  );
  if (match === null) {
    return undefined;
  }
  const count = parseExactPositiveSafeInteger(match[1] ?? "");
  const typeName = match[2] ?? "";
  if (count === undefined || typeName.length === 0) {
    return undefined;
  }
  return { count, typeName };
}

export function parseActivateMainChooseOneTrashFromHandCostAlternative(
  sourceText: string,
):
  | {
      readonly count: number;
    }
  | undefined {
  const match = /^(\d+) (card|cards) from your hand$/.exec(sourceText);
  if (match === null) {
    return undefined;
  }
  const count = parseExactPositiveSafeInteger(match[1] ?? "");
  const noun = match[2];
  if (count === undefined) {
    return undefined;
  }
  if ((count === 1 && noun !== "card") || (count !== 1 && noun !== "cards")) {
    return undefined;
  }
  return { count };
}

export function parseActivateMainCostBodySeparator(sourceText: string):
  | {
      readonly bodyText: string;
      readonly costText: string;
    }
  | undefined {
  const match = /^(.+):\s(.+)$/.exec(sourceText);
  if (match === null) {
    return undefined;
  }
  const costText = match[1] ?? "";
  const bodyText = match[2] ?? "";
  return costText.length === 0 || bodyText.length === 0
    ? undefined
    : { bodyText, costText };
}

export function parseActivateMainBodyDrawClause(sourceText: string):
  | {
      readonly count: number;
    }
  | undefined {
  const match = /^Draw (\d+) (card|cards)\.$/.exec(sourceText);
  if (match === null) {
    return undefined;
  }
  const count = parseExactPositiveSafeInteger(match[1] ?? "");
  const noun = match[2];
  if (count === undefined) {
    return undefined;
  }
  if ((count === 1 && noun !== "card") || (count !== 1 && noun !== "cards")) {
    return undefined;
  }
  return { count };
}

export function buildActivateMainChooseOneTrashCostDrawSequenceEffect({
  drawCount,
  fieldTrashCount,
  handTrashCount,
  typeName,
}: {
  drawCount: number;
  fieldTrashCount: number;
  handTrashCount: number;
  typeName: string;
}): Extract<Effect, { type: "sequence" }> {
  return buildSequenceEffect([
    {
      connector: "always",
      effect: {
        cost: {
          optional: true,
          options: [
            {
              chooser: "self",
              count: fieldTrashCount,
              filter: {
                categories: ["character"],
                typesAny: [typeName],
              },
              optional: true,
              type: "trashFromField",
            },
            {
              chooser: "self",
              count: handTrashCount,
              optional: true,
              type: "trashFromHand",
            },
          ],
          type: "chooseOne",
        },
        type: "payCost",
      },
      id: "optionalChooseOneTrashCost",
      saveResultAs: "paidOptionalChooseOneTrashCost",
    },
    {
      connector: "ifYouDo",
      effect: { count: drawCount, player: "self", type: "draw" },
      id: "drawAfterOptionalChooseOneTrashCost",
    },
  ]);
}

export function parseActivateMainChooseOneTrashCostBody(sourceText: string):
  | {
      readonly drawCount: number;
      readonly fieldTrashCount: number;
      readonly handTrashCount: number;
      readonly typeName: string;
    }
  | undefined {
  const separated = parseActivateMainCostBodySeparator(sourceText);
  if (separated === undefined) {
    return undefined;
  }

  const optional = parseActivateMainCostOptionalMarker(separated.costText);
  if (optional === undefined) {
    return undefined;
  }

  const connector = parseActivateMainCostChoiceConnector(optional.bodyText);
  if (connector === undefined) {
    return undefined;
  }

  const fieldAlternative = parseActivateMainChooseOneTrashFieldCostAlternative(
    connector.left,
  );
  const handAlternative =
    parseActivateMainChooseOneTrashFromHandCostAlternative(connector.right);
  const draw = parseActivateMainBodyDrawClause(separated.bodyText);
  if (
    fieldAlternative === undefined ||
    handAlternative === undefined ||
    draw === undefined
  ) {
    return undefined;
  }

  return {
    drawCount: draw.count,
    fieldTrashCount: fieldAlternative.count,
    handTrashCount: handAlternative.count,
    typeName: fieldAlternative.typeName,
  };
}

export function parseActivateMainChooseOneTrashCostClause(
  cardId: CardId,
  sourceText: string,
): ReusableComposedParserClause | undefined {
  const activateMain = parseActivateMainWrapper(sourceText);
  if (activateMain === undefined) {
    return undefined;
  }

  const oncePerTurn = parseOncePerTurnWrapper(activateMain.bodyText);
  if (oncePerTurn === undefined) {
    return undefined;
  }

  const body = parseActivateMainChooseOneTrashCostBody(oncePerTurn.bodyText);
  if (body === undefined) {
    return undefined;
  }

  const stableTypeName = body.typeName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return {
    effectBlock: {
      category: "activate",
      effect: buildActivateMainChooseOneTrashCostDrawSequenceEffect(body),
      id: toEffectId(
        `${String(cardId)}:activate-main-once-per-turn-optional-choose-one-trash-self-field-${String(body.fieldTrashCount)}-${stableTypeName.length === 0 ? "type" : stableTypeName}-or-hand-${String(body.handTrashCount)}-then-draw-${String(body.drawCount)}`,
      ),
      oncePerTurn: true,
      sourcePresencePolicy: "mustRemainInSameZone",
      trigger: { type: "activateMain" },
    },
    parserRuleId: activateMainChooseOneCostParserRuleId,
  };
}

export function parseActivateMainChooseOneTrashCostResidueClause(
  cardId: CardId,
  sourceText: string,
):
  | ReusableComposedParserResidueClause<ReusableComposedParserClause>
  | undefined {
  return findReusableComposedResiduePrefix(sourceText, (prefix) =>
    parseActivateMainChooseOneTrashCostClause(cardId, prefix),
  );
}
