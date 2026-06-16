import type { BoardViewModel, ClientCardModel } from "../../view-model.js";
import type {
  PresentationSnapshot,
  PresentationZoneKey,
} from "./movement-planner.js";

const addCardWithAttachedDon = (
  cards: Map<string, ClientCardModel>,
  card: ClientCardModel | undefined,
): void => {
  if (card === undefined) {
    return;
  }
  cards.set(String(card.instanceId), card);
  for (const attachedDon of card.attachedDonCards) {
    cards.set(String(attachedDon.instanceId), attachedDon);
  }
};

const addCardsWithAttachedDon = (
  cards: Map<string, ClientCardModel>,
  zoneCards: readonly ClientCardModel[],
): void => {
  for (const card of zoneCards) {
    addCardWithAttachedDon(cards, card);
  }
};

export const boardCardMap = (
  board: BoardViewModel,
): Map<string, ClientCardModel> => {
  const cards = new Map<string, ClientCardModel>();
  addCardWithAttachedDon(cards, board.self.leader);
  addCardsWithAttachedDon(cards, board.self.hand);
  addCardsWithAttachedDon(cards, board.self.characters);
  addCardWithAttachedDon(cards, board.self.stage);
  addCardsWithAttachedDon(cards, board.self.costArea);
  addCardsWithAttachedDon(cards, board.self.trash);
  addCardsWithAttachedDon(cards, board.self.lifeCards);
  addCardWithAttachedDon(cards, board.opponent.leader);
  addCardsWithAttachedDon(cards, board.opponent.characters);
  addCardWithAttachedDon(cards, board.opponent.stage);
  addCardsWithAttachedDon(cards, board.opponent.costArea);
  addCardsWithAttachedDon(cards, board.opponent.trash);
  addCardsWithAttachedDon(cards, board.opponent.lifeCards);
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
