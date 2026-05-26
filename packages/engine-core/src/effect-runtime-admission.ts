import type { EffectBlock, EffectQueueEntry } from "@optcg/types";

import {
  isSupportedActivateMainNoChoiceDrawEffect,
  isSupportedOptionalActivateMainNoChoiceDrawEffect,
} from "./effect-runtime-activation-main.js";
import {
  isSupportedAutoRuntimeEffectBlock,
  type AutoRuntimeEntryAdapter,
} from "./effect-runtime-block-support.js";
import { isSupportedPermanentContinuousEffectBlock } from "./effect-runtime-continuous.js";
import { isSupportedSequenceBlock } from "./effect-runtime-sequence-support.js";
import { isSupportedStartOfGameEffectBlock } from "./start-of-game-effects.js";

export interface RuntimeSupportAdmissionResult {
  readonly supported: boolean;
  readonly reason?: string;
}

export const evaluateEffectBlockRuntimeSupport = (
  block: EffectBlock,
): RuntimeSupportAdmissionResult => {
  if (block.category === "auto") {
    if (block.trigger.type === "startOfGame") {
      return isSupportedStartOfGameEffectBlock(block)
        ? { supported: true }
        : {
            supported: false,
            reason: "unsupported start-of-game effect shape",
          };
    }

    const adapter = autoAdapterFor(block);
    if (adapter === undefined) {
      return unsupportedEnvelope();
    }

    return isSupportedAutoRuntimeEffectBlock(block, adapter)
      ? { supported: true }
      : { supported: false, reason: "unsupported auto effect body" };
  }

  if (block.category === "activate" && block.trigger.type === "activateMain") {
    return isSupportedActivateMainNoChoiceDrawEffect(block) ||
      isSupportedOptionalActivateMainNoChoiceDrawEffect(block) ||
      isSupportedSequenceBlock(activateMainProbeQueueEntry, block)
      ? { supported: true }
      : { supported: false, reason: "unsupported activate-main effect body" };
  }

  if (block.category === "permanent" && block.trigger.type === "permanent") {
    return isSupportedPermanentContinuousEffectBlock(block)
      ? { supported: true }
      : { supported: false, reason: "unsupported permanent effect body" };
  }

  return unsupportedEnvelope();
};

const autoAdapterFor = (
  block: EffectBlock,
): AutoRuntimeEntryAdapter | undefined => {
  if (block.sourcePresencePolicy === undefined) {
    return undefined;
  }

  if (block.trigger.type === "onPlay") {
    return autoAdapter("onPlay", ["mustRemainInSameZone"]);
  }
  if (block.trigger.type === "whenAttacking") {
    return autoAdapter("whenAttacking", ["mustRemainInSameZone"]);
  }
  if (block.trigger.type === "onKO") {
    return autoAdapter("onKO", [
      "resolveFromDestinationZone",
      "resolveFromLastKnownInformation",
    ]);
  }
  if (block.trigger.type === "main") {
    return autoAdapter("main", [
      "noSourceRequired",
      "resolveFromDestinationZone",
    ]);
  }
  if (block.trigger.type === "trigger") {
    return autoAdapter("trigger", ["noSourceRequired"]);
  }
  if (block.trigger.type === "counter") {
    return autoAdapter("counter", ["resolveFromDestinationZone"]);
  }
  return undefined;
};

const autoAdapter = (
  triggerType: AutoRuntimeEntryAdapter["triggerType"],
  sourcePresencePolicies: readonly EffectQueueEntry["sourcePresencePolicy"][],
): AutoRuntimeEntryAdapter => ({
  category: "auto",
  sourcePresencePolicies,
  triggerType,
});

const unsupportedEnvelope = (): RuntimeSupportAdmissionResult => ({
  supported: false,
  reason: "unsupported trigger/category/source-presence envelope",
});

const probePlayerId = "player-1" as EffectQueueEntry["controllerId"];

const activateMainProbeQueueEntry: EffectQueueEntry = {
  id: "queue-entry:activate-main:probe:source:effect" as EffectQueueEntry["id"],
  state: "pending",
  timingWindowId:
    "timing-window:activate-main:probe" as EffectQueueEntry["timingWindowId"],
  generation: 0,
  controllerId: probePlayerId,
  source: {
    instanceId: "probe-source" as EffectQueueEntry["source"]["instanceId"],
    cardId: "PROBE-000" as EffectQueueEntry["source"]["cardId"],
    playerId: probePlayerId,
    zone: { playerId: probePlayerId, zone: "leaderArea" },
  },
  sourceSnapshot: {
    instanceId:
      "probe-source" as EffectQueueEntry["sourceSnapshot"]["instanceId"],
    cardId: "PROBE-000" as EffectQueueEntry["sourceSnapshot"]["cardId"],
    ownerId: probePlayerId,
    controllerId: probePlayerId,
    zone: { playerId: probePlayerId, zone: "leaderArea" },
    category: "leader",
    colors: [],
    keywords: [],
    power: 5000,
  },
  effectBlockId: "effect:probe" as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: 0 as EffectQueueEntry["queuedAtStateSeq"],
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: "effectRuntime:activateMain" },
};
