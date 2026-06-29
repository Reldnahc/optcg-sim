import { chooseCombatPlanAction } from "./bot-combat-planner.js";
import type { BotFeatures } from "./bot-features.js";
import type {
  BotExplainableScore,
  BotScoreTerm,
  BotStrategicMode,
  BotTurnPlan,
} from "./bot-types.js";
import type { DevVisibleAction } from "./dev-snapshot-types.js";

const score = (terms: readonly BotScoreTerm[]): BotExplainableScore => ({
  total: terms.reduce((total, term) => total + term.value, 0),
  terms: terms.filter((term) => term.value !== 0),
});

const term = (
  key: string,
  value: number,
  reason: string,
): BotScoreTerm => ({ key, value, reason });

const playableDevelopmentScore = (
  action: DevVisibleAction,
  mode: BotStrategicMode,
): BotExplainableScore | undefined => {
  if (action.type !== "playCard") {
    return undefined;
  }
  return score([
    term("development", mode === "develop" ? 260 : 140, "persistent board"),
    term("tempo", 80, "spend DON on board"),
  ]);
};

const effectScore = (
  action: DevVisibleAction,
): BotExplainableScore | undefined =>
  action.type === "activateEffect"
    ? score([term("effect", 180, "use available effect")])
    : undefined;

interface BotDonReservation {
  readonly reservedForPlay: number;
  readonly freeForPressure: number;
  readonly reason: string;
}

const actionPrintedCost = (
  action: DevVisibleAction,
  features: BotFeatures,
): number => {
  const placementId = action.placement?.instanceId;
  if (action.type !== "playCard" || placementId === undefined) {
    return 0;
  }
  const card = features.cards.byInstanceId.get(String(placementId));
  return card?.currentCost ?? card?.printedCost ?? 0;
};

const chooseDonReservation = ({
  actions,
  features,
  mode,
}: {
  readonly actions: readonly DevVisibleAction[];
  readonly features: BotFeatures;
  readonly mode: BotStrategicMode;
}): BotDonReservation => {
  if (mode === "lethal") {
    return {
      reservedForPlay: 0,
      freeForPressure: features.self.activeDonCount,
      reason: "lethal mode uses DON for pressure",
    };
  }
  const bestPlayableCost = Math.max(
    0,
    ...actions.map((action) => actionPrintedCost(action, features)),
  );
  const reservedForPlay = Math.min(
    bestPlayableCost,
    features.self.activeDonCount,
  );
  return {
    reservedForPlay,
    freeForPressure: Math.max(0, features.self.activeDonCount - reservedForPlay),
    reason:
      reservedForPlay > 0
        ? "reserve DON for board development"
        : "no play reservation",
  };
};

const attachmentScore = ({
  action,
  features,
  mode,
  reservation,
}: {
  readonly action: DevVisibleAction;
  readonly features: BotFeatures;
  readonly mode: BotStrategicMode;
  readonly reservation: BotDonReservation;
}): BotExplainableScore | undefined => {
  if (action.type !== "attachDon") {
    return undefined;
  }
  const facts = features.actions.byIndex.get(action.index);
  if (facts?.hasUsefulDonAttachment !== true) {
    return undefined;
  }
  const reservedPenalty =
    reservation.freeForPressure <= 0 &&
    facts.donAttachmentUse !== "makeLive" &&
    facts.donAttachmentUse !== "setup"
      ? -300
      : 0;
  const modeBonus = mode === "lethal" ? 180 : mode === "pressure" ? 120 : 0;
  const liveAttackBonus =
    facts.donAttachmentUse === "makeLive" || facts.donAttachmentUse === "setup"
      ? 240
      : 0;
  return score([
    term("don-pressure", 120, "use DON for meaningful attack pressure"),
    term("don-pressure", liveAttackBonus, "make an attack live"),
    term("don-mode", modeBonus, `${mode} mode values DON pressure`),
    term("don-reservation", reservedPenalty, reservation.reason),
  ]);
};

export const chooseTurnPlan = ({
  actions,
  features,
  mode,
}: {
  readonly actions: readonly DevVisibleAction[];
  readonly features: BotFeatures;
  readonly mode: BotStrategicMode;
}): BotTurnPlan | undefined => {
  const reservation = chooseDonReservation({ actions, features, mode });
  const combat = chooseCombatPlanAction({ actions, features, mode });
  const candidates = [
    ...actions.flatMap((action) => {
      const actionScore =
        effectScore(action) ??
        attachmentScore({ action, features, mode, reservation }) ??
        playableDevelopmentScore(action, mode);
      return actionScore === undefined
        ? []
        : [{ action, score: actionScore }];
    }),
    ...(combat === undefined ? [] : [combat]),
  ].sort((left, right) => right.score.total - left.score.total);
  const best = candidates[0];
  if (best === undefined) {
    return undefined;
  }
  return {
    mode,
    steps: [
      {
        actionIndex: best.action.index,
        actionType: best.action.type,
        label: best.action.label,
        score: best.score,
      },
    ],
    score: best.score,
    summary: `${mode}: ${best.action.type}`,
  };
};
