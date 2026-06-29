import type { CardId, MatchCardManifest, ResolvedCard } from "@optcg/types";

import type {
  BotDeckCardKnowledge,
  BotOpponentDeckKnowledge,
  BotVisibleCard,
} from "./bot-types.js";

const emptyCounterPrior = {
  unknownCardCount: 0,
  totalCounterPower: 0,
  counter1000Count: 0,
  counter2000Count: 0,
  averageCounterPower: 0,
} as const;

const publicCardCounts = (
  publicCards: readonly BotVisibleCard[],
): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>();
  for (const card of publicCards) {
    const cardId = String(card.cardId);
    counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
  }
  return counts;
};

const remainingCards = ({
  decklist,
  publicCards,
}: {
  readonly decklist: readonly BotDeckCardKnowledge[];
  readonly publicCards: readonly BotVisibleCard[];
}): readonly BotDeckCardKnowledge[] => {
  const publicCounts = publicCardCounts(publicCards);
  return decklist.flatMap((card) => {
    const remainingCount = Math.max(
      0,
      card.count - (publicCounts.get(card.cardId) ?? 0),
    );
    return remainingCount === 0 ? [] : [{ ...card, count: remainingCount }];
  });
};

const counterPrior = (
  cards: readonly BotDeckCardKnowledge[],
): BotOpponentDeckKnowledge["remainingUnknownCounterPrior"] => {
  const unknownCardCount = cards.reduce((total, card) => total + card.count, 0);
  if (unknownCardCount === 0) {
    return emptyCounterPrior;
  }
  const totalCounterPower = cards.reduce(
    (total, card) => total + card.printedCounter * card.count,
    0,
  );
  return {
    unknownCardCount,
    totalCounterPower,
    counter1000Count: cards
      .filter((card) => card.printedCounter === 1_000)
      .reduce((total, card) => total + card.count, 0),
    counter2000Count: cards
      .filter((card) => card.printedCounter >= 2_000)
      .reduce((total, card) => total + card.count, 0),
    averageCounterPower: totalCounterPower / unknownCardCount,
  };
};

const roleCount = (
  cards: readonly BotDeckCardKnowledge[],
  role: string,
): number =>
  cards
    .filter((card) => card.roles.includes(role))
    .reduce((total, card) => total + card.count, 0);

const deckCardCounts = (
  cardIds: readonly CardId[],
): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>();
  for (const cardId of cardIds) {
    const key = String(cardId);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};

const cardKnowledgeRoles = (
  card: ResolvedCard | undefined,
): readonly string[] => {
  if (card === undefined) {
    return [];
  }
  return [
    ...(card.category === "event" ? ["event"] : []),
    ...(card.printedKeywords.includes("blocker") ? ["blocker"] : []),
    ...(/K\.O\.|trash|bottom|return/iu.test(
      `${card.effectText ?? ""}\n${card.triggerText ?? ""}`,
    )
      ? ["removal"]
      : []),
  ];
};

export const buildDeckCardKnowledgeFromManifest = ({
  cardIds,
  cardManifest,
}: {
  readonly cardIds: readonly CardId[];
  readonly cardManifest: MatchCardManifest;
}): readonly BotDeckCardKnowledge[] =>
  [...deckCardCounts(cardIds)].map(([cardId, count]) => {
    const card = cardManifest.cards[cardId as CardId];
    return {
      cardId,
      count,
      printedCounter: card?.counter ?? 0,
      roles: cardKnowledgeRoles(card),
    };
  });

export const buildOpponentDeckKnowledge = ({
  decklist,
  publicCards,
}: {
  readonly decklist: readonly BotDeckCardKnowledge[];
  readonly publicCards: readonly BotVisibleCard[];
}): BotOpponentDeckKnowledge => {
  const remaining = remainingCards({ decklist, publicCards });
  return {
    knownDecklistCardIds: decklist.map((card) => card.cardId),
    remainingUnknownCounterPrior: counterPrior(remaining),
    remainingEventCount: roleCount(remaining, "event"),
    remainingBlockerCount: roleCount(remaining, "blocker"),
    remainingRemovalCount: roleCount(remaining, "removal"),
  };
};
