import type { SegmentParser } from "../types.js";
import {
  handTrashSelectionForSameNumberDeckTrash,
  parseTrashFromDeckTopInstruction,
} from "../instructions/trash-from-deck-top.js";
import { parseTrashFromHandInstruction } from "../instructions/trash-from-hand.js";

export const sameNumberHandTrashDeckTrashSegmentParser: SegmentParser = (
  input,
) => {
  const match =
    /^(?<handTrash>trash (?:up to )?[1-9]\d* cards? from your hand)\.\s+(?<deckTrash>trash the same number of cards? from the top of your deck as you did from your hand\.?)$/iu.exec(
      input.text,
    );
  const handTrashText = match?.groups?.["handTrash"];
  const deckTrashText = match?.groups?.["deckTrash"];
  if (handTrashText === undefined || deckTrashText === undefined) {
    return undefined;
  }

  const handTrash = parseTrashFromHandInstruction({ text: handTrashText });
  const deckTrash = parseTrashFromDeckTopInstruction({ text: deckTrashText });
  if (
    handTrash === undefined ||
    deckTrash === undefined ||
    handTrash.rest.length > 0 ||
    deckTrash.rest.length > 0
  ) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          saveResultAs: handTrashSelectionForSameNumberDeckTrash,
          effect: handTrash.effect,
        },
        {
          connector: "then",
          effect: deckTrash.effect,
        },
      ],
    },
    evidence: [
      "expression:sequence",
      ...handTrash.evidence,
      "connector:sentence",
      ...deckTrash.evidence,
    ],
  };
};
