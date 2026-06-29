import type { InstanceId, PlayerId, PlayerView } from "@optcg/types";

import type {
  DevMatchSnapshot,
  DevVisibleAction,
} from "./dev-snapshot-types.js";
import type { BotVisibleCard } from "./bot-types.js";
import {
  counterPowerRequiredToStopAttack,
  estimatedCounterCardsRequiredToStopAttack,
} from "./bot-gameplay-doctrine.js";

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
  readonly hasProfitableEffect: boolean;
  readonly hasPlayableDevelopmentCard: boolean;
  readonly hasUsefulDonAttachment: boolean;
  readonly hasAttack: boolean;
}

export type BotDonAttachmentUse =
  | "unknown"
  | "none"
  | "pressure"
  | "makeLive"
  | "setup";

export interface BotVisibleActionFacts {
  readonly relatedCards: readonly BotVisibleCard[];
  readonly hasRemainingAttackAfterAttachment: boolean;
  readonly hasUsefulDonAttachment: boolean;
  readonly donAttachmentUse: BotDonAttachmentUse;
}

export interface BotCombatFeatures {
  readonly leaderAttackPressure: readonly BotLeaderAttackPressure[];
  readonly incomingBattleIsLethal: boolean;
  readonly hasAvailableLethalLine: boolean;
  readonly hasHighValueThreatAttack: boolean;
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
  estimatedCounterCardsRequiredToStopAttack({ attackerPower, targetPower });

const counterPowerToStopAttack = (
  attackerPower: number,
  targetPower: number,
): number | undefined =>
  counterPowerRequiredToStopAttack({ attackerPower, targetPower });

const attachedDonCount = (card: BotVisibleCard | undefined): number =>
  card?.attachedDonCount ?? 0;

const partialPlayerView = (
  snapshot: DevMatchSnapshot,
  playerId: PlayerId,
): Partial<PlayerView> | undefined => snapshot.players[playerId]?.view;

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
  const view = partialPlayerView(snapshot, playerId);
  const self = view?.self;
  const opponent = view?.opponent;
  if (self === undefined || opponent === undefined) {
    return [];
  }
  return [
    self.leader,
    ...self.hand,
    ...self.characters,
    ...self.costArea,
    ...(self.stage === undefined ? [] : [self.stage]),
    opponent.leader,
    ...(opponent.hand ?? []),
    ...opponent.characters,
    ...opponent.costArea,
    ...(opponent.stage === undefined ? [] : [opponent.stage]),
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

const availableDonAttachmentsForTarget = (
  actions: readonly DevVisibleAction[],
  targetId: InstanceId,
): number =>
  new Set(
    actions.flatMap((action) =>
      action.type === "attachDon" &&
      action.attachment?.targetInstanceId === targetId
        ? [String(action.attachment.donInstanceId)]
        : [],
    ),
  ).size;

const donAttachmentUseForAttack = ({
  attackerPower,
  targetPower,
  availableDonAttachments,
}: {
  readonly attackerPower: number;
  readonly targetPower: number;
  readonly availableDonAttachments: number;
}): BotDonAttachmentUse => {
  const oneDonPower = attackerPower + 1_000;
  const allDonPower = attackerPower + availableDonAttachments * 1_000;
  const currentCounterPower = counterPowerToStopAttack(
    attackerPower,
    targetPower,
  );
  const oneDonCounterPower = counterPowerToStopAttack(oneDonPower, targetPower);
  if (currentCounterPower === undefined) {
    if (oneDonPower >= targetPower) {
      return "makeLive";
    }
    return allDonPower >= targetPower ? "setup" : "none";
  }
  return oneDonCounterPower !== undefined &&
    oneDonCounterPower > currentCounterPower
    ? "pressure"
    : "none";
};

export const donAttachmentUse = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
  action: DevVisibleAction,
): BotDonAttachmentUse => {
  const targetId = action.attachment?.targetInstanceId;
  if (action.type !== "attachDon" || targetId === undefined) {
    return "unknown";
  }
  const actions = snapshot.players[botPlayerId]?.actions ?? [];
  const attacks = actions.filter(
    (candidate) =>
      candidate.type === "declareAttack" &&
      candidate.attack?.attackerInstanceId === targetId,
  );
  if (attacks.length === 0) {
    return "none";
  }
  const attackerPower = cardPower(
    findVisibleCard(snapshot, botPlayerId, targetId),
  );
  if (attackerPower === undefined) {
    return "none";
  }
  const availableDonAttachments = availableDonAttachmentsForTarget(
    actions,
    targetId,
  );
  for (const attack of attacks) {
    const attackTargetId = attack.attack?.targetInstanceId;
    const targetPower =
      attackTargetId === undefined
        ? undefined
        : cardPower(findVisibleCard(snapshot, botPlayerId, attackTargetId));
    if (targetPower === undefined) {
      continue;
    }
    const use = donAttachmentUseForAttack({
      attackerPower,
      targetPower,
      availableDonAttachments,
    });
    if (use !== "none") {
      return use;
    }
  }
  return "none";
};

const visibleCardMap = (
  cards: readonly BotVisibleCard[],
): ReadonlyMap<string, BotVisibleCard> =>
  new Map(cards.map((card) => [String(card.instanceId), card]));

const selfHandCounterPower = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
): number =>
  partialPlayerView(snapshot, botPlayerId)?.self?.hand.reduce(
    (total, card) => total + (card.printedCounter ?? 0),
    0,
  ) ?? 0;

const botDonOnField = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
): number => {
  const self = partialPlayerView(snapshot, botPlayerId)?.self;
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
): BotVisibleActionFacts => {
  const attachmentUse = donAttachmentUse(snapshot, botPlayerId, action);
  return {
    relatedCards: relatedCardsForAction(snapshot, botPlayerId, action),
    hasRemainingAttackAfterAttachment: hasRemainingAttackForAttachment(
      snapshot,
      botPlayerId,
      action,
    ),
    hasUsefulDonAttachment: attachmentUse !== "none",
    donAttachmentUse: attachmentUse,
  };
};

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

const actionFeatures = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
  byIndex: ReadonlyMap<number, BotVisibleActionFacts>,
): BotActionFeatures => {
  const actions = snapshot.players[botPlayerId]?.actions ?? [];
  return {
    byIndex,
    hasProfitableEffect: actions.some(
      (action) => action.type === "activateEffect",
    ),
    hasPlayableDevelopmentCard: actions.some(
      (action) => action.type === "playCard",
    ),
    hasUsefulDonAttachment: actions.some(
      (action) =>
        action.type === "attachDon" &&
        (byIndex.get(action.index)?.hasUsefulDonAttachment ?? true),
    ),
    hasAttack: actions.some((action) => action.type === "declareAttack"),
  };
};

const leaderAttackPressureForAction = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
  action: DevVisibleAction,
): BotLeaderAttackPressure | undefined => {
  const opponentLeader = partialPlayerView(snapshot, botPlayerId)?.opponent
    ?.leader;
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

const incomingBattleIsLethal = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
): boolean => {
  const view = partialPlayerView(snapshot, botPlayerId);
  const battle = view?.battle;
  if (
    view?.self === undefined ||
    battle === undefined ||
    battle.currentTarget.instanceId !== view.self.leader.instanceId ||
    battle.damageCount <= view.self.life.count
  ) {
    return false;
  }
  const attackerPower = cardPower(
    findVisibleCard(snapshot, botPlayerId, battle.attacker.instanceId),
  );
  const targetPower = cardPower(view.self.leader);
  return (
    attackerPower !== undefined &&
    targetPower !== undefined &&
    attackerPower >= targetPower
  );
};

const hasAvailableLethalLine = ({
  pressure,
  opponent,
}: {
  readonly pressure: readonly BotLeaderAttackPressure[];
  readonly opponent: BotOpponentFeatures;
}): boolean => {
  const byAttacker = new Map<string, BotLeaderAttackPressure>();
  for (const attack of pressure) {
    const existing = byAttacker.get(attack.attackerInstanceId);
    if (existing === undefined || attack.cardsToStop > existing.cardsToStop) {
      byAttacker.set(attack.attackerInstanceId, attack);
    }
  }
  const attacksToStop = byAttacker.size - opponent.lifeCount;
  if (attacksToStop <= 0) {
    return false;
  }
  const counterCardsNeeded = [...byAttacker.values()]
    .map((attack) => attack.cardsToStop)
    .sort((left, right) => left - right)
    .slice(0, attacksToStop)
    .reduce((total, cardsToStop) => total + cardsToStop, 0);
  return opponent.handCount < counterCardsNeeded;
};

const hasHighValueThreatAttack = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
): boolean => {
  const opponentCharacters =
    partialPlayerView(snapshot, botPlayerId)?.opponent?.characters ?? [];
  return (snapshot.players[botPlayerId]?.actions ?? []).some((action) => {
    const targetId = action.attack?.targetInstanceId;
    if (action.type !== "declareAttack" || targetId === undefined) {
      return false;
    }
    const target = opponentCharacters.find(
      (card) => card.instanceId === targetId,
    );
    return visibleCardValue(target, { includeCounter: true }) >= 8_000;
  });
};

export const buildBotFeatures = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
): BotFeatures => {
  const view = partialPlayerView(snapshot, botPlayerId);
  const cards = visibleCards(snapshot, botPlayerId);
  const byIndex = actionFeatureMap(snapshot, botPlayerId);
  const pressure = leaderAttackPressure(snapshot, botPlayerId);
  const opponent = {
    lifeCount: view?.opponent?.life.count ?? 0,
    handCount: view?.opponent?.hand?.length ?? view?.opponent?.handCount ?? 0,
  };
  return {
    snapshot,
    botPlayerId,
    self: {
      lifeCount: view?.self?.life.count ?? 0,
      handCounterPower: selfHandCounterPower(snapshot, botPlayerId),
      donOnField: botDonOnField(snapshot, botPlayerId),
    },
    opponent,
    cards: {
      visibleCards: cards,
      byInstanceId: visibleCardMap(cards),
    },
    actions: actionFeatures(snapshot, botPlayerId, byIndex),
    combat: {
      leaderAttackPressure: pressure,
      incomingBattleIsLethal: incomingBattleIsLethal(snapshot, botPlayerId),
      hasAvailableLethalLine: hasAvailableLethalLine({ pressure, opponent }),
      hasHighValueThreatAttack: hasHighValueThreatAttack(snapshot, botPlayerId),
    },
  };
};
