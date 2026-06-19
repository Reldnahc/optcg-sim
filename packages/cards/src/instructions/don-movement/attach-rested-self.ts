import { parseUpToCardinality } from "../../cardinality/index.js";
import type { InstructionParser, PrimitiveEvidence } from "../../types.js";
import { donAttachSelection } from "./shared.js";

export const parseAttachRestedDonToSelf = (
  quantityText: string,
  targetText: string,
): ReturnType<InstructionParser> => {
  const quantity = parseUpToCardinality({ text: quantityText });
  if (
    quantity === undefined ||
    quantity.rest.length > 0 ||
    !/^this (?:Character|Leader)\.?$/iu.test(targetText)
  ) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: "select:rested-don",
          connector: "always",
          saveResultAs: donAttachSelection,
          saveResultKinds: ["selectedCards:don"],
          effect: {
            type: "selectCards",
            zone: "costArea",
            player: "self",
            chooser: "self",
            min: quantity.cardinality.min,
            max: quantity.cardinality.max,
            filter: { categories: ["don"], state: "rested" },
            saveAs: donAttachSelection,
            visibility: "bothPlayers",
          },
        },
        {
          id: "attach:selected-don-to-source",
          connector: "then",
          effect: {
            type: "attachSelectedDon",
            selection: donAttachSelection,
            target: { type: "self" },
          },
        },
      ],
    },
    evidence: [
      "instruction:selectCards",
      "instruction:attachDon",
      ...quantity.evidence,
      "player:self",
      "chooser:self:upTo",
      "zone:costArea",
      "filter:category:don",
      "filter:state:rested",
      selfTargetEvidence(targetText),
      "composition:selectThenApply",
    ],
    rest: "",
  };
};

const selfTargetEvidence = (targetText: string): PrimitiveEvidence =>
  targetText.toLowerCase().includes("leader")
    ? "target:yourLeader"
    : "target:thisCharacter";
