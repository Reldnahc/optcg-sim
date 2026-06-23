import type { InstanceId, PlayerId } from "@optcg/types";

import type {
  DevMatchSnapshot,
  DevVisibleAction,
} from "./dev-snapshot-types.js";
import type { BotVisibleCard } from "./bot-types.js";

const assumedCounterPowerPerHandCard = 2_000;

export interface BotFeatures {
  readonly snapshot: DevMatchSnapshot;
  readonly botPlayerId: PlayerId;
  readonly self: BotSelfFeatures;
  readonly opponent: BotOpponentFeatures;
  readonly cards: BotCardFeatures;
  readonly actions: BotActionFeatures;
  readonly combat: BotCombatFeatures;
}

export interface BotSelfFeatures {
  readonly lifeCount: number;
  readonly handCounterPower: number;
  readonly donOnField: number;
}

export interface BotOpponentFeatures {
  readonly lifeCount: number;
  readonly handCount: number;
}

export interface BotCardFeatures {
  readonly visibleCards: readonly BotVisibleCard[];
  readonly byInstanceId: ReadonlyMap<string, BotVisibleCard>;
}

export interface BotActionFeatures {
  readonly byIndex: ReadonlyMap<number, BotVisibleActionFacts>;
}

export interface BotVisibleActionFacts {
  readonly relatedCards: readonly BotVisibleCard[];
  readonly hasRemainingAttackAfterAttachment: boolean;
}

export interface BotCombatFeatures {
  readonly leaderAttackPressure: readonly BotLeaderAttackPressure[];
}

export interface BotLeaderAttackPressure {
  readonly attackerInstanceId: string;
  readonly targetInstanceId: string;
  readonly cardsToStop: number;
}

export const cardPower = (
  card: BotVisibleCard | undefined,
): number | undefined => card?.currentPower ?? card?.printedPower;

export const counterCardsToStopAttack = (
  attackerPower: number,
  targetPower: number,
): number | undefined =>
  attackerPower < targetPower
    ? undefined
    : Math.ceil(
        (attackerPower - targetPower + 1_000) / assumedCounterPowerPerHandCard,
      );

const attachedDonCount = (card: BotVisibleCard | undefined): number =>
  card?.attachedDonCount ?? 0;

export const visibleCardValue = (
  card: BotVisibleCard | undefined,
  options: { readonly includeCounter?: boolean } = {},
): number => {
  if (card === undefined) {
    return 0;
  }
  const power = cardPower(card) ?? 0;
  const cost = card.currentCost ?? card.printedCost ?? 0;
  const counter =
    options.includeCounter === true ? (card.printedCounter ?? 0) / 2 : 0;
  const blockerBonus = card.keywords?.includes("blocker") === true ? 2_000 : 0;
  return power + cost * 1_000 + blockerBonus + counter;
};

export const visibleCards = (
  snapshot: DevMatchSnapshot,
  playerId: PlayerId,
): readonly BotVisibleCard[] => {
  const view = snapshot.players[playerId]?.view;
  if (view === undefined) {
    return [];
  }
  return [
    view.self.leader,
    ...view.self.hand,
    ...view.self.characters,
    ...view.self.costArea,
    ...(view.self.stage === undefined ? [] : [view.self.stage]),
    view.opponent.leader,
    ...(view.opponent.hand ?? []),
    ...view.opponent.characters,
    ...view.opponent.costArea,
    ...(view.opponent.stage === undefined ? [] : [view.opponent.stage]),
  ];
};

export const findVisibleCard = (
  snapshot: DevMatchSnapshot,
  playerId: PlayerId,
  instanceId: InstanceId,
): BotVisibleCard | undefined =>
  visibleCards(snapshot, playerId).find(
    (card) => card.instanceId === instanceId,
  );

const pushVisibleCard = (
  cards: BotVisibleCard[],
  snapshot: DevMatchSnapshot,
  playerId: PlayerId,
  instanceId: InstanceId,
): void => {
  const card = findVisibleCard(snapshot, playerId, instanceId);
  if (
    card !== undefined &&
    !cards.some((candidate) => candidate.instanceId === card.instanceId)
  ) {
    cards.push(card);
  }
};

export const relatedCardsForAction = (
  snapshot: DevMatchSnapshot,
  playerId: PlayerId,
  action: DevVisibleAction,
): readonly BotVisibleCard[] => {
  const cards: BotVisibleCard[] = [];
  if (action.attack !== undefined) {
    pushVisibleCard(
      cards,
      snapshot,
      playerId,
      action.attack.attackerInstanceId,
    );
    pushVisibleCard(cards, snapshot, playerId, action.attack.targetInstanceId);
  }
  if (action.attachment !== undefined) {
    pushVisibleCard(cards, snapshot, playerId, action.attachment.donInstanceId);
    pushVisibleCard(
      cards,
      snapshot,
      playerId,
      action.attachment.targetInstanceId,
    );
  }
  if (action.counter !== undefined) {
    pushVisibleCard(cards, snapshot, playerId, action.counter.cardInstanceId);
    pushVisibleCard(cards, snapshot, playerId, action.counter.targetInstanceId);
  }
  if (action.placement !== undefined) {
    pushVisibleCard(cards, snapshot, playerId, action.placement.instanceId);
  }
  return cards;
};

export const hasRemainingAttackForAttachment = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
  action: DevVisibleAction,
): boolean => {
  const targetId = action.attachment?.targetInstanceId;
  if (action.type !== "attachDon" || targetId === undefined) {
    return true;
  }
  return (snapshot.players[botPlayerId]?.actions ?? []).some(
    (candidate) =>
      candidate.type === "declareAttack" &&
      candidate.attack?.attackerInstanceId === targetId,
  );
};

const visibleCardMap = (
  cards: readonly BotVisibleCard[],
): ReadonlyMap<string, BotVisibleCard> =>
  new Map(cards.map((card) => [String(card.instanceId), card]));

const selfHandCounterPower = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
): number =>
  snapshot.players[botPlayerId]?.view.self.hand.reduce(
    (total, card) => total + (card.printedCounter ?? 0),
    0,
  ) ?? 0;

const botDonOnField = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
): number => {
  const self = snapshot.players[botPlayerId]?.view.self;
  if (self === undefined) {
    return 0;
  }
  return (
    self.costArea.length +
    attachedDonCount(self.leader) +
    self.characters.reduce(
      (total, character) => total + attachedDonCount(character),
      0,
    ) +
    attachedDonCount(self.stage)
  );
};

const actionFacts = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
  action: DevVisibleAction,
): BotVisibleActionFacts => ({
  relatedCards: relatedCardsForAction(snapshot, botPlayerId, action),
  hasRemainingAttackAfterAttachment: hasRemainingAttackForAttachment(
    snapshot,
    botPlayerId,
    action,
  ),
});

const actionFeatureMap = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
): ReadonlyMap<number, BotVisibleActionFacts> =>
  new Map(
    (snapshot.players[botPlayerId]?.actions ?? []).map((action) => [
      action.index,
      actionFacts(snapshot, botPlayerId, action),
    ]),
  );

const leaderAttackPressureForAction = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
  action: DevVisibleAction,
): BotLeaderAttackPressure | undefined => {
  const opponentLeader = snapshot.players[botPlayerId]?.view.opponent.leader;
  const attack = action.attack;
  if (
    action.type !== "declareAttack" ||
    attack === undefined ||
    opponentLeader === undefined ||
    attack.targetInstanceId !== opponentLeader.instanceId
  ) {
    return undefined;
  }
  const attackerPower = cardPower(
    findVisibleCard(snapshot, botPlayerId, attack.attackerInstanceId),
  );
  const targetPower = cardPower(opponentLeader);
  if (attackerPower === undefined || targetPower === undefined) {
    return undefined;
  }
  const cardsToStop = counterCardsToStopAttack(attackerPower, targetPower);
  return cardsToStop === undefined
    ? undefined
    : {
        attackerInstanceId: String(attack.attackerInstanceId),
        targetInstanceId: String(attack.targetInstanceId),
        cardsToStop,
      };
};

const leaderAttackPressure = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
): readonly BotLeaderAttackPressure[] =>
  (snapshot.players[botPlayerId]?.actions ?? []).flatMap((action) => {
    const pressure = leaderAttackPressureForAction(
      snapshot,
      botPlayerId,
      action,
    );
    return pressure === undefined ? [] : [pressure];
  });

export const buildBotFeatures = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
): BotFeatures => {
  const view = snapshot.players[botPlayerId]?.view;
  const cards = visibleCards(snapshot, botPlayerId);
  return {
    snapshot,
    botPlayerId,
    self: {
      lifeCount: view?.self.life.count ?? 0,
      handCounterPower: selfHandCounterPower(snapshot, botPlayerId),
      donOnField: botDonOnField(snapshot, botPlayerId),
    },
    opponent: {
      lifeCount: view?.opponent.life.count ?? 0,
      handCount: view?.opponent.hand?.length ?? view?.opponent.handCount ?? 0,
    },
    cards: {
      visibleCards: cards,
      byInstanceId: visibleCardMap(cards),
    },
    actions: {
      byIndex: actionFeatureMap(snapshot, botPlayerId),
    },
    combat: {
      leaderAttackPressure: leaderAttackPressure(snapshot, botPlayerId),
    },
  };
};
