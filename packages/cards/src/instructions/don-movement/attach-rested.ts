import type { CardFilter, SelectTargetsEffect } from "@optcg/types";

import { parseUpToCardinality } from "../../cardinality/index.js";
import { parseCardFilterPredicates } from "../../filters/index.js";
import type { InstructionParser, PrimitiveEvidence } from "../../types.js";
import {
  distributedDonAttachCurrentTarget,
  distributedDonAttachTarget,
  donAttachSelection,
  donAttachTarget,
} from "./shared.js";

export const parseAttachRestedDonInstruction: InstructionParser = (input) => {
  const decomposed = parseDonAttachmentInstruction(input);
  if (decomposed !== undefined) {
    return decomposed;
  }

  const distribution = parseAttachRestedDonEachInstruction(input);
  if (distribution !== undefined) {
    return distribution;
  }

  const allTargetDistribution =
    parseAllTargetDistributedRestedDonInstruction(input);
  if (allTargetDistribution !== undefined) {
    return allTargetDistribution;
  }

  const targetDistribution = parseTargetDistributedRestedDonInstruction(input);
  if (targetDistribution !== undefined) {
    return targetDistribution;
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

type DonAttachSource = {
  readonly evidence: readonly PrimitiveEvidence[];
  readonly ownerConstraint?: SelectTargetsEffect["ownerConstraint"];
  readonly player: "self" | "opponent" | "anyPlayer";
  readonly sourceState?: "rested";
  readonly targetOwner?: "selectedDonOwner";
};

type DonAttachTarget = {
  readonly evidence: readonly PrimitiveEvidence[];
  readonly filter: CardFilter;
  readonly player: "self" | "opponent" | "anyPlayer";
  readonly requestZone:
    | { readonly zone: "leaderArea" }
    | { readonly zone: "characterArea" }
    | { readonly zones: ["leaderArea", "characterArea"] };
  readonly savedTargetZone:
    | { readonly zone: "leaderArea" }
    | { readonly zone: "characterArea" }
    | { readonly zones: ["leaderArea", "characterArea"] };
  readonly targetOwner?: "selectedDonOwner";
};

const parseDonAttachmentInstruction: InstructionParser = (input) => {
  const match =
    /^give (?<quantity>up to [1-9]\d*) (?:(?<opponentSource>of your opponent's) )?(?<rested>rested )?DON!! cards?(?: from (?<sourceZone>your opponent's|your|its owner's) cost area)? to (?<target>.+)$/iu.exec(
      input.text,
    );
  const quantityText = match?.groups?.["quantity"];
  const targetText = match?.groups?.["target"];
  if (quantityText === undefined || targetText === undefined) {
    return undefined;
  }
  const source = parseDonAttachSource({
    opponentSource: match?.groups?.["opponentSource"],
    ownerReference: input.ownerReference,
    rested: match?.groups?.["rested"],
    sourceZone: match?.groups?.["sourceZone"],
    targetText,
  });
  if (source === undefined) {
    return undefined;
  }
  const quantity = parseUpToCardinality({ text: quantityText });
  if (quantity === undefined || quantity.rest.length > 0) {
    return undefined;
  }
  const target = parseDonAttachmentTarget(targetText, source.targetOwner);
  if (target === undefined) {
    return undefined;
  }

  const sourceFilter: CardFilter =
    source.sourceState === undefined
      ? { categories: ["don"] }
      : { categories: ["don"], state: source.sourceState };
  const sourceSelection =
    source.player === "self"
      ? {
          type: "selectCards" as const,
          zone: "costArea" as const,
          player: source.player,
          chooser: "self" as const,
          min: quantity.cardinality.min,
          max: quantity.cardinality.max,
          filter: sourceFilter,
          saveAs: donAttachSelection,
          visibility: "bothPlayers" as const,
        }
      : {
          type: "selectTargets" as const,
          ...(source.ownerConstraint === undefined
            ? {}
            : { ownerConstraint: source.ownerConstraint }),
          request: {
            timing: "onResolution" as const,
            chooser: "self" as const,
            zone: "costArea" as const,
            player: source.player,
            filter: sourceFilter,
            min: quantity.cardinality.min,
            max: quantity.cardinality.max,
            allowFewerIfUnavailable: true,
            visibility: "public" as const,
          },
        };

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id:
            source.player === "self" && source.sourceState === "rested"
              ? "select:rested-don"
              : "select:don-to-attach",
          connector: "always",
          saveResultAs: donAttachSelection,
          effect: sourceSelection,
        },
        {
          id: "select:don-attach-target",
          connector: "ifYouDo",
          saveResultAs: donAttachTarget,
          effect: {
            type: "selectTargets",
            ...(target.targetOwner === "selectedDonOwner"
              ? {
                  ownerConstraint: {
                    type: "sameAsSavedReferenceOwner" as const,
                    selection: donAttachSelection,
                  },
                }
              : {}),
            request: {
              timing: "onResolution",
              chooser: "self",
              player: target.player,
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
              player: target.player,
              filter: target.filter,
              visibility: "publicOnly",
              onFailure: "failClosed",
            },
            ...(source.sourceState === undefined
              ? {}
              : { sourceState: source.sourceState }),
            ...(target.targetOwner === undefined
              ? {}
              : { targetOwner: target.targetOwner }),
          },
        },
      ],
    },
    evidence: [
      "instruction:attachDon",
      ...quantity.evidence,
      "chooser:self:upTo",
      "zone:costArea",
      "filter:category:don",
      source.player === "self"
        ? "instruction:selectCards"
        : "instruction:selectTargets",
      ...(source.sourceState === undefined
        ? []
        : (["filter:state:rested"] as const)),
      ...(source.player === "opponent"
        ? (["player:opponent"] as const)
        : source.player === "self"
          ? (["player:self"] as const)
          : []),
      ...source.evidence,
      ...target.evidence,
      ...(target.targetOwner === undefined
        ? []
        : (["reference:ownerOfSelected"] as const)),
      "composition:selectThenApply",
    ],
    rest: "",
  };
};

const parseDonAttachSource = (input: {
  readonly opponentSource: string | undefined;
  readonly ownerReference: SelectTargetsEffect["ownerConstraint"] | undefined;
  readonly rested: string | undefined;
  readonly sourceZone: string | undefined;
  readonly targetText: string;
}): DonAttachSource | undefined => {
  const sourceZone = input.sourceZone?.toLowerCase();
  const ownerRelative =
    sourceZone === "its owner's" || /^its owner's /iu.test(input.targetText);
  const player = ownerRelative
    ? "anyPlayer"
    : input.opponentSource !== undefined || sourceZone === "your opponent's"
      ? "opponent"
      : "self";
  const sourceState = input.rested === undefined ? undefined : "rested";
  if (sourceState === undefined && sourceZone === undefined) {
    return undefined;
  }
  return {
    evidence: ownerRelative ? ["reference:ownerOfSelected"] : [],
    ...(ownerRelative && input.ownerReference !== undefined
      ? { ownerConstraint: input.ownerReference }
      : {}),
    player,
    ...(sourceState === undefined ? {} : { sourceState }),
    ...(ownerRelative ? { targetOwner: "selectedDonOwner" as const } : {}),
  };
};

const parseDonAttachmentTarget = (
  targetText: string,
  sourceTargetOwner: "selectedDonOwner" | undefined,
): DonAttachTarget | undefined => {
  if (/^its owner's Leader or 1 of their Characters\.?$/iu.test(targetText)) {
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
      player: "anyPlayer",
      requestZone: zoneTarget,
      savedTargetZone: zoneTarget,
      targetOwner: "selectedDonOwner",
    };
  }
  if (/^1 of your opponent's Characters\.?$/iu.test(targetText)) {
    return {
      evidence: ["zone:characterArea", "filter:category:character"],
      filter: { categories: ["character"] },
      player: "opponent",
      requestZone: { zone: "characterArea" },
      savedTargetZone: { zone: "characterArea" },
    };
  }
  const selfTarget = parseRestedDonAttachmentTarget(targetText);
  if (selfTarget === undefined) {
    return undefined;
  }
  return {
    ...selfTarget,
    player: "self",
    ...(sourceTargetOwner === undefined
      ? {}
      : { targetOwner: sourceTargetOwner }),
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

const parseTargetDistributedRestedDonInstruction: InstructionParser = (
  input,
) => {
  const match =
    /^give (?<targetQuantity>up to [1-9]\d*) of your (?<target>.+) (?<donQuantity>up to [1-9]\d*) rested DON!! cards? each\.?$/iu.exec(
      input.text,
    );
  const targetQuantityText = match?.groups?.["targetQuantity"];
  const targetText = match?.groups?.["target"];
  const donQuantityText = match?.groups?.["donQuantity"];
  if (
    targetQuantityText === undefined ||
    targetText === undefined ||
    donQuantityText === undefined
  ) {
    return undefined;
  }
  const targetQuantity = parseUpToCardinality({ text: targetQuantityText });
  const donQuantity = parseUpToCardinality({ text: donQuantityText });
  const target = parseRestedDonAttachmentTarget(`1 of your ${targetText}`);
  if (
    targetQuantity === undefined ||
    targetQuantity.rest.length > 0 ||
    donQuantity === undefined ||
    donQuantity.rest.length > 0 ||
    target === undefined
  ) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: "select:distributed-don-attach-targets",
          connector: "always",
          saveResultAs: distributedDonAttachTarget,
          effect: {
            type: "selectTargets",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "self",
              ...target.requestZone,
              filter: target.filter,
              min: targetQuantity.cardinality.min,
              max: targetQuantity.cardinality.max,
              allowFewerIfUnavailable: true,
              visibility: "public",
            },
          },
        },
        {
          id: "for-each:distributed-don-attach-target",
          connector: "then",
          effect: {
            type: "forEachSavedTarget",
            selection: distributedDonAttachTarget,
            saveCurrentAs: distributedDonAttachCurrentTarget,
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
                    min: donQuantity.cardinality.min,
                    max: donQuantity.cardinality.max,
                    filter: { categories: ["don"], state: "rested" },
                    saveAs: donAttachSelection,
                    visibility: "bothPlayers",
                  },
                },
                {
                  id: "attach:selected-don-to-current-target",
                  connector: "then",
                  effect: {
                    type: "attachSelectedDon",
                    selection: donAttachSelection,
                    target: {
                      type: "savedFieldObject",
                      binding: {
                        family: "forEachSavedTarget",
                        saveResultAs: distributedDonAttachCurrentTarget,
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
          },
        },
      ],
    },
    evidence: [
      "instruction:selectTargets",
      "instruction:selectCards",
      "instruction:attachDon",
      ...targetQuantity.evidence,
      ...donQuantity.evidence,
      "player:self",
      "chooser:self:upTo",
      "zone:costArea",
      "filter:category:don",
      "filter:state:rested",
      ...target.evidence,
      "composition:forEachSavedTarget",
      "composition:selectThenApply",
    ],
    rest: "",
  };
};

const parseAllTargetDistributedRestedDonInstruction: InstructionParser = (
  input,
) => {
  const match =
    /^give your Leader and all of your Characters (?<donQuantity>up to [1-9]\d*) rested DON!! cards? each\.?$/iu.exec(
      input.text,
    );
  const donQuantityText = match?.groups?.["donQuantity"];
  if (donQuantityText === undefined) {
    return undefined;
  }
  const donQuantity = parseUpToCardinality({ text: donQuantityText });
  if (donQuantity === undefined || donQuantity.rest.length > 0) {
    return undefined;
  }
  const target = {
    evidence: [
      "zone:leaderArea",
      "zone:characterArea",
      "filter:category:leader",
      "filter:category:character",
    ] as const,
    filter: { categories: ["leader", "character"] } satisfies CardFilter,
    requestZone: {
      zones: ["leaderArea", "characterArea"] as ["leaderArea", "characterArea"],
    },
    savedTargetZone: {
      zones: ["leaderArea", "characterArea"] as ["leaderArea", "characterArea"],
    },
  };

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: "select:distributed-don-attach-targets",
          connector: "always",
          saveResultAs: distributedDonAttachTarget,
          effect: {
            type: "selectAllTargets",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "self",
              ...target.requestZone,
              filter: target.filter,
              visibility: "public",
            },
          },
        },
        {
          id: "for-each:distributed-don-attach-target",
          connector: "then",
          effect: {
            type: "forEachSavedTarget",
            selection: distributedDonAttachTarget,
            saveCurrentAs: distributedDonAttachCurrentTarget,
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
                    min: donQuantity.cardinality.min,
                    max: donQuantity.cardinality.max,
                    filter: { categories: ["don"], state: "rested" },
                    saveAs: donAttachSelection,
                    visibility: "bothPlayers",
                  },
                },
                {
                  id: "attach:selected-don-to-current-target",
                  connector: "then",
                  effect: {
                    type: "attachSelectedDon",
                    selection: donAttachSelection,
                    target: {
                      type: "savedFieldObject",
                      binding: {
                        family: "forEachSavedTarget",
                        saveResultAs: distributedDonAttachCurrentTarget,
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
          },
        },
      ],
    },
    evidence: [
      "instruction:selectAllTargets",
      "instruction:selectCards",
      "instruction:attachDon",
      ...donQuantity.evidence,
      "player:self",
      "chooser:self:upTo",
      "zone:costArea",
      "filter:category:don",
      "filter:state:rested",
      ...target.evidence,
      "composition:forEachSavedTarget",
      "composition:selectThenApply",
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
        | { readonly zone: "leaderArea" }
        | { readonly zone: "characterArea" }
        | { readonly zones: ["leaderArea", "characterArea"] };
      readonly savedTargetZone:
        | { readonly zone: "leaderArea" }
        | { readonly zone: "characterArea" }
        | { readonly zones: ["leaderArea", "characterArea"] };
    }
  | undefined => {
  if (/^(?:(?:1 of )?your|this) Leader\.?$/iu.test(targetText)) {
    return {
      evidence: ["zone:leaderArea", "filter:category:leader"],
      filter: { categories: ["leader"] },
      requestZone: { zones: ["leaderArea", "characterArea"] },
      savedTargetZone: { zones: ["leaderArea", "characterArea"] },
    };
  }
  const namedLeaderMatch = /^your \[(?<name>[^\]]+)\] Leader\.?$/iu.exec(
    targetText,
  );
  const namedLeader = namedLeaderMatch?.groups?.["name"]?.trim();
  if (namedLeader !== undefined && namedLeader.length > 0) {
    return {
      evidence: ["zone:leaderArea", "filter:category:leader", "filter:name"],
      filter: { categories: ["leader"], names: [namedLeader] },
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
  const typeIncludingLeaderOrCharacter =
    parseTypeIncludingLeaderOrCharacterAttachmentTarget(targetText);
  if (typeIncludingLeaderOrCharacter !== undefined) {
    return typeIncludingLeaderOrCharacter;
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
  if (!supportsCharacters && !supportsLeaders) {
    return undefined;
  }
  const filter = nameOnlyCardsTarget
    ? ({
        ...parsed.filter,
        categories: ["leader", "character"],
      } satisfies CardFilter)
    : parsed.filter;
  const requestZone =
    supportsLeaders && supportsCharacters
      ? {
          zones: ["leaderArea", "characterArea"] as [
            "leaderArea",
            "characterArea",
          ],
        }
      : supportsLeaders
        ? { zone: "leaderArea" as const }
        : { zone: "characterArea" as const };
  const leaderEvidence: PrimitiveEvidence[] = supportsLeaders
    ? ["zone:leaderArea"]
    : [];
  const characterEvidence: PrimitiveEvidence[] = supportsCharacters
    ? ["zone:characterArea"]
    : [];
  const inferredCategoryEvidence: PrimitiveEvidence[] = nameOnlyCardsTarget
    ? ["filter:category:leader", "filter:category:character"]
    : [];

  return {
    evidence: [
      ...leaderEvidence,
      ...characterEvidence,
      ...inferredCategoryEvidence,
      ...parsed.evidence,
    ],
    filter,
    requestZone,
    savedTargetZone: requestZone,
  };
};

function parseTypeIncludingLeaderOrCharacterAttachmentTarget(
  targetText: string,
):
  | {
      readonly evidence: readonly PrimitiveEvidence[];
      readonly filter: CardFilter;
      readonly requestZone: {
        readonly zones: ["leaderArea", "characterArea"];
      };
      readonly savedTargetZone: {
        readonly zones: ["leaderArea", "characterArea"];
      };
    }
  | undefined {
  const match =
    /^your Leader with a type including "(?<leaderType>[^"]+)" or 1 (?:of your )?Characters? with a type including "(?<characterType>[^"]+)"\.?$/iu.exec(
      targetText,
    );
  const leaderType = match?.groups?.["leaderType"]?.trim();
  const characterType = match?.groups?.["characterType"]?.trim();
  if (
    leaderType === undefined ||
    characterType === undefined ||
    leaderType.length === 0 ||
    leaderType !== characterType
  ) {
    return undefined;
  }

  const parsed = parseCardFilterPredicates({
    text: `with a type including "${leaderType}"`,
  });
  if (parsed === undefined || parsed.rest.trim() !== "") {
    return undefined;
  }

  const zoneTarget = {
    zones: ["leaderArea", "characterArea"] as ["leaderArea", "characterArea"],
  };
  return {
    evidence: [
      "zone:leaderArea",
      "zone:characterArea",
      "filter:category:leader",
      "filter:category:character",
      ...parsed.evidence,
    ],
    filter: {
      categories: ["leader", "character"],
      ...parsed.filter,
    },
    requestZone: zoneTarget,
    savedTargetZone: zoneTarget,
  };
}
