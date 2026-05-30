import type {
  CardInstance,
  DecisionId,
  GameState,
  LegalAction,
  PaymentOption,
  PlayerId,
} from "@optcg/types";

import { toDecisionId } from "./action-results.js";

const playCardDecisionPrefix = "decision:playCard:cost:";
const characterOverflowDecisionPrefix = "decision:playCard:overflow:";
const runtimePlaySelectedOverflowDecisionPrefix =
  "decision:runtime:playSelected:overflow:";
const runtimePlaySourceOverflowDecisionPrefix =
  "decision:runtime:playSource:overflow:";

export const getPlayCardPendingDecisionLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  const actions: LegalAction[] = [];
  const decision = state.pendingDecision;
  const player = state.players[playerId];
  if (decision === undefined || player === undefined) {
    return actions;
  }
  if (
    decision.type === "payCost" &&
    decision.playerId === playerId &&
    parsePlayCardDecisionInstanceId(decision.id) !== null
  ) {
    const count = getRestDonCount(decision.paymentOptions);
    if (count !== null) {
      const activeDonIds = player.costArea
        .filter((card) => card.state === "active")
        .map((card) => card.instanceId);
      const combos = chooseDonCombos(activeDonIds, count);
      for (const combo of combos) {
        actions.push({
          type: "respondToDecision",
          decisionId: decision.id,
          response: {
            type: "payment",
            optionId: decision.paymentOptions[0]?.id ?? "restDon",
            selectedDonInstanceIds: combo,
          },
        });
      }
    }
  } else if (
    decision.type === "selectCards" &&
    decision.playerId === playerId &&
    (parseCharacterOverflowDecisionInstanceId(decision.id) !== null ||
      parseRuntimePlaySelectedOverflowDecisionInstanceId(decision.id) !==
        null ||
      parseRuntimePlaySourceOverflowDecisionInstanceId(decision.id) !== null)
  ) {
    for (const candidate of decision.candidates) {
      actions.push({
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "cards", cards: [candidate.card] },
      });
    }
  }
  return actions;
};

export const getPlayCardDecisionId = (
  state: GameState,
  card: CardInstance,
): DecisionId =>
  toDecisionId(
    `${playCardDecisionPrefix}${String(card.instanceId)}:${String(state.seq + 1)}`,
  );

export const getPlayCardDecisionPrompt = (card: CardInstance): string =>
  `Pay cost to play ${String(card.cardId)}`;

export const parsePlayCardDecisionInstanceId = (
  decisionId: DecisionId,
): CardInstance["instanceId"] | null => {
  return parseDecisionInstanceId(decisionId, playCardDecisionPrefix);
};

export const getCharacterOverflowDecisionId = (
  state: GameState,
  card: CardInstance,
): DecisionId =>
  toDecisionId(
    `${characterOverflowDecisionPrefix}${String(card.instanceId)}:${String(state.seq + 1)}`,
  );

export const parseCharacterOverflowDecisionInstanceId = (
  decisionId: DecisionId,
): CardInstance["instanceId"] | null =>
  parseDecisionInstanceId(decisionId, characterOverflowDecisionPrefix);

export const getRuntimePlaySelectedOverflowDecisionId = (
  state: GameState,
  card: CardInstance,
): DecisionId =>
  toDecisionId(
    `${runtimePlaySelectedOverflowDecisionPrefix}${String(card.instanceId)}:${String(state.seq + 1)}`,
  );

export const parseRuntimePlaySelectedOverflowDecisionInstanceId = (
  decisionId: DecisionId,
): CardInstance["instanceId"] | null =>
  parseDecisionInstanceId(
    decisionId,
    runtimePlaySelectedOverflowDecisionPrefix,
  );

export const getRuntimePlaySourceOverflowDecisionId = (
  state: GameState,
  card: CardInstance,
): DecisionId =>
  toDecisionId(
    `${runtimePlaySourceOverflowDecisionPrefix}${String(card.instanceId)}:${String(state.seq + 1)}`,
  );

export const parseRuntimePlaySourceOverflowDecisionInstanceId = (
  decisionId: DecisionId,
): CardInstance["instanceId"] | null =>
  parseDecisionInstanceId(decisionId, runtimePlaySourceOverflowDecisionPrefix);

export const chooseDonCombos = (
  source: readonly CardInstance["instanceId"][],
  count: number,
): CardInstance["instanceId"][][] => {
  if (count === 0) {
    return [[]];
  }
  if (count > source.length) {
    return [];
  }
  const result: CardInstance["instanceId"][][] = [];
  const current: CardInstance["instanceId"][] = [];
  const walk = (start: number): void => {
    if (current.length === count) {
      result.push([...current]);
      return;
    }
    for (let i = start; i <= source.length - (count - current.length); i += 1) {
      const candidate = source[i];
      if (candidate === undefined) {
        continue;
      }
      current.push(candidate);
      walk(i + 1);
      current.pop();
    }
  };
  walk(0);
  return result;
};

export const getRestDonCount = (
  options: readonly PaymentOption[],
): number | null => {
  if (options.length !== 1) {
    return null;
  }
  const option = options[0];
  if (option === undefined || option.type !== "restDon") {
    return null;
  }
  return option.count;
};

const parseDecisionInstanceId = (
  decisionId: DecisionId,
  prefix: string,
): CardInstance["instanceId"] | null => {
  const value = String(decisionId);
  if (!value.startsWith(prefix)) {
    return null;
  }
  const suffix = value.slice(prefix.length);
  const sequenceSeparator = suffix.lastIndexOf(":");
  if (sequenceSeparator <= 0) {
    return null;
  }
  return suffix.slice(0, sequenceSeparator) as CardInstance["instanceId"];
};
