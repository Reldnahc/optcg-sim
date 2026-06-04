import type { CardFilter, SelectionId } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import type { InstructionParser, PrimitiveEvidence } from "../types.js";

const donAttachSelection = "donSelection:attach" as SelectionId;
const donAttachTarget = "targetSelection:attach-don";
const donActivationTarget = "targetSelection:set-don-active";

export const parseAddActiveDonFromDonDeckInstruction: InstructionParser = (
  input,
) => {
  const match =
    /^add (?<quantity>up to [1-9]\d*) DON!! card from your DON!! deck and set it as active\.?$/i.exec(
      input.text,
    );
  const quantityText = match?.groups?.["quantity"];
  if (quantityText === undefined) {
    return undefined;
  }
  const quantity = parseUpToCardinality({ text: quantityText });
  if (quantity === undefined || quantity.rest.length > 0) {
    return undefined;
  }

  return {
    effect: {
      type: "moveCards",
      min: quantity.cardinality.min,
      count: quantity.cardinality.max,
      from: { player: "self", zone: "donDeck", position: "top" },
      to: { player: "self", zone: "costArea" },
      order: "original",
      destinationState: "active",
    },
    evidence: [
      "instruction:moveCards",
      ...quantity.evidence,
      "player:self",
      "zone:donDeck",
      "position:top",
      "destination:costArea",
      "state:active",
      "filter:category:don",
      "order:original",
    ],
    rest: "",
  };
};

export const parseAddRestedDonFromDonDeckInstruction: InstructionParser = (
  input,
) => {
  const match =
    /^add (?<quantity>up to [1-9]\d*) additional DON!! cards and rest them\.?$/i.exec(
      input.text,
    );
  const quantityText = match?.groups?.["quantity"];
  if (quantityText === undefined) {
    return undefined;
  }
  const quantity = parseUpToCardinality({ text: quantityText });
  if (quantity === undefined || quantity.rest.length > 0) {
    return undefined;
  }

  return {
    effect: {
      type: "moveCards",
      min: quantity.cardinality.min,
      count: quantity.cardinality.max,
      from: { player: "self", zone: "donDeck", position: "top" },
      to: { player: "self", zone: "costArea" },
      order: "original",
      destinationState: "rested",
    },
    evidence: [
      "instruction:moveCards",
      ...quantity.evidence,
      "player:self",
      "zone:donDeck",
      "position:top",
      "destination:costArea",
      "state:rested",
      "filter:category:don",
      "order:original",
    ],
    rest: "",
  };
};

export const parseAttachRestedDonInstruction: InstructionParser = (input) => {
  const match =
    /^give (?<quantity>up to [1-9]\d*) rested DON!! cards? to (?<target>.+)$/i.exec(
      input.text,
    );
  const quantityText = match?.groups?.["quantity"];
  const targetText = match?.groups?.["target"];
  if (quantityText === undefined || targetText === undefined) {
    return undefined;
  }
  const quantity = parseUpToCardinality({ text: quantityText });
  if (quantity === undefined || quantity.rest.length > 0) {
    return undefined;
  }
  const target = parseRestedDonAttachmentTarget(targetText);
  if (target === undefined) {
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
          id: "select:don-attach-target",
          connector: "ifYouDo",
          saveResultAs: donAttachTarget,
          effect: {
            type: "selectTargets",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "self",
              ...target.requestZone,
              filter: target.filter,
              min: 1,
              max: 1,
              allowFewerIfUnavailable: false,
              visibility: "public",
            },
          },
        },
        {
          id: "attach:selected-don",
          connector: "then",
          effect: {
            type: "attachSelectedDon",
            selection: donAttachSelection,
            target: {
              type: "savedFieldObject",
              binding: {
                family: "selectedTargets",
                saveResultAs: donAttachTarget,
              },
              ...target.savedTargetZone,
              player: "self",
              filter: target.filter,
              visibility: "publicOnly",
              onFailure: "failClosed",
            },
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
      ...target.evidence,
      "composition:selectThenApply",
    ],
    rest: "",
  };
};

const parseRestedDonAttachmentTarget = (
  targetText: string,
):
  | {
      readonly evidence: readonly PrimitiveEvidence[];
      readonly filter: CardFilter;
      readonly requestZone:
        | { readonly zone: "characterArea" }
        | { readonly zones: ["leaderArea", "characterArea"] };
      readonly savedTargetZone:
        | { readonly zone: "characterArea" }
        | { readonly zones: ["leaderArea", "characterArea"] };
    }
  | undefined => {
  if (/^your Leader or 1 of your Characters\.?$/iu.test(targetText)) {
    const zoneTarget = {
      zones: ["leaderArea", "characterArea"] as ["leaderArea", "characterArea"],
    };
    return {
      evidence: [
        "zone:leaderArea",
        "zone:characterArea",
        "filter:category:leader",
        "filter:category:character",
      ],
      filter: { categories: ["leader", "character"] },
      requestZone: zoneTarget,
      savedTargetZone: zoneTarget,
    };
  }
  const normalizedTargetText = targetText.replace(/^1 of your /iu, "");
  const parsed = parseCardFilterPredicates(
    { text: normalizedTargetText },
    { powerSemantics: "current" },
  );
  const rest = parsed?.rest.trim().replace(/\.$/u, "");
  if (parsed === undefined || rest !== "") {
    return undefined;
  }
  const categories = parsed.filter.categories ?? [];
  const supportsCharacters = categories.includes("character");
  const supportsLeaders = categories.includes("leader");
  if (!supportsCharacters) {
    return undefined;
  }
  const requestZone = supportsLeaders
    ? {
        zones: ["leaderArea", "characterArea"] as [
          "leaderArea",
          "characterArea",
        ],
      }
    : { zone: "characterArea" as const };
  const leaderEvidence: PrimitiveEvidence[] = supportsLeaders
    ? ["zone:leaderArea"]
    : [];

  return {
    evidence: [...leaderEvidence, "zone:characterArea", ...parsed.evidence],
    filter: parsed.filter,
    requestZone,
    savedTargetZone: requestZone,
  };
};

export const parseSetDonActiveInstruction: InstructionParser = (input) => {
  const match =
    /^set (?<quantity>up to [1-9]\d*) of your DON!! cards as active\.?$/i.exec(
      input.text,
    );
  const quantityText = match?.groups?.["quantity"];
  if (quantityText === undefined) {
    return undefined;
  }
  const quantity = parseUpToCardinality({ text: quantityText });
  if (quantity === undefined || quantity.rest.length > 0) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: "select:don-to-activate",
          connector: "always",
          saveResultAs: donActivationTarget,
          effect: {
            type: "selectTargets",
            request: {
              timing: "onResolution",
              chooser: "self",
              zone: "costArea",
              player: "self",
              filter: { categories: ["don"], state: "rested" },
              min: quantity.cardinality.min,
              max: quantity.cardinality.max,
              allowFewerIfUnavailable: true,
              visibility: "public",
            },
          },
        },
        {
          id: "activate:selected-don",
          connector: "then",
          effect: {
            type: "activate",
            target: {
              type: "savedFieldObject",
              binding: {
                family: "selectedTargets",
                saveResultAs: donActivationTarget,
              },
              zone: "costArea",
              player: "self",
              visibility: "publicOnly",
              onFailure: "failClosed",
            },
          },
        },
      ],
    },
    evidence: [
      "instruction:activate",
      ...quantity.evidence,
      "player:self",
      "chooser:self:upTo",
      "target:yourDonCards",
      "zone:costArea",
      "filter:category:don",
      "filter:state:rested",
      "state:active",
      "composition:selectThenApply",
    ],
    rest: "",
  };
};
