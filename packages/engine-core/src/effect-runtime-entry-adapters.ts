import type {
  EffectDefinition,
  SourcePresencePolicy,
  Trigger,
} from "@optcg/types";

type EffectBlock = EffectDefinition["effects"][number];
export type AutoRuntimeTriggerType = Exclude<Trigger["type"], "anyOf">;

export interface AutoRuntimeEntryAdapter {
  readonly category: "auto";
  readonly sourcePresencePolicies: readonly SourcePresencePolicy[];
  readonly triggerType: AutoRuntimeTriggerType;
}

const autoAdapter = (
  triggerType: AutoRuntimeEntryAdapter["triggerType"],
  sourcePresencePolicies: readonly SourcePresencePolicy[],
): AutoRuntimeEntryAdapter => ({
  category: "auto",
  sourcePresencePolicies,
  triggerType,
});

export const autoRuntimeEntryAdapterForTriggerType = (
  triggerType: AutoRuntimeTriggerType,
): AutoRuntimeEntryAdapter | undefined => {
  if (triggerType === "onPlay") {
    return autoAdapter("onPlay", [
      "mustRemainInSameZone",
      "resolveFromLastKnownInformation",
    ]);
  }
  if (triggerType === "whenAttacking") {
    return autoAdapter("whenAttacking", ["mustRemainInSameZone"]);
  }
  if (triggerType === "onOpponentAttack") {
    return autoAdapter("onOpponentAttack", ["mustRemainInSameZone"]);
  }
  if (triggerType === "onBlock") {
    return autoAdapter("onBlock", ["mustRemainInSameZone"]);
  }
  if (triggerType === "onKO") {
    return autoAdapter("onKO", [
      "resolveFromDestinationZone",
      "resolveFromLastKnownInformation",
    ]);
  }
  if (triggerType === "endOfYourTurn") {
    return autoAdapter("endOfYourTurn", ["mustRemainInSameZone"]);
  }
  if (triggerType === "main") {
    return autoAdapter("main", [
      "noSourceRequired",
      "resolveFromDestinationZone",
    ]);
  }
  if (triggerType === "trigger") {
    return autoAdapter("trigger", [
      "noSourceRequired",
      "resolveFromLastKnownInformation",
    ]);
  }
  if (triggerType === "counter") {
    return autoAdapter("counter", ["resolveFromDestinationZone"]);
  }
  if (triggerType === "lifeRemoved") {
    return autoAdapter("lifeRemoved", ["mustRemainInSameZone"]);
  }
  if (triggerType === "damageDealt") {
    return autoAdapter("damageDealt", ["mustRemainInSameZone"]);
  }
  if (triggerType === "fieldRemoved") {
    return autoAdapter("fieldRemoved", [
      "mustRemainInSameZone",
      "resolveFromLastKnownInformation",
    ]);
  }
  if (triggerType === "cardDrawn") {
    return autoAdapter("cardDrawn", ["mustRemainInSameZone"]);
  }
  if (triggerType === "cardPlayed") {
    return autoAdapter("cardPlayed", ["mustRemainInSameZone"]);
  }
  if (triggerType === "cardRested") {
    return autoAdapter("cardRested", ["mustRemainInSameZone"]);
  }
  if (triggerType === "donReturned") {
    return autoAdapter("donReturned", ["mustRemainInSameZone"]);
  }
  if (triggerType === "donAttached") {
    return autoAdapter("donAttached", ["mustRemainInSameZone"]);
  }
  if (triggerType === "attackDeclared") {
    return autoAdapter("attackDeclared", ["mustRemainInSameZone"]);
  }
  if (triggerType === "endOfBattle") {
    return autoAdapter("endOfBattle", ["mustRemainInSameZone"]);
  }
  if (triggerType === "effectQueued") {
    return autoAdapter("effectQueued", ["mustRemainInSameZone"]);
  }
  if (triggerType === "effectResolved") {
    return autoAdapter("effectResolved", ["mustRemainInSameZone"]);
  }
  if (triggerType === "triggerActivated") {
    return autoAdapter("triggerActivated", ["mustRemainInSameZone"]);
  }
  if (triggerType === "handTrashedByEffect") {
    return autoAdapter("handTrashedByEffect", ["mustRemainInSameZone"]);
  }
  if (triggerType === "opponentActivated") {
    return autoAdapter("opponentActivated", ["mustRemainInSameZone"]);
  }
  return undefined;
};

const triggerTypes = (trigger: Trigger): readonly AutoRuntimeTriggerType[] =>
  trigger.type === "anyOf"
    ? trigger.triggers.flatMap(triggerTypes)
    : trigger.type === "eventCount"
      ? triggerTypes(trigger.trigger)
      : [trigger.type];

export const triggerContainsType = (
  trigger: Trigger,
  triggerType: AutoRuntimeTriggerType,
): boolean => triggerTypes(trigger).includes(triggerType);

export const autoRuntimeEntryAdaptersForBlock = (
  block: EffectBlock,
): readonly AutoRuntimeEntryAdapter[] => {
  if (block.sourcePresencePolicy === undefined) {
    return [];
  }
  const adapters = triggerTypes(block.trigger).map((triggerType) =>
    autoRuntimeEntryAdapterForTriggerType(triggerType),
  );
  return adapters.every(
    (adapter): adapter is AutoRuntimeEntryAdapter => adapter !== undefined,
  )
    ? adapters
    : [];
};

export const autoRuntimeEntryAdapterForBlock = (
  block: EffectBlock,
): AutoRuntimeEntryAdapter | undefined =>
  autoRuntimeEntryAdaptersForBlock(block)[0];
