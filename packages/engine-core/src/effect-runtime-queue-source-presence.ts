import type {
  CardInstance,
  EffectQueueEntry,
  GameState,
  PlayerState,
  SourcePresencePolicy,
  ZoneRef,
} from "@optcg/types";

export type QueueSourcePresenceFailureReason =
  | "missingExpectedSourceZone"
  | "liveSourceNotFound"
  | "liveSourceIdentityMismatch"
  | "liveSourceNotInExpectedZone"
  | "snapshotInstanceMismatch"
  | "snapshotCardMismatch"
  | "snapshotControllerMismatch";

export type QueueSourcePresenceEvaluation =
  | {
      ok: true;
      policy: SourcePresencePolicy;
      sourcePresence: "present";
      sourceBasis: "liveZone";
    }
  | {
      ok: true;
      policy: SourcePresencePolicy;
      sourcePresence: "absent";
      sourceBasis: "lastKnownInformation" | "notRequired";
    }
  | {
      ok: false;
      policy: SourcePresencePolicy;
      sourcePresence: "failClosed";
      reason: QueueSourcePresenceFailureReason;
    };

const playerCards = (player: PlayerState): CardInstance[] => {
  const cards = [
    player.leader,
    ...player.characters,
    ...player.hand,
    ...player.deck,
    ...player.trash,
    ...player.costArea,
    ...player.donDeck,
    ...player.life.map((lifeCard) => lifeCard.card),
  ];
  if (player.stage !== undefined) {
    cards.push(player.stage);
  }
  return cards;
};

const findLiveSource = (
  state: GameState,
  entry: EffectQueueEntry,
): CardInstance | undefined => {
  const player = state.players[entry.source.playerId];
  if (player === undefined) {
    return undefined;
  }
  return playerCards(player).find(
    (card) => card.instanceId === entry.source.instanceId,
  );
};

const zonesMatch = (actual: ZoneRef, expected: ZoneRef): boolean =>
  actual.zone === expected.zone &&
  actual.playerId === expected.playerId &&
  actual.slot === expected.slot &&
  actual.index === expected.index;

const evaluateLiveZonePresence = (
  state: GameState,
  entry: EffectQueueEntry,
): QueueSourcePresenceEvaluation => {
  const expectedZone = entry.source.zone;
  if (expectedZone === undefined) {
    return {
      ok: false,
      policy: entry.sourcePresencePolicy,
      sourcePresence: "failClosed",
      reason: "missingExpectedSourceZone",
    };
  }

  const liveSource = findLiveSource(state, entry);
  if (liveSource === undefined) {
    return {
      ok: false,
      policy: entry.sourcePresencePolicy,
      sourcePresence: "failClosed",
      reason: "liveSourceNotFound",
    };
  }
  if (liveSource.cardId !== entry.source.cardId) {
    return {
      ok: false,
      policy: entry.sourcePresencePolicy,
      sourcePresence: "failClosed",
      reason: "liveSourceIdentityMismatch",
    };
  }
  if (liveSource.controller !== entry.source.playerId) {
    return {
      ok: false,
      policy: entry.sourcePresencePolicy,
      sourcePresence: "failClosed",
      reason: "liveSourceIdentityMismatch",
    };
  }
  if (!zonesMatch(liveSource.zone, expectedZone)) {
    return {
      ok: false,
      policy: entry.sourcePresencePolicy,
      sourcePresence: "failClosed",
      reason: "liveSourceNotInExpectedZone",
    };
  }
  return {
    ok: true,
    policy: entry.sourcePresencePolicy,
    sourcePresence: "present",
    sourceBasis: "liveZone",
  };
};

const evaluateLastKnownInformation = (
  entry: EffectQueueEntry,
): QueueSourcePresenceEvaluation => {
  if (entry.sourceSnapshot.instanceId !== entry.source.instanceId) {
    return {
      ok: false,
      policy: entry.sourcePresencePolicy,
      sourcePresence: "failClosed",
      reason: "snapshotInstanceMismatch",
    };
  }
  if (entry.sourceSnapshot.cardId !== entry.source.cardId) {
    return {
      ok: false,
      policy: entry.sourcePresencePolicy,
      sourcePresence: "failClosed",
      reason: "snapshotCardMismatch",
    };
  }
  if (entry.sourceSnapshot.controllerId !== entry.source.playerId) {
    return {
      ok: false,
      policy: entry.sourcePresencePolicy,
      sourcePresence: "failClosed",
      reason: "snapshotControllerMismatch",
    };
  }
  return {
    ok: true,
    policy: entry.sourcePresencePolicy,
    sourcePresence: "absent",
    sourceBasis: "lastKnownInformation",
  };
};

export const evaluateQueuedEffectSourcePresence = (
  state: GameState,
  entry: EffectQueueEntry,
): QueueSourcePresenceEvaluation => {
  switch (entry.sourcePresencePolicy) {
    case "mustRemainInSameZone":
    case "resolveFromDestinationZone":
      return evaluateLiveZonePresence(state, entry);
    case "resolveFromLastKnownInformation":
      return evaluateLastKnownInformation(entry);
    case "noSourceRequired":
      return {
        ok: true,
        policy: entry.sourcePresencePolicy,
        sourcePresence: "absent",
        sourceBasis: "notRequired",
      };
    default: {
      const exhaustive: never = entry.sourcePresencePolicy;
      return exhaustive;
    }
  }
};
