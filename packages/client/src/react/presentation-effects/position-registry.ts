import type { BoardViewModel, ClientCardModel } from "../../view-model.js";
import type {
  PresentationSnapshot,
  PresentationZoneKey,
} from "./movement-planner.js";

const addCard = (
  cards: Map<string, ClientCardModel>,
  card: ClientCardModel | undefined,
): void => {
  if (card === undefined) {
    return;
  }
  cards.set(String(card.instanceId), card);
};

const addCards = (
  cards: Map<string, ClientCardModel>,
  zoneCards: readonly ClientCardModel[],
): void => {
  for (const card of zoneCards) {
    addCard(cards, card);
  }
};

export const boardCardMap = (
  board: BoardViewModel,
): Map<string, ClientCardModel> => {
  const cards = new Map<string, ClientCardModel>();
  addCard(cards, board.self.leader);
  addCards(cards, board.self.hand);
  addCards(cards, board.self.characters);
  addCard(cards, board.self.stage);
  addCards(cards, board.self.costArea);
  addCards(cards, board.self.trash);
  addCards(cards, board.self.lifeCards);
  addCard(cards, board.opponent.leader);
  addCards(cards, board.opponent.characters);
  addCard(cards, board.opponent.stage);
  addCards(cards, board.opponent.costArea);
  addCards(cards, board.opponent.trash);
  addCards(cards, board.opponent.lifeCards);
  return cards;
};

const presentationZoneKeyFromElement = (
  element: Element,
): PresentationZoneKey | undefined => {
  const zoneElement = element.closest<HTMLElement>("[data-presentation-zone]");
  const zoneKey = zoneElement?.dataset["presentationZone"];
  return zoneKey === undefined ? undefined : (zoneKey as PresentationZoneKey);
};

export const collectPresentationSnapshot = (
  root: HTMLElement,
  board: BoardViewModel,
): PresentationSnapshot => {
  const cardModels = boardCardMap(board);
  const cards: PresentationSnapshot["cards"] = {};
  const zones: PresentationSnapshot["zones"] = {};

  for (const zoneElement of root.querySelectorAll<HTMLElement>(
    "[data-presentation-zone]",
  )) {
    const zoneKey = zoneElement.dataset["presentationZone"];
    if (zoneKey === undefined) {
      continue;
    }
    zones[zoneKey] = {
      zoneKey: zoneKey as PresentationZoneKey,
      rect: zoneElement.getBoundingClientRect(),
    };
  }

  for (const cardElement of root.querySelectorAll<HTMLElement>(
    "[data-card-instance-id]",
  )) {
    const instanceId = cardElement.dataset["cardInstanceId"];
    if (instanceId === undefined) {
      continue;
    }
    const card = cardModels.get(instanceId);
    if (card === undefined) {
      continue;
    }
    cards[instanceId] = {
      card,
      rect: cardElement.getBoundingClientRect(),
      zoneKey: presentationZoneKeyFromElement(cardElement),
    };
  }

  return { cards, zones };
};
