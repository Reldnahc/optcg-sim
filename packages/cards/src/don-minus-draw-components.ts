import type { CardId } from "@optcg/types";

import {
  parseDrawInstructionBody,
  parseSupportedTriggerWrapper,
  toEffectId,
  type ReusableComposedParserClause,
} from "./composed-parser-builder.js";
import {
  parseReturnDonCostWrapper,
  returnDonCostWrapperParserRuleId,
} from "./return-don-cost-wrapper-components.js";

export const onPlayReturnDonDrawNParserRuleId =
  "exact:on-play:return-don-draw-n:self";

const onPlayDrawNParserRuleId = "exact:on-play:draw-n:self";

export function parseOnPlayReturnDonDrawClause(
  cardId: CardId,
  sourceText: string,
): ReusableComposedParserClause | undefined {
  const wrapper = parseSupportedTriggerWrapper(sourceText);
  if (wrapper === undefined || wrapper.prefix !== "[On Play] ") {
    return undefined;
  }

  const costWrapper = parseReturnDonCostWrapper(wrapper.bodyText);
  if (costWrapper === undefined) {
    return undefined;
  }

  const draw = parseDrawInstructionBody(costWrapper.bodyText);
  if (draw === undefined || draw.mode !== "exact") {
    return undefined;
  }

  return {
    effectBlock: {
      category: "auto",
      cost: {
        chooser: "self",
        count: costWrapper.count,
        type: "returnDon",
      },
      effect: { count: draw.count, player: "self", type: "draw" },
      id: toEffectId(
        `${String(cardId)}:auto-on-play-return-don-${String(
          costWrapper.count,
        )}-draw-${String(draw.count)}`,
      ),
      sourcePresencePolicy: "mustRemainInSameZone",
      trigger: { type: "onPlay" },
    },
    parserRuleId: onPlayReturnDonDrawNParserRuleId,
    parserRuleIds: [
      returnDonCostWrapperParserRuleId,
      onPlayDrawNParserRuleId,
      onPlayReturnDonDrawNParserRuleId,
    ],
  };
}
