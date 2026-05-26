import type {
  CardId,
  InstanceId,
  PlayerId,
  PublicCardView,
  PublicLegalAction,
} from "@optcg/types";

import type {
  ClientVisibleAction,
  MatchCardCatalog,
  MatchCardCatalogEntry,
  MatchSnapshot,
} from "./transport.js";

export interface ClientCardModel {
  instanceId: InstanceId;
  cardId: CardId;
  name: string;
  category: string;
  effectText?: string;
  triggerText?: string;
  imageUrl?: string;
  state?: PublicCardView["state"];
  attachedDonCount: number;
}

export interface ClientPlayerZonesModel {
  leader: ClientCardModel;
  hand: ClientCardModel[];
  characters: ClientCardModel[];
  stage?: ClientCardModel;
  costArea: ClientCardModel[];
  trash: ClientCardModel[];
  deckCount: number;
  donDeckCount: number;
  lifeCount: number;
}

export interface ClientActionModel {
  index: number;
  type: PublicLegalAction["type"] | "advanceToMainPhase";
  label: string;
}

export interface BoardViewModel {
  playerId: PlayerId;
  self: ClientPlayerZonesModel;
  opponent: Omit<ClientPlayerZonesModel, "hand"> & { handCount: number };
  actionsByCardInstanceId: Record<string, ClientActionModel[]>;
}

const unknownCard = (cardId: CardId): MatchCardCatalogEntry => ({
  cardId,
  name: String(cardId),
  category: "unknown",
});

const catalogEntry = (
  catalog: MatchCardCatalog,
  playerId: PlayerId,
  cardId: CardId,
): MatchCardCatalogEntry =>
  catalog.players[playerId]?.cards[cardId] ?? unknownCard(cardId);

const cardModel = (
  card: PublicCardView,
  catalog: MatchCardCatalog,
): ClientCardModel => {
  const entry = catalogEntry(catalog, card.owner, card.cardId);
  return {
    instanceId: card.instanceId,
    cardId: card.cardId,
    name: entry.name,
    category: entry.category,
    ...(entry.effectText === undefined ? {} : { effectText: entry.effectText }),
    ...(entry.triggerText === undefined
      ? {}
      : { triggerText: entry.triggerText }),
    ...(entry.imageUrl === undefined ? {} : { imageUrl: entry.imageUrl }),
    ...(card.state === undefined ? {} : { state: card.state }),
    attachedDonCount: card.attachedDonCount,
  };
};

const selfZones = (
  view: MatchSnapshot["players"][PlayerId]["view"],
  catalog: MatchCardCatalog,
): ClientPlayerZonesModel => ({
  leader: cardModel(view.self.leader, catalog),
  hand: view.self.hand.map((card) => cardModel(card, catalog)),
  characters: view.self.characters.map((card) => cardModel(card, catalog)),
  ...(view.self.stage === undefined
    ? {}
    : { stage: cardModel(view.self.stage, catalog) }),
  costArea: view.self.costArea.map((card) => cardModel(card, catalog)),
  trash: view.self.trash.map((card) => cardModel(card, catalog)),
  deckCount: view.self.deckCount,
  donDeckCount: view.self.donDeckCount,
  lifeCount: view.self.life.count,
});

const opponentZones = (
  view: MatchSnapshot["players"][PlayerId]["view"],
  catalog: MatchCardCatalog,
): BoardViewModel["opponent"] => ({
  leader: cardModel(view.opponent.leader, catalog),
  characters: view.opponent.characters.map((card) => cardModel(card, catalog)),
  ...(view.opponent.stage === undefined
    ? {}
    : { stage: cardModel(view.opponent.stage, catalog) }),
  costArea: view.opponent.costArea.map((card) => cardModel(card, catalog)),
  trash: view.opponent.trash.map((card) => cardModel(card, catalog)),
  deckCount: view.opponent.deckCount,
  donDeckCount: view.opponent.donDeckCount,
  lifeCount: view.opponent.life.count,
  handCount: view.opponent.handCount,
});

const addAction = (
  actions: Record<string, ClientActionModel[]>,
  instanceId: InstanceId,
  action: ClientVisibleAction,
): void => {
  const key = String(instanceId);
  const current = actions[key] ?? [];
  current.push({ index: action.index, type: action.type, label: action.label });
  actions[key] = current;
};

const actionMenusByCard = (
  actions: readonly ClientVisibleAction[],
): Record<string, ClientActionModel[]> => {
  const byCard: Record<string, ClientActionModel[]> = {};
  for (const action of actions) {
    if (action.placement !== undefined) {
      addAction(byCard, action.placement.instanceId, action);
    }
    if (action.attachment !== undefined) {
      addAction(byCard, action.attachment.targetInstanceId, action);
    }
  }
  return byCard;
};

export const createBoardViewModel = ({
  snapshot,
  catalog,
  playerId,
}: {
  snapshot: MatchSnapshot;
  catalog: MatchCardCatalog;
  playerId: PlayerId;
}): BoardViewModel => {
  const player = snapshot.players[playerId];
  if (player === undefined) {
    throw new Error(
      `Player ${String(playerId)} is not present in the snapshot.`,
    );
  }
  return {
    playerId,
    self: selfZones(player.view, catalog),
    opponent: opponentZones(player.view, catalog),
    actionsByCardInstanceId: actionMenusByCard(player.actions),
  };
};
