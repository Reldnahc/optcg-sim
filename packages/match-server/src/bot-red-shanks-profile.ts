import type { CardId, CardRef, PublicCardView } from "@optcg/types";

import type {
  BotActionContext,
  BotBehaviorProfile,
  BotDecisionChoice,
  BotDecisionContext,
} from "./bot-types.js";
import {
  choosePowerReductionTarget,
  scorePowerReductionAction,
  type BotPowerReductionBehaviors,
} from "./bot-power-reduction-behavior.js";
import { chooseCharacterOverflowDecision } from "./bot-character-overflow.js";

const op16BennBeckman = "OP16-012";
const op09LeaderShanks = "OP09-001";
const hardCastOp16FallbackScore = 85;
const searchSourceCardIds = new Set<string>([
  "OP09-002",
  "OP09-020",
  "PRB02-002",
]);
const setupPlayScores = new Map<string, number>([
  ["OP09-002", 8],
  ["OP09-020", 9],
  ["PRB02-002", 10],
  ["OP09-011", 18],
]);
const powerReductionBehaviors = {
  "OP09-011": {
    amount: 2_000,
    target: "opponentCharacter",
    restsSource: true,
  },
} satisfies BotPowerReductionBehaviors;
const shanksCardIds = new Set<string>([
  "OP06-007",
  "OP09-004",
  "OP12-008",
  "ST23-002",
]);

const actionCard = ({
  action,
  relatedCards,
}: BotActionContext): PublicCardView | undefined => {
  const placementId = action.placement?.instanceId;
  return placementId === undefined
    ? undefined
    : relatedCards.find((card) => card.instanceId === placementId);
};

const attachedDonCount = (card: PublicCardView | undefined): number =>
  card?.attachedDonCount ?? 0;

const botDonOnField = ({ snapshot, botPlayerId }: BotActionContext): number => {
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

const hasShanksInHand = ({
  snapshot,
  botPlayerId,
}: BotActionContext): boolean =>
  snapshot.players[botPlayerId]?.view.self.hand.some((card) =>
    shanksCardIds.has(String(card.cardId)),
  ) ?? false;

const isOp16CheatLineLive = (context: BotActionContext): boolean =>
  botDonOnField(context) >= 10 && hasShanksInHand(context);

const hasBennOverflowFodder = ({
  snapshot,
  botPlayerId,
}: BotActionContext): boolean => {
  const characters = snapshot.players[botPlayerId]?.view.self.characters ?? [];
  return (
    characters.length < 5 ||
    characters.some((character) => !shanksCardIds.has(String(character.cardId)))
  );
};

const cardPower = (card: PublicCardView | undefined): number | undefined =>
  card?.currentPower ?? card?.printedPower;

const findVisibleBattleCard = (
  context: BotDecisionContext,
  instanceId: string,
): PublicCardView | undefined => {
  const view = context.snapshot.players[context.botPlayerId]?.view;
  if (view === undefined) {
    return undefined;
  }
  return [
    view.self.leader,
    ...view.self.characters,
    view.opponent.leader,
    ...view.opponent.characters,
  ].find((card) => card.instanceId === instanceId);
};

const counterPowerNeededToStop = (
  attackerPower: number,
  targetPower: number,
): number => Math.max(0, attackerPower - targetPower + 1_000);

const visibleHandCounterPower = ({
  snapshot,
  botPlayerId,
}: BotDecisionContext): number =>
  snapshot.players[botPlayerId]?.view.self.hand.reduce(
    (total, card) => total + (card.printedCounter ?? 0),
    0,
  ) ?? 0;

const attackTargetScore = ({
  action,
  snapshot,
  botPlayerId,
}: BotActionContext): number | undefined => {
  const targetId = action.attack?.targetInstanceId;
  if (targetId === undefined) {
    return undefined;
  }
  const opponent = snapshot.players[botPlayerId]?.view.opponent;
  if (opponent === undefined) {
    return undefined;
  }
  if (
    opponent.characters.some((character) => character.instanceId === targetId)
  ) {
    return 35;
  }
  return opponent.leader.instanceId === targetId ? 45 : undefined;
};

const hasOp06RemovalTarget = ({
  snapshot,
  botPlayerId,
}: BotDecisionContext): boolean =>
  snapshot.players[botPlayerId]?.view.opponent.characters.some(
    (character) =>
      (character.currentPower ?? character.printedPower ?? 0) <= 10_000,
  ) ?? false;

const shanksCheatScore = (
  card: CardRef,
  context: BotDecisionContext,
): number => {
  switch (card.cardId) {
    case "OP06-007":
      return hasOp06RemovalTarget(context) ? 400 : 250;
    case "OP09-004":
      return 350;
    case "ST23-002":
      return 300;
    case "OP12-008":
      return 100;
    default:
      return 0;
  }
};

const chooseOp16Shanks = (
  context: BotDecisionContext,
): BotDecisionChoice | undefined => {
  const decision =
    context.snapshot.players[context.botPlayerId]?.view.pendingDecision;
  if (
    decision === undefined ||
    decision.playerId !== context.botPlayerId ||
    decision.type !== "selectCards" ||
    decision.source?.cardId !== (op16BennBeckman as CardId)
  ) {
    return undefined;
  }
  const chosen = decision.choices
    .filter(
      (choice) =>
        choice.selectable && shanksCardIds.has(String(choice.card.cardId)),
    )
    .sort(
      (left, right) =>
        shanksCheatScore(right.card, context) -
        shanksCheatScore(left.card, context),
    )[0]?.card;
  return chosen === undefined
    ? undefined
    : {
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "cards", cards: [chosen] },
      };
};

const chooseLeaderDefense = (
  context: BotDecisionContext,
): BotDecisionChoice | undefined => {
  const decision =
    context.snapshot.players[context.botPlayerId]?.view.pendingDecision;
  if (
    decision === undefined ||
    decision.playerId !== context.botPlayerId ||
    decision.type !== "chooseOptionalActivation" ||
    decision.source?.cardId !== (op09LeaderShanks as CardId)
  ) {
    return undefined;
  }
  const battle = context.snapshot.players[context.botPlayerId]?.view.battle;
  if (battle === undefined) {
    return undefined;
  }
  const attackerPower = cardPower(
    findVisibleBattleCard(context, String(battle.attacker.instanceId)),
  );
  const targetPower = cardPower(
    findVisibleBattleCard(context, String(battle.currentTarget.instanceId)),
  );
  if (attackerPower === undefined || targetPower === undefined) {
    return undefined;
  }
  const currentCounterNeeded = counterPowerNeededToStop(
    attackerPower,
    targetPower,
  );
  if (currentCounterNeeded === 0) {
    return undefined;
  }
  const reducedCounterNeeded = counterPowerNeededToStop(
    attackerPower - 1_000,
    targetPower,
  );
  const view = context.snapshot.players[context.botPlayerId]?.view;
  const isLeaderTarget =
    view?.self.leader.instanceId === battle.currentTarget.instanceId;
  if (
    reducedCounterNeeded > 0 &&
    (!isLeaderTarget ||
      view.self.life.count > 2 ||
      reducedCounterNeeded >= currentCounterNeeded ||
      visibleHandCounterPower(context) < reducedCounterNeeded)
  ) {
    return undefined;
  }
  return {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "optionalActivation", choice: "activate" },
  };
};

const chooseLeaderPowerTarget = (
  context: BotDecisionContext,
): BotDecisionChoice | undefined => {
  const decision =
    context.snapshot.players[context.botPlayerId]?.view.pendingDecision;
  const attacker =
    context.snapshot.players[context.botPlayerId]?.view.battle?.attacker;
  if (
    decision === undefined ||
    attacker === undefined ||
    decision.playerId !== context.botPlayerId ||
    decision.type !== "selectTargets" ||
    decision.source?.cardId !== (op09LeaderShanks as CardId)
  ) {
    return undefined;
  }
  const target = decision.candidates.find(
    (candidate) => candidate.card.instanceId === attacker.instanceId,
  )?.card;
  return target === undefined
    ? undefined
    : {
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "targets", targets: [target] },
      };
};

const searchResultScore = (card: CardRef): number => {
  switch (card.cardId) {
    case "OP16-012":
      return 1_000;
    case "OP09-004":
      return 900;
    case "OP06-007":
      return 850;
    case "ST23-002":
      return 800;
    case "OP12-008":
      return 700;
    case "OP09-011":
      return 650;
    case "OP09-020":
      return 600;
    case "OP09-002":
      return 550;
    case "OP09-009":
      return 500;
    case "OP09-014":
      return 450;
    case "OP16-018":
      return 300;
    default:
      return 0;
  }
};

const chooseSearchResult = (
  context: BotDecisionContext,
): BotDecisionChoice | undefined => {
  const decision =
    context.snapshot.players[context.botPlayerId]?.view.pendingDecision;
  if (
    decision === undefined ||
    decision.playerId !== context.botPlayerId ||
    decision.type !== "selectCards" ||
    !searchSourceCardIds.has(String(decision.source?.cardId))
  ) {
    return undefined;
  }
  const chosen = decision.choices
    .filter((choice) => choice.selectable)
    .sort(
      (left, right) =>
        searchResultScore(right.card) - searchResultScore(left.card),
    )[0]?.card;
  return chosen === undefined
    ? undefined
    : {
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "cards", cards: [chosen] },
      };
};

export const redShanksBotProfile: BotBehaviorProfile = {
  id: "red-shanks",
  scoreAction(context) {
    if (context.action.type === "declareAttack") {
      return attackTargetScore(context);
    }
    const powerReductionScore = scorePowerReductionAction(
      context,
      powerReductionBehaviors,
    );
    if (powerReductionScore !== undefined) {
      return powerReductionScore;
    }
    if (context.action.type !== "playCard") {
      return undefined;
    }
    const card = actionCard(context);
    if (card?.cardId === (op16BennBeckman as CardId)) {
      if (!hasBennOverflowFodder(context)) {
        return false;
      }
      return isOp16CheatLineLive(context) ? -80 : hardCastOp16FallbackScore;
    }
    return card === undefined ? undefined : setupPlayScores.get(card.cardId);
  },
  chooseDecision(context) {
    return (
      chooseLeaderDefense(context) ??
      chooseLeaderPowerTarget(context) ??
      choosePowerReductionTarget(context, powerReductionBehaviors) ??
      chooseCharacterOverflowDecision(context, {
        preserveCardIds: shanksCardIds,
      }) ??
      chooseOp16Shanks(context) ??
      chooseSearchResult(context)
    );
  },
};
