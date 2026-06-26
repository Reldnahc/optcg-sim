import type {
  CardId,
  EffectTextSourceMap,
  InstanceId,
  Keyword,
  PlayerId,
  PlayerView,
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
  effectTextSourceMap?: EffectTextSourceMap;
  triggerTextSourceMap?: EffectTextSourceMap;
  imageUrl?: string;
  printedPower?: number;
  currentPower?: number;
  powerDelta?: number;
  printedCost?: number;
  currentCost?: number;
  costDelta?: number;
  counter?: number;
  attributes?: string[];
  types?: string[];
  keywords?: Keyword[];
  restrictions?: string[];
  effectsInvalidated?: boolean;
  freshlyPlayedAttackRestricted?: boolean;
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
  deckCards?: ClientCardModel[];
  donDeckCount: number;
  donDeckCards?: ClientCardModel[];
  lifeCount: number;
  lifeCards: ClientCardModel[];
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
  responseKey?: string;
  decisionPayment?: ClientVisibleAction["decisionPayment"];
  attack?: ClientVisibleAction["attack"];
  counter?: ClientVisibleAction["counter"];
  attachment?: ClientVisibleAction["attachment"];
}

export interface StatusBannerModel {
  label: string;
  tone: "self" | "opponent" | "block" | "counter";
  turnNumber: number;
}

export interface BoardViewModel {
  playerId: PlayerId;
  selfLabel: string;
  opponentLabel: string;
  statusBanner?: StatusBannerModel;
  selfTimer?: PlayerSummaryTimerModel;
  opponentTimer?: PlayerSummaryTimerModel;
  selfIsTurnPlayer: boolean;
  opponentIsTurnPlayer: boolean;
  selfConnectionStatus?: "connected" | "disconnected";
  opponentConnectionStatus?: "connected" | "disconnected";
  selfRestrictions?: string[];
  opponentRestrictions?: string[];
  self: ClientPlayerZonesModel;
  opponent: Omit<ClientPlayerZonesModel, "hand"> & {
    hand?: ClientCardModel[];
    handCount: number;
  };
  actionsByCardInstanceId: Record<string, ClientActionModel[]>;
  activeCardInstanceIds?: readonly string[] | undefined;
  battleArrow?: {
    attackerInstanceId: string;
    attackPower?: number;
    defendPower?: number;
    opponentPower?: number;
    selfPower?: number;
    targetInstanceId: string;
  };
}

export interface PlayerSummaryTimerModel {
  game: string;
  isRunning: boolean;
  disconnect?: string;
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
  instanceId: InstanceId,
): MatchCardCatalogEntry =>
  catalog.players[playerId]?.instances?.[instanceId] ??
  catalog.players[playerId]?.cards[cardId] ??
  unknownCard(cardId);

const cardModel = (
  card: PublicCardView,
  catalog: MatchCardCatalog,
  options: {
    includeState?: boolean;
    freshlyPlayedAttackRestricted?: boolean;
  } = {},
): ClientCardModel => {
  const entry = catalogEntry(catalog, card.owner, card.cardId, card.instanceId);
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
    ...(entry.effectTextSourceMap === undefined
      ? {}
      : { effectTextSourceMap: entry.effectTextSourceMap }),
    ...(entry.triggerTextSourceMap === undefined
      ? {}
      : { triggerTextSourceMap: entry.triggerTextSourceMap }),
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
    ...(entry.counter === undefined ? {} : { counter: entry.counter }),
    ...(entry.attributes === undefined || entry.attributes.length === 0
      ? {}
      : { attributes: [...entry.attributes] }),
    ...(entry.types === undefined || entry.types.length === 0
      ? {}
      : { types: [...entry.types] }),
    ...(card.keywords === undefined || card.keywords.length === 0
      ? {}
      : { keywords: [...card.keywords] }),
    ...(card.restrictions === undefined || card.restrictions.length === 0
      ? {}
      : { restrictions: [...card.restrictions] }),
    ...(card.effectsInvalidated === true ? { effectsInvalidated: true } : {}),
    ...(options.freshlyPlayedAttackRestricted === true
      ? { freshlyPlayedAttackRestricted: true }
      : {}),
    attachedDonCount: card.attachedDonCount,
    attachedDonCards: [],
  };
};

const hasRushKeyword = (card: PublicCardView): boolean =>
  card.keywords?.includes("rush") === true ||
  card.keywords?.includes("rushCharacter") === true;

const freshlyPlayedAttackRestricted = (
  card: PublicCardView,
  turn: PlayerView["turn"],
): boolean =>
  card.zone.zone === "characterArea" &&
  card.controller === turn.turnPlayerId &&
  turn.phase === "main" &&
  card.turnPlayed === turn.globalTurn &&
  !hasRushKeyword(card);

const attachedDonIdsFor = (card: PublicCardView): readonly InstanceId[] =>
  (card as LegacyPublicCardView).attachedDonIds ?? [];

const attachedDonIdSet = (cards: readonly PublicCardView[]): Set<InstanceId> =>
  new Set(cards.flatMap((card) => attachedDonIdsFor(card)));

const attachDonCards = (
  card: PublicCardView,
  catalog: MatchCardCatalog,
  costAreaById: ReadonlyMap<InstanceId, ClientCardModel>,
  freshlyPlayedAttackRestrictedFlag = false,
): ClientCardModel => ({
  ...cardModel(card, catalog, {
    freshlyPlayedAttackRestricted: freshlyPlayedAttackRestrictedFlag,
  }),
  attachedDonCards: attachedDonIdsFor(card).flatMap((id) => {
    const donCard = costAreaById.get(id);
    return donCard === undefined ? [] : [donCard];
  }),
});

const hiddenLifeCard = (prefix: string, index: number): ClientCardModel => ({
  instanceId: `${prefix}-${String(index)}` as InstanceId,
  cardId: "hidden" as CardId,
  name: "Hidden card",
  category: "hidden",
  attachedDonCount: 0,
  attachedDonCards: [],
});

const lifeCards = (
  life: MatchSnapshot["players"][PlayerId]["view"]["self"]["life"],
  catalog: MatchCardCatalog,
  prefix: string,
): ClientCardModel[] => {
  const faceUpByIndex = new Map(
    life.faceUpCards.flatMap((card) => {
      const index = card.zone.index;
      return typeof index === "number"
        ? ([[index, cardModel(card, catalog)]] as const)
        : [];
    }),
  );
  return Array.from(
    { length: Math.min(life.count, 10) },
    (_, index) => faceUpByIndex.get(index) ?? hiddenLifeCard(prefix, index),
  );
};

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
      attachDonCards(
        card,
        catalog,
        costAreaById,
        freshlyPlayedAttackRestricted(card, view.turn),
      ),
    ),
    ...(view.self.stage === undefined
      ? {}
      : { stage: attachDonCards(view.self.stage, catalog, costAreaById) }),
    costArea: costArea.filter((card) => !attachedIds.has(card.instanceId)),
    trash: view.self.trash.map((card) =>
      cardModel(card, catalog, { includeState: false }),
    ),
    deckCount: view.self.deckCount,
    ...(view.self.deck === undefined
      ? {}
      : { deckCards: view.self.deck.map((card) => cardModel(card, catalog)) }),
    donDeckCount: view.self.donDeckCount,
    ...(view.self.donDeck === undefined
      ? {}
      : {
          donDeckCards: view.self.donDeck.map((card) =>
            cardModel(card, catalog),
          ),
        }),
    lifeCount: view.self.life.count,
    lifeCards: lifeCards(view.self.life, catalog, "hidden-life-self"),
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
      attachDonCards(
        card,
        catalog,
        costAreaById,
        freshlyPlayedAttackRestricted(card, view.turn),
      ),
    ),
    ...(view.opponent.stage === undefined
      ? {}
      : { stage: attachDonCards(view.opponent.stage, catalog, costAreaById) }),
    costArea: costArea.filter((card) => !attachedIds.has(card.instanceId)),
    trash: view.opponent.trash.map((card) =>
      cardModel(card, catalog, { includeState: false }),
    ),
    deckCount: view.opponent.deckCount,
    ...(view.opponent.deck === undefined
      ? {}
      : {
          deckCards: view.opponent.deck.map((card) => cardModel(card, catalog)),
        }),
    donDeckCount: view.opponent.donDeckCount,
    ...(view.opponent.donDeck === undefined
      ? {}
      : {
          donDeckCards: view.opponent.donDeck.map((card) =>
            cardModel(card, catalog),
          ),
        }),
    lifeCount: view.opponent.life.count,
    lifeCards: lifeCards(view.opponent.life, catalog, "hidden-life-opponent"),
    handCount: view.opponent.handCount,
    ...(view.opponent.hand === undefined
      ? {}
      : { hand: view.opponent.hand.map((card) => cardModel(card, catalog)) }),
  };
};

const visibleBoardCards = (
  view: MatchSnapshot["players"][PlayerId]["view"],
): PublicCardView[] => [
  view.self.leader,
  ...view.self.characters,
  ...(view.self.stage === undefined ? [] : [view.self.stage]),
  view.opponent.leader,
  ...view.opponent.characters,
  ...(view.opponent.stage === undefined ? [] : [view.opponent.stage]),
];

const currentPowerForInstance = (
  view: MatchSnapshot["players"][PlayerId]["view"],
  instanceId: InstanceId,
): number | undefined =>
  visibleBoardCards(view).find((card) => card.instanceId === instanceId)
    ?.currentPower;

const battleArrowForView = (
  view: MatchSnapshot["players"][PlayerId]["view"],
  playerId: PlayerId,
): BoardViewModel["battleArrow"] | undefined => {
  if (view.battle === undefined) {
    return undefined;
  }

  const attackPower = currentPowerForInstance(
    view,
    view.battle.attacker.instanceId,
  );
  const defendPower = currentPowerForInstance(
    view,
    view.battle.currentTarget.instanceId,
  );
  const selfPower =
    view.battle.attacker.playerId === playerId ? attackPower : defendPower;
  const opponentPower =
    view.battle.attacker.playerId === playerId ? defendPower : attackPower;
  return {
    attackerInstanceId: String(view.battle.attacker.instanceId),
    ...(attackPower === undefined ? {} : { attackPower }),
    ...(defendPower === undefined ? {} : { defendPower }),
    ...(opponentPower === undefined ? {} : { opponentPower }),
    ...(selfPower === undefined ? {} : { selfPower }),
    targetInstanceId: String(view.battle.currentTarget.instanceId),
  };
};

const statusBannerForView = (
  view: MatchSnapshot["players"][PlayerId]["view"],
  playerId: PlayerId,
): StatusBannerModel | undefined => {
  const turnNumber = view.turn.globalTurn;
  if (view.battle?.step === "block") {
    return { label: "Blocker Step", tone: "block", turnNumber };
  }
  if (view.battle?.step === "counter") {
    return { label: "Counter Step", tone: "counter", turnNumber };
  }
  if (view.self.life.count === 0 || view.opponent.life.count === 0) {
    return undefined;
  }
  return view.turn.turnPlayerId === playerId
    ? { label: "Your Turn", tone: "self", turnNumber }
    : { label: "Opponent's Turn", tone: "opponent", turnNumber };
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
    ...(action.responseKey === undefined
      ? {}
      : { responseKey: action.responseKey }),
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

const playerDisplayLabel = (
  snapshot: MatchSnapshot,
  playerId: PlayerId,
  fallback: string,
): string => {
  const displayName = snapshot.playerLabels?.[playerId]?.displayName?.trim();
  return displayName === undefined || displayName.length === 0
    ? fallback
    : displayName;
};

const playerConnectionStatus = (
  snapshot: MatchSnapshot,
  playerId: PlayerId,
): "connected" | "disconnected" | undefined =>
  snapshot.playerLabels?.[playerId]?.connectionStatus;

const formatTimer = (remainingMs: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes)}:${String(seconds).padStart(2, "0")}`;
};

const playerTimer = (
  view: PlayerView,
  playerId: PlayerId,
): PlayerSummaryTimerModel | undefined => {
  const timer = view.timers.players[playerId];
  if (timer === undefined) {
    return undefined;
  }
  const disconnect = view.timers.disconnects?.[playerId];
  return {
    game: formatTimer(timer.remainingMs),
    isRunning: timer.isRunning,
    ...(disconnect === undefined
      ? {}
      : { disconnect: formatTimer(disconnect.remainingMs) }),
  };
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
  const selfConnectionStatus = playerConnectionStatus(snapshot, playerId);
  const opponentConnectionStatus = playerConnectionStatus(
    snapshot,
    player.view.opponent.playerId,
  );
  const selfTimer = playerTimer(player.view, playerId);
  const opponentTimer = playerTimer(player.view, player.view.opponent.playerId);
  const activeFieldPlayerId =
    player.view.timers.activePlayerId ?? player.view.turn.turnPlayerId;
  const battleArrow = battleArrowForView(player.view, playerId);
  const statusBanner = statusBannerForView(player.view, playerId);
  return {
    playerId,
    selfLabel: playerDisplayLabel(snapshot, playerId, "Player"),
    ...(statusBanner === undefined ? {} : { statusBanner }),
    ...(selfTimer === undefined ? {} : { selfTimer }),
    selfIsTurnPlayer: activeFieldPlayerId === playerId,
    ...(selfConnectionStatus === undefined ? {} : { selfConnectionStatus }),
    ...(player.view.self.restrictions === undefined ||
    player.view.self.restrictions.length === 0
      ? {}
      : { selfRestrictions: [...player.view.self.restrictions] }),
    opponentLabel: playerDisplayLabel(
      snapshot,
      player.view.opponent.playerId,
      "Opponent",
    ),
    ...(opponentTimer === undefined ? {} : { opponentTimer }),
    opponentIsTurnPlayer: activeFieldPlayerId === player.view.opponent.playerId,
    ...(opponentConnectionStatus === undefined
      ? {}
      : { opponentConnectionStatus }),
    ...(player.view.opponent.restrictions === undefined ||
    player.view.opponent.restrictions.length === 0
      ? {}
      : { opponentRestrictions: [...player.view.opponent.restrictions] }),
    self: selfZones(player.view, catalog),
    opponent: opponentZones(player.view, catalog),
    actionsByCardInstanceId: actionMenusByCard(player.actions),
    activeCardInstanceIds: [...activeCardInstanceIds],
    ...(battleArrow === undefined ? {} : { battleArrow }),
  };
};
