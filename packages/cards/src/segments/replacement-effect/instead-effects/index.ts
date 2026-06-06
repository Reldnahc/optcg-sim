import type { ReplacementInsteadParseResult } from "../shared.js";
import { parseMoveToOwnerDeckBottomInstead } from "./move-to-owner-deck-bottom.js";
import {
  parseKoSelfInstead,
  parseModifyLeaderPowerInstead,
  parseRestSelfInstead,
  parseTrashSelfInstead,
} from "./self.js";
import { parseRestCardsInstead } from "./rest-cards.js";
import { parseReturnDonInstead } from "./return-don.js";
import { parseTopLifeToHandInstead } from "./top-life-to-hand.js";
import { parseTrashFromHandInstead } from "./trash-from-hand.js";

export function parseInsteadEffect(
  text: string,
): ReplacementInsteadParseResult | undefined {
  return (
    parseTopLifeToHandInstead(text) ??
    parseReturnDonInstead(text) ??
    parseMoveToOwnerDeckBottomInstead(text) ??
    parseTrashFromHandInstead(text) ??
    parseKoSelfInstead(text) ??
    parseTrashSelfInstead(text) ??
    parseModifyLeaderPowerInstead(text) ??
    parseRestSelfInstead(text) ??
    parseRestCardsInstead(text)
  );
}
