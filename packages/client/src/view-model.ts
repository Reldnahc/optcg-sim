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
  printedPower?: number;
  currentPower?: number;
  powerDelta?: number;
  printedCost?: number;
  currentCost?: number;
  costDelta?: number;
  state?: PublicCardView["state"];
  attachedDonCount: number;
  attachedDonCards: ClientCardModel[];
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
  type:
    | PublicLegalAction["type"]
    | "advanceToMainPhase"
    | "chooseAttackTarget"
    | "chooseCounterTarget"
    | "confirmDecisionSelection"
    | "clearDecisionSelection"
    | "chooseNoDecisionCards";
  label: string;
  decisionPayment?: ClientVisibleAction["decisionPayment"];
  attack?: ClientVisibleAction["attack"];
  counter?: ClientVisibleAction["counter"];
}

export interface BoardViewModel {
  playerId: PlayerId;
  self: ClientPlayerZonesModel;
  opponent: Omit<ClientPlayerZonesModel, "hand"> & { handCount: number };
  actionsByCardInstanceId: Record<string, ClientActionModel[]>;
  activeCardInstanceIds?: readonly string[] | undefined;
  battleArrow?: {
    attackerInstanceId: string;
    targetInstanceId: string;
  };
}

type LegacyPublicCardView = Omit<PublicCardView, "attachedDonIds"> & {
  attachedDonIds?: InstanceId[];
};

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
  options: { includeState?: boolean } = {},
): ClientCardModel => {
  const entry = catalogEntry(catalog, card.owner, card.cardId);
  const printedPower = card.printedPower ?? entry.power;
  const printedCost = card.printedCost ?? entry.cost;
  const powerDelta =
    printedPower === undefined ||
    card.currentPower === undefined ||
    printedPower === card.currentPower
      ? undefined
      : card.currentPower - printedPower;
  const costDelta =
    printedCost === undefined ||
    card.currentCost === undefined ||
    printedCost === card.currentCost
      ? undefined
      : card.currentCost - printedCost;
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
    ...(options.includeState === false || card.state === undefined
      ? {}
      : { state: card.state }),
    ...(printedPower === undefined ? {} : { printedPower }),
    ...(card.currentPower === undefined
      ? {}
      : { currentPower: card.currentPower }),
    ...(powerDelta === undefined ? {} : { powerDelta }),
    ...(printedCost === undefined ? {} : { printedCost }),
    ...(card.currentCost === undefined
      ? {}
      : { currentCost: card.currentCost }),
    ...(costDelta === undefined ? {} : { costDelta }),
    attachedDonCount: card.attachedDonCount,
    attachedDonCards: [],
  };
};

const attachedDonIdsFor = (card: PublicCardView): readonly InstanceId[] =>
  (card as LegacyPublicCardView).attachedDonIds ?? [];

const attachedDonIdSet = (cards: readonly PublicCardView[]): Set<InstanceId> =>
  new Set(cards.flatMap((card) => attachedDonIdsFor(card)));

const attachDonCards = (
  card: PublicCardView,
  catalog: MatchCardCatalog,
  costAreaById: ReadonlyMap<InstanceId, ClientCardModel>,
): ClientCardModel => ({
  ...cardModel(card, catalog),
  attachedDonCards: attachedDonIdsFor(card).flatMap((id) => {
    const donCard = costAreaById.get(id);
    return donCard === undefined ? [] : [donCard];
  }),
});

const selfZones = (
  view: MatchSnapshot["players"][PlayerId]["view"],
  catalog: MatchCardCatalog,
): ClientPlayerZonesModel => {
  const costArea = view.self.costArea.map((card) => cardModel(card, catalog));
  const costAreaById = new Map(
    costArea.map((card) => [card.instanceId, card] as const),
  );
  const boardCards = [
    view.self.leader,
    ...view.self.characters,
    ...(view.self.stage === undefined ? [] : [view.self.stage]),
  ];
  const attachedIds = attachedDonIdSet(boardCards);
  return {
    leader: attachDonCards(view.self.leader, catalog, costAreaById),
    hand: view.self.hand.map((card) => cardModel(card, catalog)),
    characters: view.self.characters.map((card) =>
      attachDonCards(card, catalog, costAreaById),
    ),
    ...(view.self.stage === undefined
      ? {}
      : { stage: attachDonCards(view.self.stage, catalog, costAreaById) }),
    costArea: costArea.filter((card) => !attachedIds.has(card.instanceId)),
    trash: view.self.trash.map((card) =>
      cardModel(card, catalog, { includeState: false }),
    ),
    deckCount: view.self.deckCount,
    donDeckCount: view.self.donDeckCount,
    lifeCount: view.self.life.count,
  };
};

const opponentZones = (
  view: MatchSnapshot["players"][PlayerId]["view"],
  catalog: MatchCardCatalog,
): BoardViewModel["opponent"] => {
  const costArea = view.opponent.costArea.map((card) =>
    cardModel(card, catalog),
  );
  const costAreaById = new Map(
    costArea.map((card) => [card.instanceId, card] as const),
  );
  const boardCards = [
    view.opponent.leader,
    ...view.opponent.characters,
    ...(view.opponent.stage === undefined ? [] : [view.opponent.stage]),
  ];
  const attachedIds = attachedDonIdSet(boardCards);
  return {
    leader: attachDonCards(view.opponent.leader, catalog, costAreaById),
    characters: view.opponent.characters.map((card) =>
      attachDonCards(card, catalog, costAreaById),
    ),
    ...(view.opponent.stage === undefined
      ? {}
      : { stage: attachDonCards(view.opponent.stage, catalog, costAreaById) }),
    costArea: costArea.filter((card) => !attachedIds.has(card.instanceId)),
    trash: view.opponent.trash.map((card) =>
      cardModel(card, catalog, { includeState: false }),
    ),
    deckCount: view.opponent.deckCount,
    donDeckCount: view.opponent.donDeckCount,
    lifeCount: view.opponent.life.count,
    handCount: view.opponent.handCount,
  };
};

const addAction = (
  actions: Record<string, ClientActionModel[]>,
  instanceId: InstanceId,
  action: ClientVisibleAction,
): void => {
  const key = String(instanceId);
  const current = actions[key] ?? [];
  current.push({
    index: action.index,
    type: action.type,
    label: action.label,
    ...(action.decisionPayment === undefined
      ? {}
      : { decisionPayment: action.decisionPayment }),
    ...(action.attack === undefined ? {} : { attack: action.attack }),
    ...(action.counter === undefined ? {} : { counter: action.counter }),
  });
  actions[key] = current;
};

const actionMenusByCard = (
  actions: readonly ClientVisibleAction[],
): Record<string, ClientActionModel[]> => {
  const byCard: Record<string, ClientActionModel[]> = {};
  for (const action of actions) {
    if (action.attachment !== undefined) {
      continue;
    }
    if (action.placement !== undefined) {
      addAction(byCard, action.placement.instanceId, action);
    }
  }
  return byCard;
};

export const createBoardViewModel = ({
  snapshot,
  catalog,
  playerId,
  activeCardInstanceIds = [],
}: {
  snapshot: MatchSnapshot;
  catalog: MatchCardCatalog;
  playerId: PlayerId;
  activeCardInstanceIds?: readonly string[] | undefined;
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
    activeCardInstanceIds: [...activeCardInstanceIds],
    ...(player.view.battle === undefined
      ? {}
      : {
          battleArrow: {
            attackerInstanceId: String(player.view.battle.attacker.instanceId),
            targetInstanceId: String(
              player.view.battle.currentTarget.instanceId,
            ),
          },
        }),
  };
};
