import type { PlayerView } from "@optcg/types";

import type { BotDecisionChoice, BotDecisionContext } from "./bot-types.js";
import { chooseCounterCardsForDefense } from "./bot-defense-planner.js";
import { buildBotFeatures } from "./bot-features.js";
import {
  chooseCharacterOverflowDecision,
  isCharacterOverflowDecision,
  selectableCardsForDecision,
} from "./bot-character-overflow.js";
import { chooseCombatDecision } from "./bot-combat-evaluation.js";

const defaultSelectableCardCount = (
  min: number,
  max: number,
  availableCount: number,
): number => {
  if (max <= 0 || availableCount <= 0) {
    return 0;
  }
  return Math.min(Math.max(min, 1), max, availableCount);
};

const unhandledBotDecision = (decision: never): never => {
  throw new Error(`Unhandled bot decision type: ${JSON.stringify(decision)}`);
};

type BotPendingDecision = NonNullable<PlayerView["pendingDecision"]>;

const firstEnabledPresentationChoice = (
  decision: BotPendingDecision,
):
  | {
      readonly responseKey: string;
    }
  | undefined =>
  decision.presentation.choices?.find((choice) => choice.disabled !== true);

export const chooseDefaultBotDecision = ({
  snapshot,
  botPlayerId,
}: BotDecisionContext): BotDecisionChoice | undefined => {
  const decision = snapshot.players[botPlayerId]?.view.pendingDecision;
  if (decision === undefined || decision.playerId !== botPlayerId) {
    return undefined;
  }
  const combatDecision = chooseCombatDecision({ snapshot, botPlayerId });
  if (combatDecision !== undefined) {
    return combatDecision;
  }
  const defenseChoice = chooseCounterCardsForDefense({
    context: { snapshot, botPlayerId },
    features: buildBotFeatures(snapshot, botPlayerId),
  });
  if (defenseChoice !== undefined) {
    return {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "cards", cards: [...defenseChoice.cards] },
    };
  }
  const overflowDecision = chooseCharacterOverflowDecision({
    snapshot,
    botPlayerId,
  });
  if (overflowDecision !== undefined) {
    return overflowDecision;
  }
  switch (decision.type) {
    case "chooseQuantity":
      return {
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "chooseQuantity", quantity: decision.min },
      };
    case "selectCards": {
      const selectableCards = selectableCardsForDecision(decision);
      return {
        type: "respondToDecision",
        decisionId: decision.id,
        response: {
          type: "cards",
          cards: selectableCards.slice(
            0,
            isCharacterOverflowDecision(decision)
              ? Math.min(1, selectableCards.length)
              : defaultSelectableCardCount(
                  decision.min,
                  decision.max,
                  selectableCards.length,
                ),
          ),
        },
      };
    }
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
        ? {
            type: "respondToDecision",
            decisionId: decision.id,
            response: { type: "orderedIds", ids: [] },
          }
        : {
            type: "respondToDecision",
            decisionId: decision.id,
            response: { type: "orderedIds", ids: [triggerId] },
          };
    }
    case "chooseReplacement":
      return (() => {
        const choice = firstEnabledPresentationChoice(decision);
        if (choice === undefined) {
          return undefined;
        }
        return {
          type: "respondToDecision",
          decisionId: decision.id,
          response:
            choice.responseKey === "decline"
              ? { type: "replacement" }
              : { type: "replacement", replacementId: choice.responseKey },
        };
      })();
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
      return (() => {
        const choice = firstEnabledPresentationChoice(decision);
        if (choice === undefined) {
          return undefined;
        }
        return {
          type: "respondToDecision",
          decisionId: decision.id,
          response:
            choice.responseKey === "decline"
              ? { type: "effectOptionDeclined" }
              : { type: "effectOption", optionId: choice.responseKey },
        };
      })();
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
        response: { type: "rollbackConsent", allow: true },
      };
    case "payCost":
      return {
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "paymentDeclined" },
      };
  }
  return unhandledBotDecision(decision);
};
