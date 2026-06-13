import type { BotDecisionChoice, BotDecisionContext } from "./bot-types.js";

export const chooseDefaultBotDecision = ({
  snapshot,
  botPlayerId,
}: BotDecisionContext): BotDecisionChoice | undefined => {
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
