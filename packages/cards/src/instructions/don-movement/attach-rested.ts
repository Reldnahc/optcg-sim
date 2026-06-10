import type { CardFilter } from "@optcg/types";

import { parseUpToCardinality } from "../../cardinality/index.js";
import { parseCardFilterPredicates } from "../../filters/index.js";
import type { InstructionParser, PrimitiveEvidence } from "../../types.js";
import { donAttachSelection, donAttachTarget } from "./shared.js";

export const parseAttachRestedDonInstruction: InstructionParser = (input) => {
  const ownerRelative = parseOwnerRelativeDonAttachmentInstruction(input);
  if (ownerRelative !== undefined) {
    return ownerRelative;
  }

  const distribution = parseAttachRestedDonEachInstruction(input);
  if (distribution !== undefined) {
    return distribution;
  }

  const match =
    /^give (?<quantity>up to [1-9]\d*) rested DON!! cards? to (?<target>.+)$/i.exec(
      input.text,
    );
  const quantityText = match?.groups?.["quantity"];
  const targetText = match?.groups?.["target"];
  if (quantityText === undefined || targetText === undefined) {
    return undefined;
  }
  return parseAttachRestedDonToTarget(quantityText, targetText);
};

const parseOwnerRelativeDonAttachmentInstruction: InstructionParser = (
  input,
) => {
  const match =
    /^give (?<quantity>up to [1-9]\d*) DON!! cards? from its owner's cost area to its owner's Leader or 1 of their Characters\.?$/iu.exec(
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
          id: "select:owner-don-to-attach",
          connector: "always",
          saveResultAs: donAttachSelection,
          effect: {
            type: "selectTargets",
            request: {
              timing: "onResolution",
              chooser: "self",
              zone: "costArea",
              player: "anyPlayer",
              filter: { categories: ["don"] },
              min: quantity.cardinality.min,
              max: quantity.cardinality.max,
              allowFewerIfUnavailable: true,
              visibility: "public",
            },
          },
        },
        {
          id: "select:owner-don-attach-target",
          connector: "ifYouDo",
          saveResultAs: donAttachTarget,
          effect: {
            type: "selectTargets",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "anyPlayer",
              zones: ["leaderArea", "characterArea"],
              filter: { categories: ["leader", "character"] },
              min: 1,
              max: 1,
              allowFewerIfUnavailable: false,
              visibility: "public",
            },
          },
        },
        {
          id: "attach:owner-selected-don",
          connector: "then",
          effect: {
            type: "attachSelectedDon",
            selection: donAttachSelection,
            targetOwner: "selectedDonOwner",
            target: {
              type: "savedFieldObject",
              binding: {
                family: "selectedTargets",
                saveResultAs: donAttachTarget,
              },
              zones: ["leaderArea", "characterArea"],
              player: "anyPlayer",
              filter: { categories: ["leader", "character"] },
              visibility: "publicOnly",
              onFailure: "failClosed",
            },
          },
        },
      ],
    },
    evidence: [
      "instruction:selectTargets",
      "instruction:attachDon",
      ...quantity.evidence,
      "chooser:self:upTo",
      "zone:costArea",
      "zone:leaderArea",
      "zone:characterArea",
      "filter:category:don",
      "filter:category:leader",
      "filter:category:character",
      "reference:ownerOfSelected",
      "composition:selectThenApply",
    ],
    rest: "",
  };
};

const parseAttachRestedDonEachInstruction: InstructionParser = (input) => {
  const match =
    /^give your Leader and 1 Character (?<quantity>up to [1-9]\d*) rested DON!! cards? each\.?$/iu.exec(
      input.text,
    );
  const quantityText = match?.groups?.["quantity"];
  if (quantityText === undefined) {
    return undefined;
  }

  const leader = parseAttachRestedDonToTarget(quantityText, "your Leader");
  const character = parseAttachRestedDonToTarget(
    quantityText,
    "1 of your Characters",
  );
  if (leader === undefined || character === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: "attach:leader",
          connector: "always",
          effect: leader.effect,
        },
        {
          id: "attach:character",
          connector: "then",
          effect: character.effect,
        },
      ],
    },
    evidence: [
      "instruction:attachDon",
      "composition:selectThenApply",
      ...leader.evidence,
      ...character.evidence,
    ],
    rest: "",
  };
};

const parseAttachRestedDonToTarget = (
  quantityText: string,
  targetText: string,
): ReturnType<InstructionParser> => {
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
  if (/^your Leader\.?$/iu.test(targetText)) {
    return {
      evidence: ["zone:leaderArea", "filter:category:leader"],
      filter: { categories: ["leader"] },
      requestZone: { zones: ["leaderArea", "characterArea"] },
      savedTargetZone: { zones: ["leaderArea", "characterArea"] },
    };
  }
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
  if (/^1 of your Leader or Character cards?\.?$/iu.test(targetText)) {
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
  const nameOnlyCardsTarget =
    categories.length === 0 && (parsed.filter.names?.length ?? 0) > 0;
  const supportsCharacters =
    nameOnlyCardsTarget || categories.includes("character");
  const supportsLeaders = nameOnlyCardsTarget || categories.includes("leader");
  if (!supportsCharacters) {
    return undefined;
  }
  const filter = nameOnlyCardsTarget
    ? ({
        ...parsed.filter,
        categories: ["leader", "character"],
      } satisfies CardFilter)
    : parsed.filter;
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
  const inferredCategoryEvidence: PrimitiveEvidence[] = nameOnlyCardsTarget
    ? ["filter:category:leader", "filter:category:character"]
    : [];

  return {
    evidence: [
      ...leaderEvidence,
      "zone:characterArea",
      ...inferredCategoryEvidence,
      ...parsed.evidence,
    ],
    filter,
    requestZone,
    savedTargetZone: requestZone,
  };
};
