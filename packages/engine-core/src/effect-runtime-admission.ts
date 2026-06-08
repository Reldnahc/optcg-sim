import type {
  Effect,
  EffectBlock,
  EffectQueueEntry,
  RuntimeSupportReport,
  SupportEvidenceRecord,
} from "@optcg/types";

import { isSupportedActivateMainRuntimeEffectBlock } from "./runtime/optional-activation/activate-main.js";
import { isSupportedActivatedReactionEffect } from "./runtime/optional-activation/event-reaction.js";
import {
  isSupportedAutoRuntimeEffectBlock,
  type AutoRuntimeEntryAdapter,
} from "./effect-runtime-block-support.js";
import { isSupportedPermanentContinuousEffectBlock } from "./runtime/continuous/continuous.js";
import { isSupportedReplacementEffectBlock } from "./effect-runtime-replacement-primitives.js";
import { isSupportedSequenceBlock } from "./effect-runtime-sequence/support.js";
import {
  createRuntimeSupportReport,
  runtimeSupportRecord,
} from "./runtime-support-report.js";
import { isSupportedStartOfGameEffectBlock } from "./setup/start-of-game-effects.js";

export type RuntimeSupportAdmissionResult = RuntimeSupportReport;

export const evaluateEffectBlockRuntimeSupport = (
  block: EffectBlock,
): RuntimeSupportAdmissionResult => {
  if (block.category === "auto") {
    if (block.trigger.type === "startOfGame") {
      return isSupportedStartOfGameEffectBlock(block)
        ? supportedBlockReport(block)
        : unsupportedBodyReport(
            block,
            "unsupported start-of-game effect shape",
          );
    }

    const adapter = autoAdapterFor(block);
    if (adapter === undefined) {
      return unsupportedEnvelope(block);
    }

    return isSupportedAutoRuntimeEffectBlock(block, adapter)
      ? supportedBlockReport(block)
      : unsupportedBodyReport(block, "unsupported auto effect body");
  }

  if (block.category === "activate" && block.trigger.type === "activateMain") {
    return isSupportedActivateMainRuntimeEffectBlock(block) ||
      isSupportedSequenceBlock(activateMainProbeQueueEntry, block)
      ? supportedBlockReport(block)
      : unsupportedBodyReport(block, "unsupported activate-main effect body");
  }

  if (block.category === "activate") {
    return isSupportedActivatedReactionEffect(block)
      ? supportedBlockReport(block)
      : unsupportedBodyReport(block, "unsupported activated-reaction body");
  }

  if (block.category === "permanent" && block.trigger.type === "permanent") {
    return isSupportedPermanentContinuousEffectBlock(block)
      ? supportedBlockReport(block)
      : unsupportedBodyReport(block, "unsupported permanent effect body");
  }

  if (block.category === "replacement") {
    return isSupportedReplacementEffectBlock(block)
      ? supportedBlockReport(block)
      : unsupportedBodyReport(block, "unsupported replacement effect body");
  }

  return unsupportedEnvelope(block);
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
  if (block.trigger.type === "onOpponentAttack") {
    return autoAdapter("onOpponentAttack", ["mustRemainInSameZone"]);
  }
  if (block.trigger.type === "onKO") {
    return autoAdapter("onKO", [
      "resolveFromDestinationZone",
      "resolveFromLastKnownInformation",
    ]);
  }
  if (block.trigger.type === "endOfYourTurn") {
    return autoAdapter("endOfYourTurn", ["mustRemainInSameZone"]);
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
  if (block.trigger.type === "lifeRemoved") {
    return autoAdapter("lifeRemoved", ["mustRemainInSameZone"]);
  }
  if (block.trigger.type === "handTrashedByEffect") {
    return autoAdapter("handTrashedByEffect", ["mustRemainInSameZone"]);
  }
  if (block.trigger.type === "opponentActivated") {
    return autoAdapter("opponentActivated", ["mustRemainInSameZone"]);
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

const supportedBlockReport = (block: EffectBlock): RuntimeSupportReport =>
  createRuntimeSupportReport([
    ...entrySupportRecords(block, true),
    runtimeSupportRecord({
      family: "body",
      id: effectBodyId(block.effect),
      supported: true,
      effectPath: ["effect"],
    }),
  ]);

const unsupportedBodyReport = (
  block: EffectBlock,
  reason: string,
): RuntimeSupportReport =>
  createRuntimeSupportReport([
    ...entrySupportRecords(block, true),
    runtimeSupportRecord({
      family: "body",
      id: effectBodyId(block.effect),
      supported: false,
      reason,
      effectPath: ["effect"],
    }),
  ]);

const unsupportedEnvelope = (
  block: EffectBlock,
): RuntimeSupportAdmissionResult =>
  createRuntimeSupportReport([
    ...entrySupportRecords(block, false, {
      reason: "unsupported trigger/category/source-presence envelope",
    }),
    runtimeSupportRecord({
      family: "body",
      id: effectBodyId(block.effect),
      supported: false,
      reason: "unsupported trigger/category/source-presence envelope",
      effectPath: ["effect"],
    }),
  ]);

const entrySupportRecords = (
  block: EffectBlock,
  supported: boolean,
  options: { readonly reason?: string } = {},
): readonly SupportEvidenceRecord[] => [
  runtimeSupportRecord({
    family: "entryPoint",
    id: block.trigger.type,
    supported,
    ...(options.reason === undefined ? {} : { reason: options.reason }),
    effectPath: ["trigger"],
  }),
  ...(block.sourcePresencePolicy === undefined
    ? []
    : [
        runtimeSupportRecord({
          family: "sourcePresence",
          id: block.sourcePresencePolicy,
          supported,
          ...(options.reason === undefined ? {} : { reason: options.reason }),
          effectPath: ["sourcePresencePolicy"],
        }),
      ]),
];

const effectBodyId = (effect: Effect): string => effect.type;

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
