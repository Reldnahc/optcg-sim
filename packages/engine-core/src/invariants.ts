import type { CardInstance, GameState, PlayerId } from "@optcg/types";

import {
  canonicalSerializeStateValue,
  hashCanonicalStateValue,
} from "./canonical-state.js";

export interface GameStateInvariantViolation {
  invariant: string;
  message: string;
  details?: Record<string, unknown>;
}

export class GameStateInvariantError extends Error {
  readonly violations: readonly GameStateInvariantViolation[];

  constructor(violations: readonly GameStateInvariantViolation[]) {
    const first = violations[0];
    const message =
      first === undefined
        ? "GameState invariant violation"
        : `${first.invariant}: ${first.message}`;
    super(message);
    this.name = "GameStateInvariantError";
    this.violations = violations;
  }
}

interface CardRecord {
  card: CardInstance;
  location: string;
}

const isLegalAttachedDonHost = (host: CardInstance): boolean =>
  host.zone.zone === "leaderArea" || host.zone.zone === "characterArea";

const zoneCardsForPlayer = (
  state: GameState,
  playerId: PlayerId,
): CardRecord[] => {
  const player = state.players[playerId];
  if (player === undefined) {
    return [];
  }
  const cards: CardRecord[] = [];

  for (const card of player.deck)
    cards.push({ card, location: `${playerId}.deck` });
  for (const card of player.donDeck)
    cards.push({ card, location: `${playerId}.donDeck` });
  for (const card of player.hand)
    cards.push({ card, location: `${playerId}.hand` });
  for (const card of player.trash)
    cards.push({ card, location: `${playerId}.trash` });
  cards.push({ card: player.leader, location: `${playerId}.leader` });
  for (const card of player.characters)
    cards.push({ card, location: `${playerId}.characters` });
  if (player.stage !== undefined)
    cards.push({ card: player.stage, location: `${playerId}.stage` });
  for (const card of player.costArea)
    cards.push({ card, location: `${playerId}.costArea` });
  for (const lifeCard of player.life)
    cards.push({ card: lifeCard.card, location: `${playerId}.life` });

  return cards;
};

export const collectGameStateInvariantViolations = (
  state: GameState,
): GameStateInvariantViolation[] => {
  const violations: GameStateInvariantViolation[] = [];
  const playerIds = Object.keys(state.players) as PlayerId[];
  const placedByInstance = new Map<string, CardRecord[]>();
  const attachedHostByDon = new Map<string, CardRecord[]>();

  for (const playerId of playerIds) {
    const player = state.players[playerId];
    if (player === undefined) {
      violations.push({
        invariant: "players.validPlayerRef",
        message: "player key must resolve to a player state",
        details: { playerId },
      });
      continue;
    }
    if (player.playerId !== playerId) {
      violations.push({
        invariant: "players.validPlayerRef",
        message: "player map key must match player.playerId",
        details: { playerId, value: player.playerId },
      });
    }

    const cards = zoneCardsForPlayer(state, playerId);
    for (const entry of cards) {
      const card = entry.card;
      const existing = placedByInstance.get(card.instanceId) ?? [];
      existing.push(entry);
      placedByInstance.set(card.instanceId, existing);

      if (card.zone.playerId !== playerId) {
        violations.push({
          invariant: "players.zoneOwnership",
          message: "card zone.playerId must match containing player",
          details: {
            instanceId: card.instanceId,
            zonePlayerId: card.zone.playerId,
            playerId,
          },
        });
      }
      if (card.owner !== playerId || card.controller !== playerId) {
        violations.push({
          invariant: "players.zoneController",
          message: "card owner/controller must match containing player",
          details: {
            instanceId: card.instanceId,
            owner: card.owner,
            controller: card.controller,
            playerId,
          },
        });
      }
    }

    for (const [index, lifeCard] of player.life.entries()) {
      const lifeZone = lifeCard.card.zone;
      if (
        lifeZone.zone !== "life" ||
        lifeZone.slot !== "life" ||
        lifeZone.index !== index
      ) {
        violations.push({
          invariant: "players.lifeWrapping",
          message:
            "life entries must wrap cards in life zone at matching index",
          details: {
            instanceId: lifeCard.card.instanceId,
            expectedIndex: index,
            zone: lifeZone,
          },
        });
      }
    }
  }

  for (const records of placedByInstance.values()) {
    for (const { card, location } of records) {
      for (const attachedDonId of card.attachedDon) {
        const hosts = attachedHostByDon.get(attachedDonId) ?? [];
        hosts.push({ card, location });
        attachedHostByDon.set(attachedDonId, hosts);
      }
    }
  }

  for (const [attachedDonId, hosts] of attachedHostByDon.entries()) {
    for (const host of hosts) {
      if (!isLegalAttachedDonHost(host.card)) {
        violations.push({
          invariant: "cards.attachedDonLegalHost",
          message: "attached DON!! host must be a leader or character",
          details: {
            attachedDonId,
            hostInstanceId: host.card.instanceId,
            hostZone: host.card.zone.zone,
          },
        });
      }
    }

    const placed = placedByInstance.get(attachedDonId) ?? [];
    if (placed.length !== 1) {
      violations.push({
        invariant: "cards.attachedDonExists",
        message:
          "attached DON!! must reference exactly one backing card instance",
        details: {
          attachedDonId,
          placementCount: placed.length,
          hostCount: hosts.length,
        },
      });
      continue;
    }

    const attachedRecord = placed.at(0);
    if (attachedRecord === undefined) {
      continue;
    }
    const attachedCard = attachedRecord.card;
    if (hosts.length !== 1) {
      violations.push({
        invariant: "cards.exactlyOneLocation",
        message: "attached DON!! must have exactly one host reference",
        details: { attachedDonId, hostCount: hosts.length },
      });
      continue;
    }

    for (const host of hosts) {
      if (
        attachedCard.owner !== host.card.owner ||
        attachedCard.controller !== host.card.controller
      ) {
        violations.push({
          invariant: "cards.attachedDonOwnership",
          message:
            "attached DON!! owner/controller must match the attached host",
          details: {
            attachedDonId,
            hostInstanceId: host.card.instanceId,
            hostOwner: host.card.owner,
            hostController: host.card.controller,
            attachedOwner: attachedCard.owner,
            attachedController: attachedCard.controller,
          },
        });
      }
    }
  }

  for (const [instanceId, placements] of placedByInstance.entries()) {
    const hostRefs = attachedHostByDon.get(instanceId) ?? [];
    const isAttachedDon = hostRefs.length > 0;
    const isValidAttachedDonLocation =
      isAttachedDon && placements.length === 1 && hostRefs.length === 1;
    const isValidNonAttachedLocation =
      !isAttachedDon && placements.length === 1;
    if (!isValidAttachedDonLocation && !isValidNonAttachedLocation) {
      violations.push({
        invariant: "cards.exactlyOneLocation",
        message:
          "each card instance must appear exactly once in a zone or attachment",
        details: {
          instanceId,
          placements: placements.map((placement) => placement.location),
          attachmentHosts: hostRefs.map((host) => host.card.instanceId),
        },
      });
    }
  }

  if (!Object.hasOwn(state.players, state.turn.turnPlayerId)) {
    violations.push({
      invariant: "turn.validPlayerRef",
      message: "turn.turnPlayerId must reference an existing player",
      details: { turnPlayerId: state.turn.turnPlayerId },
    });
  }

  if (!Object.hasOwn(state.turn.playerTurnCounts, state.turn.turnPlayerId)) {
    violations.push({
      invariant: "turn.validPlayerRef",
      message: "turn.playerTurnCounts must include turn.turnPlayerId",
      details: { turnPlayerId: state.turn.turnPlayerId },
    });
  }

  const turnCountKeys = Object.keys(state.turn.playerTurnCounts);
  for (const key of turnCountKeys) {
    if (!Object.hasOwn(state.players, key)) {
      violations.push({
        invariant: "turn.validPlayerRef",
        message: "turn.playerTurnCounts keys must reference existing players",
        details: { playerId: key },
      });
    }
  }

  try {
    canonicalSerializeStateValue(state);
    hashCanonicalStateValue(state);
  } catch (error) {
    violations.push({
      invariant: "state.canonicalHashable",
      message: "canonical GameState must be serializable and hashable",
      details: {
        error: error instanceof Error ? error.message : "unknown error",
      },
    });
  }

  return violations;
};

export const assertGameStateInvariants = (state: GameState): void => {
  const violations = collectGameStateInvariantViolations(state);
  if (violations.length === 0) {
    return;
  }
  throw new GameStateInvariantError(violations);
};
