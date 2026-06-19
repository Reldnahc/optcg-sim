import type { ParsedMetadataLine, ParseInput } from "../types.js";

const deckOutWinText =
  /when your deck is reduced to 0,\s*you win the game instead of losing(?:,\s*according to the rules)?\.?$/iu;
const typeRestrictedDeckOutWinText =
  /^Under the rules of this game,\s*you can only include \{(?<typeText>[^}]+)\} type cards in your deck and when your deck is reduced to 0,\s*you win the game instead of losing\.?$/iu;

export const parseDeckOutWinRuleLine = (
  input: ParseInput,
): ParsedMetadataLine | undefined => {
  const trimmed = input.text.trim();
  const typeRestricted = typeRestrictedDeckOutWinText.exec(trimmed);
  const typeText = typeRestricted?.groups?.["typeText"];
  if (typeText !== undefined) {
    return {
      kind: "metadata",
      metadata: {
        type: "compound",
        entries: [
          {
            type: "deckRestriction",
            restriction: {
              type: "typeIncludesOnly",
              typeText,
            },
          },
          {
            type: "ruleModifier",
            modifier: {
              type: "deckOutWin",
            },
          },
        ],
      },
      evidence: [
        "deckRestriction:typeIncludesOnly",
        "filter:typeIncludes",
        "zone:deck",
        ...deckOutWinEvidence,
      ],
    };
  }

  if (!deckOutWinText.test(trimmed)) {
    return undefined;
  }

  return {
    kind: "metadata",
    metadata: {
      type: "ruleModifier",
      modifier: {
        type: "deckOutWin",
      },
    },
    evidence: deckOutWinEvidence,
  };
};

const deckOutWinEvidence = [
  "ruleModifier:deckOutWin",
  "condition:deckCount",
  "condition:comparator:eq",
  "condition:threshold:nonNegativeInteger",
  "instruction:winGame",
  "player:self",
  "zone:deck",
] as const;
