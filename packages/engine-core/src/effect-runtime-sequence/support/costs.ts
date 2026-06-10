import type { CardFilter, Cost, Effect, Target } from "@optcg/types";

import { isSupportedHandSelectionCardFilter } from "../../actions/state.js";
import { isSupportedAttachDonTargetFilter } from "../support-filters.js";
import { isSupportedSequenceContinuousDuration } from "./continuous.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type SequenceSegmentEffect = SequenceEffect["effects"][number]["effect"];

export type PayCostEffect = Extract<SequenceSegmentEffect, { type: "payCost" }>;

export const isSupportedPayCostSegment = (
  effect: SequenceSegmentEffect,
): effect is PayCostEffect => {
  if (effect.type !== "payCost") {
    return false;
  }
  const cost = effect.cost;
  if (cost.type === "chooseOne") {
    const hasSupportedSelfOptionalPositiveCount = (option: unknown): boolean =>
      typeof option === "object" &&
      option !== null &&
      (option as Record<string, unknown>)["chooser"] === "self" &&
      (option as Record<string, unknown>)["optional"] === true &&
      Number.isInteger((option as Record<string, unknown>)["count"]) &&
      ((option as Record<string, unknown>)["count"] as number) > 0;
    const hasSupportedSelfOptionalHand = (option: unknown): boolean => {
      if (!hasSupportedSelfOptionalPositiveCount(option)) {
        return false;
      }
      return (
        typeof option === "object" &&
        option !== null &&
        isSupportedHandSelectionCardFilter(
          (option as { filter?: CardFilter }).filter,
        )
      );
    };
    return cost.options.every((option) => {
      if (option.type === "trashFromHand") {
        return hasSupportedSelfOptionalHand(option);
      }
      return (
        hasSupportedSelfOptionalPositiveCount(option) &&
        isSupportedHandSelectionCardFilter(option.filter)
      );
    });
  }
  if (cost.type === "restSelf") {
    return true;
  }
  if (cost.type === "attachDon") {
    return (
      Number.isInteger(cost.count) &&
      cost.count > 0 &&
      isSupportedAttachDonCostTarget(cost.target)
    );
  }
  if (cost.type === "trashSelf") {
    return isSupportedHandSelectionCardFilter(cost.filter);
  }
  if (cost.type === "turnLifeFaceUp") {
    return (
      cost.player === "self" && Number.isInteger(cost.count) && cost.count > 0
    );
  }
  if (cost.type === "modifyPower") {
    return (
      cost.target.type === "myLeader" &&
      Number.isSafeInteger(cost.value) &&
      cost.value !== 0 &&
      isSupportedSequenceContinuousDuration(cost.duration)
    );
  }
  return (
    (cost.type === "restDon" ||
      cost.type === "returnDon" ||
      cost.type === "trashFromHand" ||
      cost.type === "revealFromHand" ||
      cost.type === "moveCards") &&
    (cost.chooser === undefined || cost.chooser === "self") &&
    (cost.type !== "trashFromHand" ||
      isSupportedHandSelectionCardFilter(cost.filter)) &&
    (cost.type !== "revealFromHand" ||
      isSupportedHandSelectionCardFilter(cost.filter)) &&
    (cost.type !== "moveCards" ||
      (isSupportedMoveCardsCostRoute(cost) &&
        isSupportedHandSelectionCardFilter(cost.filter))) &&
    Number.isInteger(cost.count) &&
    cost.count > 0
  );
};

const isSupportedMoveCardsCostRoute = (
  cost: Extract<Cost, { type: "moveCards" }>,
): boolean => {
  if (cost.from.player !== "self" || cost.to.player !== "self") {
    return false;
  }
  if (
    cost.from.zone === "trash" &&
    cost.from.position === undefined &&
    cost.to.zone === "deck" &&
    cost.to.position === "bottom"
  ) {
    return true;
  }
  if (
    cost.from.zone === "hand" &&
    cost.from.position === undefined &&
    cost.to.zone === "deck" &&
    cost.to.position === "top"
  ) {
    return cost.count === 1;
  }
  if (
    cost.from.zone === "deck" &&
    cost.from.position === "top" &&
    cost.to.zone === "trash" &&
    cost.to.position === undefined
  ) {
    return true;
  }
  if (
    cost.from.zone === "life" &&
    cost.from.position === "top" &&
    cost.to.zone === "trash" &&
    cost.to.position === undefined
  ) {
    return true;
  }
  return (
    cost.from.zone === "life" &&
    (cost.from.position === "top" ||
      cost.from.position === "bottom" ||
      cost.from.position === "topOrBottom") &&
    cost.to.zone === "hand" &&
    cost.to.position === undefined
  );
};

const isSupportedAttachDonCostTarget = (target: Target): boolean => {
  if (target.type !== "choose" && target.type !== "chooseFromZones") {
    return false;
  }
  const request = target.request;
  const zones = "zones" in request ? request.zones : [request.zone];
  return (
    request.timing === "onResolution" &&
    request.chooser === "self" &&
    (request.player === "self" || request.player === "opponent") &&
    zones.length > 0 &&
    zones.every((zone) => zone === "leaderArea" || zone === "characterArea") &&
    request.min === 1 &&
    request.max === 1 &&
    !request.allowFewerIfUnavailable &&
    request.visibility === "public" &&
    isSupportedAttachDonTargetFilter(request.filter)
  );
};
