import type { CardInstance, PlayerId, PlayerState } from "@optcg/types";

import { reindexZoneCards } from "../../action-state.js";

type DonHost = { kind: "leader" } | { kind: "character"; index: number };

const buildAttachedDonHostMap = (
  player: PlayerState,
): Map<CardInstance["instanceId"], DonHost> => {
  const hostMap = new Map<CardInstance["instanceId"], DonHost>();
  for (const donId of player.leader.attachedDon) {
    hostMap.set(donId, { kind: "leader" });
  }
  for (let index = 0; index < player.characters.length; index += 1) {
    const character = player.characters[index];
    if (character === undefined) {
      continue;
    }
    for (const donId of character.attachedDon) {
      hostMap.set(donId, { kind: "character", index });
    }
  }
  return hostMap;
};

const isCostAreaDonEligible = (
  card: CardInstance,
  playerId: PlayerId,
  attachedHostMap: Map<CardInstance["instanceId"], DonHost>,
): boolean =>
  card.owner === playerId &&
  card.controller === playerId &&
  (card.state === "active" ||
    card.state === "rested" ||
    attachedHostMap.has(card.instanceId));

export const getReturnDonEligibleInstanceIds = (
  player: PlayerState,
): CardInstance["instanceId"][] => {
  const attachedHostMap = buildAttachedDonHostMap(player);
  return player.costArea
    .filter((card) =>
      isCostAreaDonEligible(card, player.playerId, attachedHostMap),
    )
    .map((card) => card.instanceId);
};

export const getReturnDonEligibleCount = (player: PlayerState): number =>
  getReturnDonEligibleInstanceIds(player).length;

export const applyReturnDonPayment = (params: {
  player: PlayerState;
  playerId: PlayerId;
  selectedDonIds: readonly CardInstance["instanceId"][];
}): PlayerState | null => {
  const { player, playerId, selectedDonIds } = params;
  const attachedHostMap = buildAttachedDonHostMap(player);
  const selectedSet = new Set(selectedDonIds);
  const eligibleIds = new Set(getReturnDonEligibleInstanceIds(player));
  for (const selectedId of selectedSet) {
    if (!eligibleIds.has(selectedId)) {
      return null;
    }
  }

  const returnedCards = player.costArea.filter((card) =>
    selectedSet.has(card.instanceId),
  );
  if (returnedCards.length !== selectedSet.size) {
    return null;
  }

  const nextCostArea = reindexZoneCards(
    player.costArea.filter((card) => !selectedSet.has(card.instanceId)),
    "costArea",
    playerId,
    "cost",
  );

  const nextLeader = {
    ...player.leader,
    attachedDon: player.leader.attachedDon.filter(
      (donId) => !selectedSet.has(donId),
    ),
  };
  const nextCharacters = player.characters.map((character) => {
    if (character.attachedDon.length === 0) {
      return character;
    }
    const shouldTrim = character.attachedDon.some((donId) =>
      selectedSet.has(donId),
    );
    if (!shouldTrim) {
      return character;
    }
    return {
      ...character,
      attachedDon: character.attachedDon.filter(
        (donId) => !selectedSet.has(donId),
      ),
    };
  });

  // Fail closed if any selected attached DON was not actually attached to leader/characters.
  for (const selectedId of selectedSet) {
    const selectedCard = returnedCards.find(
      (card) => card.instanceId === selectedId,
    );
    if (selectedCard === undefined) {
      return null;
    }
    if (selectedCard.state === undefined && !attachedHostMap.has(selectedId)) {
      return null;
    }
  }

  const nextDonDeck = [
    ...player.donDeck,
    ...returnedCards.map((card, index) => {
      const cardWithoutState = { ...card } as typeof card & {
        state?: "active" | "rested";
      };
      delete cardWithoutState.state;
      return {
        ...cardWithoutState,
        zone: {
          zone: "donDeck" as const,
          playerId,
          slot: "donDeck" as const,
          index: player.donDeck.length + index,
        },
      };
    }),
  ];

  return {
    ...player,
    leader: nextLeader,
    characters: nextCharacters,
    costArea: nextCostArea,
    donDeck: nextDonDeck,
  };
};
