import type { CardRef, PlayerId } from "@optcg/types";

import { cardPower, findVisibleCard } from "./bot-context.js";
import type {
  DevMatchSnapshot,
  DevVisibleAction,
} from "./dev-snapshot-types.js";
import type {
  BotActionContext,
  BotDecisionChoice,
  BotDecisionContext,
  BotVisibleCard,
} from "./bot-types.js";

const assumedCounterPowerPerHandCard = 2_000;
const leaderLethalBaseScore = -1_000;
const lethalSetupBaseScore = -900;
const lethalDefenseScore = -950;

interface LeaderAttackCandidate {
  readonly attackerInstanceId: string;
  readonly cardsToStop: number;
}

const counterCardsToStopAttack = (
  attackerPower: number,
  targetPower: number,
): number | undefined => {
  if (attackerPower < targetPower) {
    return undefined;
  }
  return Math.ceil(
    (attackerPower - targetPower + 1_000) / assumedCounterPowerPerHandCard,
  );
};

const opponentHandCardCount = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
): number => {
  const opponent = snapshot.players[botPlayerId]?.view.opponent;
  return opponent?.hand?.length ?? opponent?.handCount ?? 0;
};

const leaderAttackCandidateForAction = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
  action: DevVisibleAction,
): LeaderAttackCandidate | undefined => {
  const opponent = snapshot.players[botPlayerId]?.view.opponent;
  const attack = action.attack;
  if (
    opponent === undefined ||
    attack === undefined ||
    attack.targetInstanceId !== opponent.leader.instanceId
  ) {
    return undefined;
  }
  const attackerPower = cardPower(
    findVisibleCard(snapshot, botPlayerId, attack.attackerInstanceId),
  );
  const targetPower = cardPower(opponent.leader);
  if (attackerPower === undefined || targetPower === undefined) {
    return undefined;
  }
  const cardsToStop = counterCardsToStopAttack(attackerPower, targetPower);
  return cardsToStop === undefined
    ? undefined
    : {
        attackerInstanceId: String(attack.attackerInstanceId),
        cardsToStop,
      };
};

const legalLeaderAttackCandidates = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
): readonly LeaderAttackCandidate[] =>
  (snapshot.players[botPlayerId]?.actions ?? []).flatMap((action) => {
    const candidate = leaderAttackCandidateForAction(
      snapshot,
      botPlayerId,
      action,
    );
    return candidate === undefined ? [] : [candidate];
  });

const candidateKey = (candidate: LeaderAttackCandidate): string =>
  candidate.attackerInstanceId;

const uniqueLeaderAttackCandidates = (
  candidates: readonly LeaderAttackCandidate[],
): readonly LeaderAttackCandidate[] => {
  const byAttacker = new Map<string, LeaderAttackCandidate>();
  for (const candidate of candidates) {
    const existing = byAttacker.get(candidateKey(candidate));
    if (
      existing === undefined ||
      candidate.cardsToStop > existing.cardsToStop
    ) {
      byAttacker.set(candidateKey(candidate), candidate);
    }
  }
  return [...byAttacker.values()];
};

const counterCardsNeededToSurvive = (
  candidates: readonly LeaderAttackCandidate[],
  lifeCount: number,
): number | undefined => {
  const uniqueCandidates = uniqueLeaderAttackCandidates(candidates);
  const attacksToStop = uniqueCandidates.length - lifeCount;
  if (attacksToStop <= 0) {
    return undefined;
  }
  return uniqueCandidates
    .map((candidate) => candidate.cardsToStop)
    .sort((left, right) => left - right)
    .slice(0, attacksToStop)
    .reduce((total, cardsToStop) => total + cardsToStop, 0);
};

const visibleCardValue = (card: BotVisibleCard | undefined): number => {
  if (card === undefined) {
    return 0;
  }
  const power = cardPower(card) ?? 0;
  const cost = card.currentCost ?? card.printedCost ?? 0;
  const blockerBonus = card.keywords?.includes("blocker") === true ? 2_000 : 0;
  return power + cost * 1_000 + blockerBonus;
};

const findCardRef = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
  card: CardRef,
): BotVisibleCard | undefined =>
  findVisibleCard(snapshot, botPlayerId, card.instanceId);

const isCurrentBattleTarget = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
  instanceId: string,
): boolean =>
  String(
    snapshot.players[botPlayerId]?.view.battle?.currentTarget.instanceId,
  ) === instanceId;

const battleAttackerPower = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
): number | undefined => {
  const attacker = snapshot.players[botPlayerId]?.view.battle?.attacker;
  return attacker === undefined
    ? undefined
    : cardPower(findCardRef(snapshot, botPlayerId, attacker));
};

const battleTargetPower = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
): number | undefined => {
  const target = snapshot.players[botPlayerId]?.view.battle?.currentTarget;
  return target === undefined
    ? undefined
    : cardPower(findCardRef(snapshot, botPlayerId, target));
};

const isBattleTargetLeader = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
): boolean => {
  const view = snapshot.players[botPlayerId]?.view;
  return (
    view !== undefined &&
    view.battle?.currentTarget.instanceId === view.self.leader.instanceId
  );
};

const isLethalBattleDamage = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
): boolean => {
  const view = snapshot.players[botPlayerId]?.view;
  const battle = view?.battle;
  if (
    view === undefined ||
    battle === undefined ||
    !isBattleTargetLeader(snapshot, botPlayerId)
  ) {
    return false;
  }
  return view.self.life.count < battle.damageCount;
};

export const scoreLeaderLethalAttack = ({
  snapshot,
  botPlayerId,
  action,
}: BotActionContext): number | undefined => {
  const currentCandidate = leaderAttackCandidateForAction(
    snapshot,
    botPlayerId,
    action,
  );
  const opponent = snapshot.players[botPlayerId]?.view.opponent;
  if (currentCandidate === undefined || opponent === undefined) {
    return undefined;
  }
  const candidates = legalLeaderAttackCandidates(snapshot, botPlayerId);
  const counterCardsNeeded = counterCardsNeededToSurvive(
    candidates,
    opponent.life.count,
  );
  if (
    counterCardsNeeded === undefined ||
    opponentHandCardCount(snapshot, botPlayerId) >= counterCardsNeeded
  ) {
    return undefined;
  }
  return leaderLethalBaseScore - currentCandidate.cardsToStop;
};

const scoreCharacterAttack = ({
  snapshot,
  botPlayerId,
  action,
}: BotActionContext): number | undefined => {
  const attack = action.attack;
  const opponent = snapshot.players[botPlayerId]?.view.opponent;
  if (attack === undefined || opponent === undefined) {
    return undefined;
  }
  const target = opponent.characters.find(
    (character) => character.instanceId === attack.targetInstanceId,
  );
  if (target === undefined) {
    return undefined;
  }
  const valueBonus = Math.min(8, visibleCardValue(target) / 2_500);
  return 38 - valueBonus;
};

const canAttackLeaderWithBoostedCard = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
  attackerInstanceId: string,
): boolean =>
  (snapshot.players[botPlayerId]?.actions ?? []).some(
    (action) =>
      action.type === "declareAttack" &&
      action.attack?.attackerInstanceId === attackerInstanceId &&
      action.attack.targetInstanceId ===
        snapshot.players[botPlayerId]?.view.opponent.leader.instanceId,
  );

const scoreAttachDonForLethal = ({
  snapshot,
  botPlayerId,
  action,
}: BotActionContext): number | undefined => {
  const attachment = action.attachment;
  const opponent = snapshot.players[botPlayerId]?.view.opponent;
  if (
    action.type !== "attachDon" ||
    attachment === undefined ||
    opponent === undefined ||
    !canAttackLeaderWithBoostedCard(
      snapshot,
      botPlayerId,
      String(attachment.targetInstanceId),
    )
  ) {
    return undefined;
  }
  const target = findVisibleCard(
    snapshot,
    botPlayerId,
    attachment.targetInstanceId,
  );
  const targetPower = cardPower(target);
  const leaderPower = cardPower(opponent.leader);
  if (targetPower === undefined || leaderPower === undefined) {
    return undefined;
  }
  const boostedCardsToStop = counterCardsToStopAttack(
    targetPower + 1_000,
    leaderPower,
  );
  if (boostedCardsToStop === undefined) {
    return undefined;
  }
  const counterCardsNeeded = counterCardsNeededToSurvive(
    [
      ...legalLeaderAttackCandidates(snapshot, botPlayerId),
      {
        attackerInstanceId: String(attachment.targetInstanceId),
        cardsToStop: boostedCardsToStop,
      },
    ],
    opponent.life.count,
  );
  if (
    counterCardsNeeded === undefined ||
    opponentHandCardCount(snapshot, botPlayerId) >= counterCardsNeeded
  ) {
    return undefined;
  }
  return lethalSetupBaseScore - boostedCardsToStop;
};

const scoreCounterAction = ({
  snapshot,
  botPlayerId,
  action,
}: BotActionContext): number | undefined => {
  const battle = snapshot.players[botPlayerId]?.view.battle;
  if (
    action.type !== "useCounter" ||
    action.counter === undefined ||
    battle?.step !== "counter" ||
    !isCurrentBattleTarget(
      snapshot,
      botPlayerId,
      String(action.counter.targetInstanceId),
    )
  ) {
    return undefined;
  }
  const attackerPower = battleAttackerPower(snapshot, botPlayerId);
  const targetPower = battleTargetPower(snapshot, botPlayerId);
  if (
    attackerPower === undefined ||
    targetPower === undefined ||
    attackerPower < targetPower
  ) {
    return undefined;
  }
  if (isLethalBattleDamage(snapshot, botPlayerId)) {
    return lethalDefenseScore;
  }
  const target = findCardRef(snapshot, botPlayerId, battle.currentTarget);
  if (
    !isBattleTargetLeader(snapshot, botPlayerId) &&
    visibleCardValue(target) >= 8_000
  ) {
    return 34;
  }
  return undefined;
};

export const scoreCombatAction = (
  context: BotActionContext,
): number | undefined =>
  scoreLeaderLethalAttack(context) ??
  scoreAttachDonForLethal(context) ??
  scoreCounterAction(context) ??
  scoreCharacterAttack(context);

const bestBlockerChoice = ({
  snapshot,
  botPlayerId,
}: BotDecisionContext): CardRef | undefined => {
  const view = snapshot.players[botPlayerId]?.view;
  const decision = view?.pendingDecision;
  if (
    view === undefined ||
    decision?.type !== "selectCards" ||
    decision.min !== 0 ||
    decision.max !== 1 ||
    view.battle?.step !== "block" ||
    !isLethalBattleDamage(snapshot, botPlayerId)
  ) {
    return undefined;
  }
  return decision.choices
    .filter((choice) => choice.selectable)
    .map((choice) => ({
      card: choice.card,
      value: visibleCardValue(findCardRef(snapshot, botPlayerId, choice.card)),
    }))
    .sort((left, right) => left.value - right.value)[0]?.card;
};

export const chooseCombatDecision = (
  context: BotDecisionContext,
): BotDecisionChoice | undefined => {
  const decision =
    context.snapshot.players[context.botPlayerId]?.view.pendingDecision;
  const blocker = bestBlockerChoice(context);
  if (decision === undefined || blocker === undefined) {
    return undefined;
  }
  return {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [blocker] },
  };
};
