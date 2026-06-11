import type {
  MultiZoneTargetRequest,
  SavedFieldObjectZone,
  SavedFieldObjectTarget,
  SelectedTargetsRequest,
} from "@optcg/types";

import { parseUpToCardinality } from "../../../cardinality/index.js";
import { parseAngleAttribute } from "../../../filters/predicates/types.js";
import { parseKeyword } from "../../../keywords/index.js";
import {
  parseCompoundYourCharactersTarget,
  parseYourCharactersTarget,
  parseYourNamedCardsTarget,
} from "../../../targets/index.js";
import type { InstructionParser } from "../../../types.js";
import { parseExplicitFieldEffectDuration } from "../shared.js";

const selectedKeywordAttributeGrantTarget = "selected:keyword-attribute-grant";
const savedFieldObjectZones = new Set<string>([
  "leaderArea",
  "characterArea",
  "stageArea",
  "costArea",
]);

const isSavedFieldObjectZone = (zone: string): zone is SavedFieldObjectZone =>
  savedFieldObjectZones.has(zone);

export const parseTargetedKeywordAndAttributeGrantInstruction: InstructionParser =
  (input) => {
    const cardinality = parseUpToCardinality(input);
    if (cardinality === undefined) {
      return undefined;
    }

    const target =
      parseCompoundYourCharactersTarget(
        { text: cardinality.rest },
        cardinality.cardinality,
      ) ??
      parseYourCharactersTarget({ text: cardinality.rest }) ??
      parseYourNamedCardsTarget({ text: cardinality.rest });
    if (target?.target === undefined) {
      return undefined;
    }
    if (
      target.target.type !== "choose" &&
      target.target.type !== "chooseFromZones"
    ) {
      return undefined;
    }

    const keywordText = /^gains\s+(?<rest>.*)$/i.exec(target.rest)?.groups?.[
      "rest"
    ];
    if (keywordText === undefined) {
      return undefined;
    }

    const keyword = parseKeyword({ text: keywordText });
    if (keyword === undefined) {
      return undefined;
    }

    const attributeText =
      /^and\s+the\s+(?<attribute><[^>]+>)\s+attribute\s+(?<rest>.*)$/iu.exec(
        keyword.rest,
      );
    const attribute = parseAngleAttribute(
      attributeText?.groups?.["attribute"] ?? "",
    );
    const durationText = attributeText?.groups?.["rest"];
    if (attribute === undefined || durationText === undefined) {
      return undefined;
    }

    const duration = parseExplicitFieldEffectDuration({ text: durationText });
    if (
      duration === undefined ||
      duration.duration === undefined ||
      duration.rest.length > 0
    ) {
      return undefined;
    }

    const request = target.target.request;
    let selectRequest: SelectedTargetsRequest | MultiZoneTargetRequest;
    let savedTarget: SavedFieldObjectTarget;
    if ("zone" in request) {
      if (
        !isSavedFieldObjectZone(request.zone) ||
        request.visibility !== "public"
      ) {
        return undefined;
      }
      selectRequest = { ...request, zone: request.zone, visibility: "public" };
      savedTarget = {
        type: "savedFieldObject",
        binding: {
          family: "selectedTargets",
          saveResultAs: selectedKeywordAttributeGrantTarget,
        },
        zone: request.zone,
        player: request.player,
        visibility: "publicOnly",
        onFailure: "failClosed",
      };
    } else {
      if (
        !request.zones.every(isSavedFieldObjectZone) ||
        request.visibility !== "public"
      ) {
        return undefined;
      }
      selectRequest = { ...request, zones: request.zones };
      savedTarget = {
        type: "savedFieldObject",
        binding: {
          family: "selectedTargets",
          saveResultAs: selectedKeywordAttributeGrantTarget,
        },
        zones: request.zones,
        player: request.player,
        visibility: "publicOnly",
        onFailure: "failClosed",
      };
    }

    return {
      effect: {
        type: "sequence",
        effects: [
          {
            id: "select:keyword-attribute-grant-target",
            connector: "always",
            saveResultAs: selectedKeywordAttributeGrantTarget,
            effect: {
              type: "selectTargets",
              request: selectRequest,
            },
          },
          {
            id: "grant-keyword:selected-keyword-attribute-target",
            connector: "ifPreviousSucceeded",
            effect: {
              type: "giveKeyword",
              target: savedTarget,
              keyword: keyword.keyword,
              duration: duration.duration,
            },
          },
          {
            id: "grant-attribute:selected-keyword-attribute-target",
            connector: "ifPreviousSucceeded",
            effect: {
              type: "giveAttribute",
              target: savedTarget,
              attribute,
              duration: duration.duration,
            },
          },
        ],
      },
      evidence: [
        "composition:sequence",
        "instruction:selectTargets",
        "instruction:giveKeyword",
        "instruction:giveAttribute",
        ...cardinality.evidence,
        "chooser:self:upTo",
        ...target.evidence,
        ...keyword.evidence,
        "filter:attribute",
        ...duration.evidence,
      ],
      rest: "",
    };
  };
