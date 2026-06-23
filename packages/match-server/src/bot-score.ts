import type { PlayerView } from "@optcg/types";

import type { BotActionCandidate } from "./bot-candidates.js";
import { scoreCombatAction } from "./bot-combat-evaluation.js";
import {
  cardPower,
  counterCardsToStopAttack,
  findVisibleCard,
  visibleCardValue,
  type BotFeatures,
} from "./bot-features.js";
import type { BotActionContext } from "./bot-types.js";

type BotPendingDecision = NonNullable<PlayerView["pendingDecision"]>;

export interface BotScoreBreakdown {
  readonly total: number;
  readonly profile: number;
  readonly combat: number;
  readonly resource: number;
  readonly tempo: number;
  readonly risk: number;
  readonly fallback: number;
  readonly intent: number;
  readonly reasons: readonly string[];
}

export interface ScoredBotCandidate {
  readonly candidate: BotActionCandidate;
  readonly breakdown: BotScoreBreakdown;
}

export interface BotScoreInput {
  readonly candidate: BotActionCandidate;
  readonly features: BotFeatures;
  readonly context?: BotActionContext;
  readonly pendingDecision?: BotPendingDecision | undefined;
  readonly tacticalScore?: number | undefined;
  readonly profileScore?: number | undefined;
  readonly cardScores?: readonly number[] | undefined;
}

type BotScoreTerm = keyof Omit<BotScoreBreakdown, "total" | "reasons">;

const emptyBreakdown = (): BotScoreBreakdown => ({
  total: 0,
  profile: 0,
  combat: 0,
  resource: 0,
  tempo: 0,
  risk: 0,
  fallback: 0,
  intent: 0,
  reasons: [],
});

const addTerm = (
  breakdown: BotScoreBreakdown,
  key: BotScoreTerm,
  value: number,
  reason: string,
): BotScoreBreakdown => ({
  ...breakdown,
  [key]: breakdown[key] + value,
  total: breakdown.total + value,
  reasons: [...breakdown.reasons, reason],
});

const mergeBreakdown = (
  left: BotScoreBreakdown,
  right: BotScoreBreakdown | undefined,
): BotScoreBreakdown => {
  if (right === undefined) {
    return left;
  }
  return {
    total: left.total + right.total,
    profile: left.profile + right.profile,
    combat: left.combat + right.combat,
    resource: left.resource + right.resource,
    tempo: left.tempo + right.tempo,
    risk: left.risk + right.risk,
    fallback: left.fallback + right.fallback,
    intent: left.intent + right.intent,
    reasons: [...left.reasons, ...right.reasons],
  };
};

const contextForCandidate = ({
  candidate,
  features,
  context,
}: Pick<
  BotScoreInput,
  "candidate" | "features" | "context"
>): BotActionContext =>
  context ?? {
    snapshot: features.snapshot,
    botPlayerId: features.botPlayerId,
    action: candidate.action,
    relatedCards: candidate.relatedCards,
  };

const actionPlacementCard = ({
  action,
  relatedCards,
}: Pick<BotActionContext, "action" | "relatedCards">) => {
  const placementId = action.placement?.instanceId;
  return placementId === undefined
    ? undefined
    : relatedCards.find((card) => card.instanceId === placementId);
};

const profileAdjustment = (scores: readonly number[]): number => {
  const best = [...scores].sort((left, right) => left - right)[0];
  if (best === undefined) {
    return 0;
  }
  if (best <= 0) {
    return Math.min(140, 70 + Math.abs(best));
  }
  return Math.max(-70, 35 - best);
};

const opponentView = ({
  snapshot,
  botPlayerId,
}: Pick<BotActionContext, "snapshot" | "botPlayerId">):
  | PlayerView["opponent"]
  | undefined => {
  const player = snapshot.players[botPlayerId];
  if (player === undefined || !("opponent" in player.view)) {
    return undefined;
  }
  return player.view.opponent;
};

const decisionBreakdown = ({
  context,
  pendingDecision,
}: {
  readonly context: BotActionContext;
  readonly pendingDecision: BotPendingDecision | undefined;
}): BotScoreBreakdown | undefined => {
  const { action } = context;
  if (action.type !== "respondToDecision") {
    return undefined;
  }
  let value = 150;
  if (action.decisionPayment?.kind === "cardCost") {
    value = 1_200;
  } else if (
    action.decisionPayment?.kind === "paymentDeclined" ||
    action.responseKey === "decline"
  ) {
    value = pendingDecision?.type === "payCost" ? 100 : 50;
  } else if (pendingDecision?.type === "payCost") {
    value = 1_200;
  } else if (action.responseKey === "keep" || action.responseKey === "deny") {
    value = 1_000;
  }
  return addTerm(
    emptyBreakdown(),
    "fallback",
    value,
    "decision:visible-response",
  );
};

const tacticalReason = (
  context: BotActionContext,
  tacticalScore: number,
): string => {
  if (context.action.type === "useCounter") {
    return tacticalScore < 0
      ? "combat:leader-defense-counter"
      : "combat:counter";
  }
  if (context.action.type === "attachDon" && tacticalScore <= -900) {
    return "combat:lethal-setup";
  }
  if (context.action.type === "declareAttack" && tacticalScore <= -1_000) {
    return "combat:leader-lethal";
  }
  return "combat:tactical";
};

const tacticalBreakdown = ({
  context,
  tacticalScore,
}: {
  readonly context: BotActionContext;
  readonly tacticalScore: number | undefined;
}): BotScoreBreakdown | undefined => {
  if (tacticalScore === undefined) {
    return undefined;
  }
  if (tacticalScore < 0) {
    return addTerm(
      emptyBreakdown(),
      "combat",
      2_000 + Math.abs(tacticalScore),
      tacticalReason(context, tacticalScore),
    );
  }
  if (context.action.type === "useCounter") {
    return addTerm(
      emptyBreakdown(),
      "combat",
      650 - tacticalScore,
      tacticalReason(context, tacticalScore),
    );
  }
  return undefined;
};

const characterAttackBreakdown = (
  context: BotActionContext,
): BotScoreBreakdown | undefined => {
  const targetId = context.action.attack?.targetInstanceId;
  const opponent = opponentView(context);
  if (
    context.action.type !== "declareAttack" ||
    targetId === undefined ||
    opponent === undefined ||
    !opponent.characters.some((card) => card.instanceId === targetId)
  ) {
    return undefined;
  }
  const target = findVisibleCard(
    context.snapshot,
    context.botPlayerId,
    targetId,
  );
  if (target === undefined) {
    return undefined;
  }
  return addTerm(
    emptyBreakdown(),
    "combat",
    75 + Math.min(55, visibleCardValue(target, { includeCounter: true }) / 400),
    "combat:character-threat",
  );
};

const leaderAttackBreakdown = (
  context: BotActionContext,
): BotScoreBreakdown | undefined => {
  const attack = context.action.attack;
  const opponent = opponentView(context);
  if (
    context.action.type !== "declareAttack" ||
    attack === undefined ||
    opponent === undefined ||
    attack.targetInstanceId !== opponent.leader.instanceId
  ) {
    return undefined;
  }
  const attackerPower = cardPower(
    findVisibleCard(
      context.snapshot,
      context.botPlayerId,
      attack.attackerInstanceId,
    ),
  );
  const targetPower = cardPower(opponent.leader);
  if (attackerPower === undefined || targetPower === undefined) {
    return undefined;
  }
  const cardsToStop = counterCardsToStopAttack(attackerPower, targetPower);
  if (cardsToStop === undefined) {
    return undefined;
  }
  const opponentHandCount =
    opponent.hand === undefined ? opponent.handCount : opponent.hand.length;
  const handPressure = cardsToStop * 12;
  const lifePressure = Math.max(0, 5 - opponent.life.count) * 8;
  const lowHandPressure =
    opponent.life.count <= 1 && opponentHandCount < cardsToStop ? 20 : 0;
  return addTerm(
    emptyBreakdown(),
    "combat",
    30 + handPressure + lifePressure + lowHandPressure,
    "combat:leader-pressure",
  );
};

const attachDonBreakdown = (
  context: BotActionContext,
): BotScoreBreakdown | undefined => {
  const attachment = context.action.attachment;
  const opponent = opponentView(context);
  if (
    context.action.type !== "attachDon" ||
    attachment === undefined ||
    opponent === undefined
  ) {
    return undefined;
  }
  const target = findVisibleCard(
    context.snapshot,
    context.botPlayerId,
    attachment.targetInstanceId,
  );
  const targetPower = cardPower(target);
  const leaderPower = cardPower(opponent.leader);
  if (targetPower === undefined || leaderPower === undefined) {
    return undefined;
  }
  const currentCardsToStop = counterCardsToStopAttack(targetPower, leaderPower);
  const boostedCardsToStop = counterCardsToStopAttack(
    targetPower + 1_000,
    leaderPower,
  );
  if (boostedCardsToStop === undefined) {
    return addTerm(emptyBreakdown(), "resource", 20, "resource:attach-don");
  }
  if (currentCardsToStop === undefined) {
    return addTerm(
      emptyBreakdown(),
      "resource",
      95,
      "resource:use-don-for-live-attack",
    );
  }
  if (boostedCardsToStop > currentCardsToStop) {
    return addTerm(
      emptyBreakdown(),
      "resource",
      75 + boostedCardsToStop * 8,
      "resource:use-don-for-live-attack",
    );
  }
  return addTerm(emptyBreakdown(), "resource", 45, "resource:attach-don");
};

const attackBreakdown = (
  context: BotActionContext,
): BotScoreBreakdown | undefined =>
  characterAttackBreakdown(context) ?? leaderAttackBreakdown(context);

const playCardBreakdown = ({
  context,
  profileScore,
  cardScores,
}: {
  readonly context: BotActionContext;
  readonly profileScore: number | undefined;
  readonly cardScores: readonly number[];
}): BotScoreBreakdown | undefined => {
  if (context.action.type !== "playCard") {
    return undefined;
  }
  const card = actionPlacementCard(context);
  const counter = card?.printedCounter ?? 0;
  const counterReservePenalty =
    counter >= 2_000 ? 45 : counter >= 1_000 ? 14 : 0;
  const developmentValue =
    25 + Math.min(55, visibleCardValue(card, { includeCounter: true }) / 400);
  const profileValue = profileAdjustment([
    ...(profileScore === undefined ? [] : [profileScore]),
    ...cardScores,
  ]);
  let breakdown = addTerm(
    emptyBreakdown(),
    "tempo",
    developmentValue,
    "tempo:develop-board",
  );
  if (counterReservePenalty > 0) {
    breakdown = addTerm(
      breakdown,
      "resource",
      -counterReservePenalty,
      "resource:preserve-counter",
    );
  }
  if (profileValue !== 0) {
    breakdown = addTerm(breakdown, "profile", profileValue, "profile:action");
  }
  return breakdown;
};

const activeEffectBreakdown = ({
  context,
  profileScore,
  cardScores,
}: {
  readonly context: BotActionContext;
  readonly profileScore: number | undefined;
  readonly cardScores: readonly number[];
}): BotScoreBreakdown | undefined => {
  if (context.action.type !== "activateEffect") {
    return undefined;
  }
  const profileValue = profileAdjustment([
    ...(profileScore === undefined ? [] : [profileScore]),
    ...cardScores,
  ]);
  let breakdown = addTerm(
    emptyBreakdown(),
    "tempo",
    60,
    "tempo:profitable-effect",
  );
  if (profileValue !== 0) {
    breakdown = addTerm(breakdown, "profile", profileValue, "profile:action");
  }
  return breakdown;
};

const fallbackBreakdown = (context: BotActionContext): BotScoreBreakdown => {
  switch (context.action.type) {
    case "advanceToMainPhase":
      return addTerm(
        emptyBreakdown(),
        "fallback",
        80,
        "fallback:advanceToMainPhase",
      );
    case "endMainPhase":
      return addTerm(
        emptyBreakdown(),
        "fallback",
        -100,
        "fallback:endMainPhase",
      );
    case "useCounter":
      return addTerm(emptyBreakdown(), "fallback", 20, "fallback:useCounter");
    case "activateBlocker":
      return addTerm(
        emptyBreakdown(),
        "fallback",
        25,
        "fallback:activateBlocker",
      );
    case "attachDon":
      return addTerm(emptyBreakdown(), "fallback", 35, "fallback:attachDon");
    case "playCard":
      return addTerm(emptyBreakdown(), "fallback", 30, "fallback:playCard");
    case "activateEffect":
      return addTerm(
        emptyBreakdown(),
        "fallback",
        60,
        "fallback:activateEffect",
      );
    case "declareAttack":
      return addTerm(
        emptyBreakdown(),
        "fallback",
        40,
        "fallback:declareAttack",
      );
    case "respondToDecision":
      return addTerm(
        emptyBreakdown(),
        "fallback",
        150,
        "decision:visible-response",
      );
    case "concede":
      return addTerm(emptyBreakdown(), "risk", -10_000, "risk:concede");
    default:
      return emptyBreakdown();
  }
};

export const scoreBotCandidate = (input: BotScoreInput): ScoredBotCandidate => {
  const context = contextForCandidate(input);
  const pendingDecision =
    input.pendingDecision ??
    input.features.snapshot.players[input.features.botPlayerId]?.view
      .pendingDecision;
  const tacticalScore =
    input.tacticalScore ?? scoreCombatAction(context, input.features);
  const profileScore = input.profileScore;
  const cardScores = input.cardScores ?? [];
  let breakdown = emptyBreakdown();
  breakdown = mergeBreakdown(
    breakdown,
    decisionBreakdown({ context, pendingDecision }),
  );
  breakdown = mergeBreakdown(
    breakdown,
    tacticalBreakdown({ context, tacticalScore }),
  );
  breakdown = mergeBreakdown(breakdown, attackBreakdown(context));
  breakdown = mergeBreakdown(breakdown, attachDonBreakdown(context));
  breakdown = mergeBreakdown(
    breakdown,
    playCardBreakdown({ context, profileScore, cardScores }),
  );
  breakdown = mergeBreakdown(
    breakdown,
    activeEffectBreakdown({ context, profileScore, cardScores }),
  );
  if (breakdown.reasons.length === 0) {
    breakdown = fallbackBreakdown(context);
  }
  return { candidate: input.candidate, breakdown };
};
