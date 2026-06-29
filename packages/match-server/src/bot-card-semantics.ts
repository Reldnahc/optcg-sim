import type { PublicCardView } from "@optcg/types";

import type { BotCardRole, BotDeckProfileData } from "./bot-profile-types.js";

export interface BotCardSemantics {
  readonly cardId: string;
  readonly roles: ReadonlySet<BotCardRole>;
  readonly counterValue: number;
  readonly boardValue: number;
}

const printedPower = (card: PublicCardView): number =>
  card.currentPower ?? card.printedPower ?? 0;

const printedCost = (card: PublicCardView): number =>
  card.currentCost ?? card.printedCost ?? 0;

export const deriveBotCardSemantics = ({
  card,
  profile,
}: {
  readonly card: PublicCardView;
  readonly profile?: BotDeckProfileData | undefined;
}): BotCardSemantics => {
  const cardId = String(card.cardId);
  const roles = new Set<BotCardRole>(profile?.cardRoles[cardId] ?? []);
  if (card.keywords?.includes("blocker") === true) {
    roles.add("blocker");
  }
  if ((card.printedCounter ?? 0) >= 2_000) {
    roles.add("high-counter");
  }
  if (printedPower(card) >= 5_000) {
    roles.add("attacker");
  }
  return {
    cardId,
    roles,
    counterValue: card.printedCounter ?? 0,
    boardValue: printedPower(card) + printedCost(card) * 1_000,
  };
};
