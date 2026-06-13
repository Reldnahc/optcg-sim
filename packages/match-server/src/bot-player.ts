import type {
  DecisionId,
  DecisionResponse,
  InstanceId,
  PlayerId,
  PublicCardView,
} from "@optcg/types";

import type {
  DevMatchSnapshot,
  DevVisibleAction,
} from "./dev-snapshot-types.js";

export interface BotSubmitActionChoice {
  readonly type: "submitAction";
  readonly actionIndex: number;
}

export interface BotDecisionChoice {
  readonly type: "respondToDecision";
  readonly decisionId: DecisionId;
  readonly response: DecisionResponse;
}

export type BotActionChoice = BotSubmitActionChoice | BotDecisionChoice;

const actionPriority = (action: DevVisibleAction): number => {
  if (
    action.type === "respondToDecision" &&
    (action.responseKey === "keep" || action.responseKey === "deny")
  ) {
    return 0;
  }
  if (action.type === "activateEffect") return 10;
  if (action.type === "playCard") return 20;
  if (action.type === "attachDon") return 30;
  if (action.type === "declareAttack") return 40;
  if (action.type === "advanceToMainPhase") return 50;
  if (action.type === "respondToDecision") return 60;
  if (action.type === "endMainPhase") return 90;
  if (action.type === "concede") return 10_000;
  return 100;
};

const cardPower = (card: PublicCardView | undefined): number | undefined =>
  card?.currentPower ?? card?.printedPower;

const visibleCards = (snapshot: DevMatchSnapshot, playerId: PlayerId) => {
  const view = snapshot.players[playerId]?.view;
  if (view === undefined) {
    return [];
  }
  return [
    view.self.leader,
    ...view.self.characters,
    view.opponent.leader,
    ...view.opponent.characters,
  ];
};

const findVisibleCard = (
  snapshot: DevMatchSnapshot,
  playerId: PlayerId,
  instanceId: InstanceId,
): PublicCardView | undefined =>
  visibleCards(snapshot, playerId).find(
    (card) => card.instanceId === instanceId,
  );

const isPowerPositiveAttack = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
  action: DevVisibleAction,
): boolean => {
  if (action.type !== "declareAttack") {
    return true;
  }
  const attack = action.attack;
  if (attack === undefined) {
    return false;
  }
  const attackerPower = cardPower(
    findVisibleCard(snapshot, botPlayerId, attack.attackerInstanceId),
  );
  const targetPower = cardPower(
    findVisibleCard(snapshot, botPlayerId, attack.targetInstanceId),
  );
  return (
    attackerPower !== undefined &&
    targetPower !== undefined &&
    attackerPower >= targetPower
  );
};

export const chooseBotAction = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
): BotActionChoice | undefined => {
  const actions = snapshot.players[botPlayerId]?.actions ?? [];
  const chosen = [...actions]
    .filter((action) => action.type !== "concede")
    .filter((action) => isPowerPositiveAttack(snapshot, botPlayerId, action))
    .sort((left, right) => actionPriority(left) - actionPriority(right))[0];
  if (chosen !== undefined) {
    return { type: "submitAction", actionIndex: chosen.index };
  }
  const decision = snapshot.players[botPlayerId]?.view.pendingDecision;
  if (decision === undefined || decision.playerId !== botPlayerId) {
    return undefined;
  }
  switch (decision.type) {
    case "chooseQuantity":
      return {
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "chooseQuantity", quantity: decision.min },
      };
    case "selectCards":
      return {
        type: "respondToDecision",
        decisionId: decision.id,
        response: {
          type: "cards",
          cards: decision.choices
            .filter((choice) => choice.selectable)
            .slice(0, decision.min)
            .map((choice) => choice.card),
        },
      };
    case "selectTargets":
      return {
        type: "respondToDecision",
        decisionId: decision.id,
        response: {
          type: "targets",
          targets: decision.candidates
            .slice(0, decision.min)
            .map((candidate) => candidate.card),
        },
      };
    case "orderCards": {
      const ids = decision.cards.map((card) => String(card.instanceId));
      return {
        type: "respondToDecision",
        decisionId: decision.id,
        response:
          decision.placement?.type === "topOrBottom"
            ? { type: "topBottomPlacement", topIds: [], bottomIds: ids }
            : { type: "orderedIds", ids },
      };
    }
    case "chooseTriggerOrder": {
      const triggerId = decision.choices[0]?.triggerId;
      return triggerId === undefined
        ? undefined
        : {
            type: "respondToDecision",
            decisionId: decision.id,
            response: { type: "orderedIds", ids: [triggerId] },
          };
    }
    case "chooseReplacement":
      return {
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "replacement" },
      };
    case "confirmLifeTrigger":
      return {
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "lifeTrigger", choice: "addToHand" },
      };
    case "chooseOptionalActivation":
      return {
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "optionalActivation", choice: "decline" },
      };
    case "chooseEffectOption":
      return {
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "effectOptionDeclined" },
      };
    case "mulligan":
      return {
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "mulligan", keep: true },
      };
    case "declareLoopCount":
      return {
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "loopCount", count: 1 },
      };
    case "rollbackConsent":
      return {
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "rollbackConsent", allow: false },
      };
    case "payCost":
      return undefined;
  }
};
