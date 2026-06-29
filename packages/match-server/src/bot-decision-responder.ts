import type { PlayerId, PlayerView } from "@optcg/types";

import { chooseGenericBotDecision } from "./bot-decision-planner.js";
import { chooseDefaultBotDecision } from "./bot-default-profile.js";
import type {
  BotBehaviorProfile,
  BotDecisionResponseChoice,
} from "./bot-types.js";
import type {
  DevMatchSnapshot,
  DevVisibleAction,
} from "./dev-snapshot-types.js";

type BotPendingDecision = NonNullable<PlayerView["pendingDecision"]>;

export interface BotDecisionResponseInput {
  readonly snapshot: DevMatchSnapshot;
  readonly botPlayerId: PlayerId;
  readonly profile: BotBehaviorProfile;
  readonly visibleActions: readonly DevVisibleAction[];
}

const visibleDecisionActionUtility = (
  action: DevVisibleAction,
  pendingDecision: BotPendingDecision | undefined,
): number | undefined => {
  if (action.type !== "respondToDecision") {
    return undefined;
  }
  if (action.decisionPayment?.kind === "cardCost") {
    return 1_200;
  }
  if (
    action.decisionPayment?.kind === "paymentDeclined" ||
    action.responseKey === "decline"
  ) {
    return pendingDecision?.type === "payCost" ? 100 : 50;
  }
  if (pendingDecision?.type === "payCost") {
    return 1_200;
  }
  if (action.responseKey === "keep" || action.responseKey === "deny") {
    return 1_000;
  }
  return 150;
};

const chooseBestVisibleDecisionAction = (
  actions: readonly DevVisibleAction[],
  pendingDecision: BotPendingDecision | undefined,
): DevVisibleAction | undefined =>
  actions
    .flatMap((action) => {
      const utility = visibleDecisionActionUtility(action, pendingDecision);
      return utility === undefined ? [] : [{ action, utility }];
    })
    .sort((left, right) => right.utility - left.utility)[0]?.action;

const battleSelectCardsDecisionNeedsDirectPlanning = ({
  snapshot,
  botPlayerId,
  decision,
}: {
  readonly snapshot: DevMatchSnapshot;
  readonly botPlayerId: PlayerId;
  readonly decision: BotPendingDecision;
}): boolean =>
  decision.type === "selectCards" &&
  snapshot.players[botPlayerId]?.view.battle !== undefined;

export const chooseBotDecisionResponse = ({
  snapshot,
  botPlayerId,
  profile,
  visibleActions,
}: BotDecisionResponseInput): BotDecisionResponseChoice | undefined => {
  const decision = snapshot.players[botPlayerId]?.view.pendingDecision;
  if (decision === undefined || decision.playerId !== botPlayerId) {
    return undefined;
  }
  const profileChoice = profile.chooseDecision?.({ snapshot, botPlayerId });
  if (profileChoice !== undefined) {
    return {
      choice: profileChoice,
      reason:
        profile.id === undefined
          ? { kind: "profile" }
          : { kind: "profile", profileId: profile.id },
    };
  }
  if (
    battleSelectCardsDecisionNeedsDirectPlanning({
      snapshot,
      botPlayerId,
      decision,
    })
  ) {
    const battleDecision = chooseDefaultBotDecision({ snapshot, botPlayerId });
    if (battleDecision !== undefined) {
      return {
        choice: battleDecision,
        reason: { kind: "fallback", decisionType: decision.type },
      };
    }
  }
  const genericDecision = chooseGenericBotDecision({ snapshot, botPlayerId });
  if (genericDecision !== undefined) {
    return {
      choice: genericDecision,
      reason: { kind: "fallback", decisionType: decision.type },
    };
  }
  const visibleAction = chooseBestVisibleDecisionAction(
    visibleActions,
    decision,
  );
  if (visibleAction !== undefined) {
    return {
      choice: { type: "submitAction", actionIndex: visibleAction.index },
      reason: { kind: "visible-action", actionIndex: visibleAction.index },
    };
  }
  const fallback = chooseDefaultBotDecision({ snapshot, botPlayerId });
  return fallback === undefined
    ? undefined
    : {
        choice: fallback,
        reason: { kind: "fallback", decisionType: decision.type },
      };
};
