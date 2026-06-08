import type {
  CardInstance,
  CardRef,
  GameState,
  PlayerId,
  ReplacementProcess,
} from "@optcg/types";

import {
  fieldRemovalProcessTargets,
  withFieldRemovalProcessTargets,
} from "../field-removal-targets.js";
import type { LocatedKoTarget } from "./types.js";

const findKoTargetByInstanceId = (
  state: GameState,
  instanceId: CardInstance["instanceId"],
): LocatedKoTarget | null => {
  for (const [playerId, player] of Object.entries(state.players) as [
    PlayerId,
    GameState["players"][PlayerId],
  ][]) {
    const card = player.characters.find(
      (candidate) => candidate.instanceId === instanceId,
    );
    if (card !== undefined) {
      return { playerId, card };
    }
    if (player.stage?.instanceId === instanceId) {
      return { playerId, card: player.stage };
    }
  }
  return null;
};

export const normalizeSelectedTargetKoProcess = (
  state: GameState,
  process: ReplacementProcess,
): ReplacementProcess => {
  if (process.type !== "ko" && process.type !== "moveZone") {
    return process;
  }
  const currentTargets: CardRef[] = [];
  for (const target of fieldRemovalProcessTargets(process)) {
    const located = findKoTargetByInstanceId(state, target.instanceId);
    if (located === null) {
      continue;
    }
    currentTargets.push({
      instanceId: located.card.instanceId,
      cardId: located.card.cardId,
      playerId: located.playerId,
      zone: located.card.zone,
    });
  }
  return currentTargets.length === 0
    ? process
    : withFieldRemovalProcessTargets(process, currentTargets);
};

export const normalizeFieldRemovalProcess = normalizeSelectedTargetKoProcess;
