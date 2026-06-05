import type { Effect } from "@optcg/types";

import { parseExactCardinality } from "../cardinality/index.js";
import { parseThisTurnDuration } from "../durations/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import {
  parseNegativePowerModifier,
  parsePositivePowerModifier,
} from "../modifiers/index.js";
import { parseYourFieldReplacementTarget } from "../targets/replacement-targets.js";
import type { ExpressionParseResult, ParseInput } from "../types.js";

const replacementOwnerDeckBottomSelectionId =
  "selected:owner-deck-bottom" as const;

export function replacementInsteadExpressionParser(
  input: ParseInput,
): ExpressionParseResult | undefined {
  if (
    input.entryPoint?.category !== "replacement" ||
    input.entryPoint.trigger.type !== "replacement"
  ) {
    return undefined;
  }

  const parsed =
    parseOpponentKoReplacement(input.text) ??
    parseOpponentFieldRemovalReplacement(input.text);
  if (parsed === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "replacement",
      when: parsed.when,
      instead: parsed.instead,
    },
    evidence: [
      "expression:replacement",
      "composition:replacementInstead",
      ...parsed.evidence,
    ],
    rest: "",
    blockPatch: {
      category: "replacement",
      optional: true,
      trigger: { type: "replacement", replacement: parsed.when },
    },
  };
}

function parseOpponentKoReplacement(text: string):
  | {
      readonly when: Extract<Effect, { type: "replacement" }>["when"];
      readonly instead: Effect;
      readonly evidence: ExpressionParseResult["evidence"];
    }
  | undefined {
  const match =
    /^If (?<target>.+?) would be K\.O\.'d(?: by your opponent(?<effectOnly>'s effects?))?,\s*(?<body>.+)$/i.exec(
      text.trim(),
    );
  const targetText = match?.groups?.["target"];
  const effectOnlyText = match?.groups?.["effectOnly"];
  const bodyText = match?.groups?.["body"];
  if (targetText === undefined || bodyText === undefined) {
    return undefined;
  }

  const normalizedTargetText = normalizeFieldRemovalTargetText(targetText);
  const target = parseYourFieldReplacementTarget({
    text: normalizedTargetText,
  });
  if (
    target === undefined ||
    target.rest.length > 0 ||
    (target.target.type !== "all" && target.target.type !== "self")
  ) {
    return undefined;
  }
  const instead = parseInsteadEffect(bodyText);
  if (instead === undefined) {
    return undefined;
  }

  return {
    when: {
      type: "wouldBeKOd",
      ...(effectOnlyText === undefined && !/by your opponent/i.test(text)
        ? { sourceControllerRelation: "any" as const }
        : {}),
      ...(effectOnlyText === undefined ? {} : { sourceKind: "cardEffect" }),
      target: target.target,
    },
    instead: instead.effect,
    evidence: [
      "replacement:wouldBeKOd",
      ...(/by your opponent/i.test(text)
        ? (["replacementSource:opponent"] as const)
        : []),
      ...(effectOnlyText === undefined
        ? []
        : ["replacementSource:cardEffect" as const]),
      ...target.evidence,
      ...instead.evidence,
    ],
  };
}

function parseOpponentFieldRemovalReplacement(text: string):
  | {
      readonly when: Extract<Effect, { type: "replacement" }>["when"];
      readonly instead: Effect;
      readonly evidence: ExpressionParseResult["evidence"];
    }
  | undefined {
  const match =
    /^If (?<target>.+?) would be removed from the field by your opponent(?<effectOnly>'s effects?)?,\s*(?<body>.+)$/i.exec(
      text.trim(),
    );
  const targetText = match?.groups?.["target"];
  const effectOnlyText = match?.groups?.["effectOnly"];
  const bodyText = match?.groups?.["body"];
  if (targetText === undefined || bodyText === undefined) {
    return undefined;
  }

  const normalizedTargetText = normalizeFieldRemovalTargetText(targetText);
  const target = parseYourFieldReplacementTarget({
    text: normalizedTargetText,
  });
  if (
    target === undefined ||
    target.rest.length > 0 ||
    target.target.type !== "all"
  ) {
    return undefined;
  }
  const instead = parseInsteadEffect(bodyText);
  if (instead === undefined) {
    return undefined;
  }

  return {
    when: {
      type: "wouldMoveZone",
      from: target.target.zone,
      ...(effectOnlyText === undefined ? {} : { sourceKind: "cardEffect" }),
      sourceControllerRelation: "opponentControlled",
      target: target.target,
    },
    instead: instead.effect,
    evidence: [
      "replacement:wouldMoveZone",
      "replacement:fieldRemoval",
      "replacementSource:opponent",
      ...(effectOnlyText === undefined
        ? []
        : ["replacementSource:cardEffect" as const]),
      ...target.evidence,
      ...instead.evidence,
    ],
  };
}

function normalizeFieldRemovalTargetText(text: string): string {
  const trimmed = text.trim();
  const ownedSubject = /^you have an?\s+(?<predicate>.+?)\s+that$/i.exec(
    trimmed,
  );
  const predicate = ownedSubject?.groups?.["predicate"];
  if (predicate !== undefined) {
    return `your ${predicate}`;
  }
  return trimmed;
}

function parseInsteadEffect(text: string):
  | {
      readonly effect: Effect;
      readonly evidence: ExpressionParseResult["evidence"];
    }
  | undefined {
  return (
    parseTopLifeToHandInstead(text) ??
    parseReturnDonInstead(text) ??
    parseOwnerDeckBottomInstead(text) ??
    parseTrashFromHandInstead(text) ??
    parseTrashSelfInstead(text) ??
    parseModifyLeaderPowerInstead(text) ??
    parseRestSelfInstead(text) ??
    parseRestCardsInstead(text)
  );
}

function parseTopLifeToHandInstead(text: string):
  | {
      readonly effect: Effect;
      readonly evidence: ExpressionParseResult["evidence"];
    }
  | undefined {
  const match =
    /^you may add (?<count>[1-9]\d*) cards? from the top of your Life cards to your hand instead\.?$/i.exec(
      text.trim(),
    );
  const countText = match?.groups?.["count"];
  if (countText === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "moveCards",
      count: Number.parseInt(countText, 10),
      from: { player: "self", zone: "life", position: "top" },
      to: { player: "self", zone: "hand" },
      order: "original",
    },
    evidence: [
      "instruction:moveCards",
      "count:positiveInteger",
      "player:self",
      "zone:life",
      "position:top",
      "destination:hand",
      "order:original",
    ],
  };
}

function parseReturnDonInstead(text: string):
  | {
      readonly effect: Effect;
      readonly evidence: ExpressionParseResult["evidence"];
    }
  | undefined {
  const match =
    /^you may return (?<count>[1-9]\d*) DON!! cards? from your field to your DON!! deck instead\.?$/i.exec(
      text.trim(),
    );
  const countText = match?.groups?.["count"];
  if (countText === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "returnDon",
      count: Number.parseInt(countText, 10),
      player: "self",
    },
    evidence: [
      "instruction:returnDon",
      "count:positiveInteger",
      "player:self",
      "zone:donDeck",
    ],
  };
}

function parseOwnerDeckBottomInstead(text: string):
  | {
      readonly effect: Effect;
      readonly evidence: ExpressionParseResult["evidence"];
    }
  | undefined {
  const match =
    /^you may place (?<selection>.+?) at the bottom of the owner's deck instead\.?$/iu.exec(
      text.trim(),
    );
  const selectionText = match?.groups?.["selection"];
  if (selectionText === undefined) {
    return undefined;
  }

  const cardinality = parseExactCardinality({ text: selectionText });
  const targetText = cardinality?.rest;
  if (cardinality === undefined || targetText === undefined) {
    return undefined;
  }
  const targetMatch = /^of your (?<filter>.+)$/iu.exec(targetText);
  const filterText = targetMatch?.groups?.["filter"];
  if (filterText === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates(
    { text: filterText },
    { powerSemantics: "current" },
  );
  if (
    predicates === undefined ||
    predicates.rest.length > 0 ||
    predicates.filter.categories?.[0] !== "character"
  ) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: "select:owner-deck-bottom",
          connector: "always",
          saveResultAs: replacementOwnerDeckBottomSelectionId,
          effect: {
            type: "selectTargets",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "self",
              zone: "characterArea",
              min: cardinality.count,
              max: cardinality.count,
              allowFewerIfUnavailable: false,
              visibility: "public",
              filter: predicates.filter,
            },
          },
        },
        {
          connector: "then",
          effect: {
            type: "bounce",
            destination: "deckBottom",
            target: {
              type: "savedFieldObject",
              binding: {
                family: "selectedTargets",
                saveResultAs: replacementOwnerDeckBottomSelectionId,
              },
              zone: "characterArea",
              player: "self",
              visibility: "publicOnly",
              onFailure: "failClosed",
            },
          },
        },
      ],
    },
    evidence: [
      "instruction:moveSelected",
      ...cardinality.evidence,
      "chooser:self:upTo",
      "player:self",
      "target:yourCharacters",
      "zone:characterArea",
      ...predicates.evidence,
      "destination:deck",
      "position:bottom",
      "composition:selectThenApply",
    ],
  };
}

function parseTrashFromHandInstead(text: string):
  | {
      readonly effect: Effect;
      readonly evidence: ExpressionParseResult["evidence"];
    }
  | undefined {
  const match = /^you may trash (?<count>[1-9]\d*) (?<rest>.+)$/i.exec(
    text.trim(),
  );
  const countText = match?.groups?.["count"];
  const restText = match?.groups?.["rest"];
  if (countText === undefined || restText === undefined) {
    return undefined;
  }

  const unfilteredMatch = /^cards? from your hand instead\.?$/i.exec(restText);
  if (unfilteredMatch !== null) {
    return {
      effect: {
        type: "trashFromHand",
        player: "self",
        chooser: "self",
        count: Number.parseInt(countText, 10),
      },
      evidence: [
        "instruction:trashFromHand",
        "count:positiveInteger",
        "player:self",
        "chooser:self",
      ],
    };
  }

  const filteredMatch = /^(?<filter>.+?) from your hand instead\.?$/i.exec(
    restText,
  );
  const filterText = filteredMatch?.groups?.["filter"];
  if (filterText === undefined) {
    return undefined;
  }

  const parsedFilter = parseCardFilterPredicates({ text: filterText });
  if (parsedFilter === undefined || parsedFilter.rest.length > 0) {
    return undefined;
  }

  return {
    effect: {
      type: "trashFromHand",
      player: "self",
      chooser: "self",
      count: Number.parseInt(countText, 10),
      filter: parsedFilter.filter,
    },
    evidence: [
      "instruction:trashFromHand",
      "count:positiveInteger",
      "player:self",
      "chooser:self",
      ...parsedFilter.evidence,
    ],
  };
}

function parseTrashSelfInstead(text: string):
  | {
      readonly effect: Effect;
      readonly evidence: ExpressionParseResult["evidence"];
    }
  | undefined {
  if (!/^you may trash this Character instead\.?$/i.test(text.trim())) {
    return undefined;
  }

  return {
    effect: {
      type: "trash",
      target: { type: "self" },
    },
    evidence: ["instruction:trash", "target:thisCharacter"],
  };
}

function parseModifyLeaderPowerInstead(text: string):
  | {
      readonly effect: Effect;
      readonly evidence: ExpressionParseResult["evidence"];
    }
  | undefined {
  const match = /^you may give your Leader (?<modifier>.+?) instead\.?$/iu.exec(
    text.trim(),
  );
  const modifierText = match?.groups?.["modifier"];
  if (modifierText === undefined) {
    return undefined;
  }

  const modifier =
    parseNegativePowerModifier({ text: modifierText }) ??
    parsePositivePowerModifier({ text: modifierText });
  if (modifier === undefined) {
    return undefined;
  }

  const duration = parseThisTurnDuration({ text: modifier.rest });
  if (duration?.duration === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "modifyPower",
      target: { type: "myLeader" },
      value: modifier.value,
      duration: duration.duration,
    },
    evidence: [
      "instruction:modifyPower",
      "target:yourLeader",
      ...modifier.evidence,
      ...duration.evidence,
    ],
  };
}

function parseRestSelfInstead(text: string):
  | {
      readonly effect: Effect;
      readonly evidence: ExpressionParseResult["evidence"];
    }
  | undefined {
  if (!/^you may rest this Character instead\.?$/i.test(text.trim())) {
    return undefined;
  }

  return {
    effect: {
      type: "rest",
      target: { type: "self" },
    },
    evidence: ["instruction:rest", "target:thisCharacter"],
  };
}

function parseRestCardsInstead(text: string):
  | {
      readonly effect: Effect;
      readonly evidence: ExpressionParseResult["evidence"];
    }
  | undefined {
  const match =
    /^you may rest (?<count>[1-9]\d*) of your cards instead\.?$/i.exec(
      text.trim(),
    );
  const countText = match?.groups?.["count"];
  if (countText === undefined) {
    return undefined;
  }
  const count = Number.parseInt(countText, 10);

  return {
    effect: {
      type: "rest",
      target: {
        type: "chooseFromZones",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "self",
          zones: ["leaderArea", "characterArea", "stageArea", "costArea"],
          min: count,
          max: count,
          allowFewerIfUnavailable: false,
          visibility: "public",
        },
      },
    },
    evidence: [
      "instruction:rest",
      "target:yourCards",
      "zone:leaderArea",
      "zone:characterArea",
      "zone:stageArea",
      "zone:costArea",
      "cardinality:exact",
      "count:positiveInteger",
    ],
  };
}
