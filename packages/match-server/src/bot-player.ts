import type { PlayerId } from "@optcg/types";

import type {
  DevMatchSnapshot,
  DevVisibleAction,
} from "./dev-snapshot-types.js";

export interface BotSubmitActionChoice {
  readonly type: "submitAction";
  readonly actionIndex: number;
}

export type BotActionChoice = BotSubmitActionChoice;

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

export const chooseBotAction = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
): BotActionChoice | undefined => {
  const actions = snapshot.players[botPlayerId]?.actions ?? [];
  const chosen = [...actions]
    .filter((action) => action.type !== "concede")
    .sort((left, right) => actionPriority(left) - actionPriority(right))[0];
  return chosen === undefined
    ? undefined
    : { type: "submitAction", actionIndex: chosen.index };
};
