import {
  parseExactCardinality,
  parseUpToCardinality,
} from "../cardinality/index.js";
import type {
  InstructionParseResult,
  InstructionParser,
  PrimitiveEvidence,
} from "../types.js";
import {
  fieldZoneForCategory,
  type PublicFieldSelectionZone,
  selectThenApplyFieldTarget,
} from "./effect-builders.js";
import {
  parseAllFieldTarget,
  parseOpponentFieldTarget,
  parseTargetFromSet,
  parseYourCharactersTarget,
} from "../targets/index.js";
import type { FieldTargetParseResult } from "../targets/field-targets/types.js";

const trashTargetSelectionId = "selected:trash-target";

export const parseTrashInstruction: InstructionParser = (input) => {
  const actionMatch = /^Trash\s+(?<target>.+)$/i.exec(input.text);
  const targetText = actionMatch?.groups?.["target"];
  if (targetText === undefined) {
    return undefined;
  }

  const normalizedTargetText = targetText.replace(/\.$/, "");
  const target = parseAllFieldTarget({ text: normalizedTargetText });
  if (target !== undefined && target.rest.length === 0) {
    return {
      effect: {
        type: "trash",
        target: target.target,
      },
      evidence: ["instruction:trash", ...target.evidence],
      rest: "",
    } satisfies InstructionParseResult;
  }

  const cardinality = parseSelectedTrashCardinality(normalizedTargetText);
  if (cardinality === undefined) {
    return undefined;
  }

  const selectedTarget = parseTargetFromSet({ text: cardinality.rest }, [
    parseOpponentFieldTarget,
    parseYourCharactersTarget,
  ]);
  if (selectedTarget === undefined || selectedTarget.rest.length > 0) {
    return undefined;
  }

  const normalizedTarget = normalizeSelectedTrashTarget(selectedTarget);
  if (normalizedTarget === undefined) {
    return undefined;
  }

  return {
    effect: selectThenApplyFieldTarget({
      selectionId: trashTargetSelectionId,
      selectId: "select:trash-target",
      player: normalizedTarget.player,
      zone: normalizedTarget.zone,
      min: cardinality.min,
      max: cardinality.max,
      filter: normalizedTarget.filter,
      apply: (target) => ({ type: "trash", target }),
    }),
    evidence: [
      "instruction:trash",
      ...cardinality.evidence,
      cardinality.chooserEvidence,
      ...selectedTarget.evidence,
      "composition:selectThenApply",
    ],
    rest: "",
  } satisfies InstructionParseResult;
};

export const parseTrashAllYourCharactersInstruction = parseTrashInstruction;

const parseSelectedTrashCardinality = (
  text: string,
):
  | {
      readonly min: number;
      readonly max: number;
      readonly evidence: readonly PrimitiveEvidence[];
      readonly chooserEvidence: PrimitiveEvidence;
      readonly rest: string;
    }
  | undefined => {
  const upTo = parseUpToCardinality({ text });
  if (upTo !== undefined) {
    return {
      min: upTo.cardinality.min,
      max: upTo.cardinality.max,
      evidence: upTo.evidence,
      chooserEvidence: "chooser:self:upTo",
      rest: upTo.rest,
    };
  }

  const exact = parseExactCardinality({ text });
  if (exact !== undefined) {
    return {
      min: exact.count,
      max: exact.count,
      evidence: exact.evidence,
      chooserEvidence: "chooser:self",
      rest: exact.rest,
    };
  }

  return undefined;
};

const normalizeSelectedTrashTarget = (
  target: FieldTargetParseResult,
):
  | {
      readonly player: "self" | "opponent";
      readonly zone: PublicFieldSelectionZone;
      readonly filter: NonNullable<FieldTargetParseResult["filter"]>;
    }
  | undefined => {
  if (target.target?.type === "choose") {
    const request = target.target.request;
    const filter = request.filter ??
      target.filter ?? { categories: ["character"] };
    if (request.player !== "self" && request.player !== "opponent") {
      return undefined;
    }
    const zone =
      "zone" in request
        ? toPublicFieldSelectionZone(request.zone)
        : (fieldZoneForCategory(filter.categories?.[0]) ?? "characterArea");
    if (zone === undefined) {
      return undefined;
    }
    return {
      player: request.player,
      zone,
      filter,
    };
  }

  const filter = target.filter;
  if (filter === undefined) {
    return undefined;
  }
  const player = target.evidence.includes("player:self")
    ? "self"
    : target.evidence.includes("player:opponent")
      ? "opponent"
      : undefined;
  if (player === undefined) {
    return undefined;
  }
  return {
    player,
    zone: fieldZoneForCategory(filter.categories?.[0]) ?? "characterArea",
    filter,
  };
};

const toPublicFieldSelectionZone = (
  zone: string,
): PublicFieldSelectionZone | undefined =>
  zone === "leaderArea" ||
  zone === "characterArea" ||
  zone === "stageArea" ||
  zone === "costArea"
    ? zone
    : undefined;
