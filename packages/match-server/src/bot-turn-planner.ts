import { chooseCombatPlanAction } from "./bot-combat-planner.js";
import type { BotFeatures } from "./bot-features.js";
import type {
  BotExplainableScore,
  BotScoreTerm,
  BotStrategicMode,
  BotTurnPlan,
} from "./bot-types.js";
import type { DevVisibleAction } from "./dev-snapshot-types.js";

export interface BotPlanningConfig {
  readonly maxSteps: number;
  readonly beamWidth: number;
}

export const defaultBotPlanningConfig: BotPlanningConfig = {
  maxSteps: 3,
  beamWidth: 4,
};

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

const actionScore = ({
  action,
  features,
  mode,
  reservation,
  combat,
}: {
  readonly action: DevVisibleAction;
  readonly features: BotFeatures;
  readonly mode: BotStrategicMode;
  readonly reservation: BotDonReservation;
  readonly combat: ReturnType<typeof chooseCombatPlanAction>;
}): BotExplainableScore | undefined =>
  combat?.action.index === action.index
    ? combat.score
    : effectScore(action) ??
      attachmentScore({ action, features, mode, reservation }) ??
      playableDevelopmentScore(action, mode);

const actionConsumesAttacker = (
  action: DevVisibleAction,
): string | undefined =>
  action.type === "declareAttack" && action.attack !== undefined
    ? String(action.attack.attackerInstanceId)
    : undefined;

const actionConsumesDon = (action: DevVisibleAction): number =>
  action.type === "attachDon" ? 1 : 0;

const sequenceIsCoherent = (
  actions: readonly DevVisibleAction[],
): boolean => {
  const consumedAttackers = new Set<string>();
  let consumedDon = 0;
  for (const action of actions) {
    const attacker = actionConsumesAttacker(action);
    if (attacker !== undefined) {
      if (consumedAttackers.has(attacker)) {
        return false;
      }
      consumedAttackers.add(attacker);
    }
    consumedDon += actionConsumesDon(action);
  }
  return consumedDon <= actions.length;
};

const orderingBonus = (
  sequence: readonly DevVisibleAction[],
  mode: BotStrategicMode,
): BotScoreTerm[] => {
  const firstAttackIndex = sequence.findIndex(
    (action) => action.type === "declareAttack",
  );
  const firstPlayIndex = sequence.findIndex(
    (action) => action.type === "playCard",
  );
  return [
    {
      key: "ordering",
      value:
        firstAttackIndex >= 0 &&
        firstPlayIndex >= 0 &&
        firstAttackIndex < firstPlayIndex &&
        (mode === "pressure" || mode === "lethal")
          ? 140
          : 0,
      reason: "attack before development in pressure/lethal mode",
    },
    {
      key: "ordering",
      value:
        firstPlayIndex >= 0 &&
        firstAttackIndex >= 0 &&
        firstPlayIndex < firstAttackIndex &&
        mode === "develop"
          ? 100
          : 0,
      reason: "develop before pressure in develop mode",
    },
  ];
};

interface ScoredPlannedAction {
  readonly action: DevVisibleAction;
  readonly score: BotExplainableScore;
}

const sequenceScore = (
  sequence: readonly ScoredPlannedAction[],
  mode: BotStrategicMode,
): BotExplainableScore => {
  const stepTerms = sequence.flatMap((step) => step.score.terms);
  return score([...stepTerms, ...orderingBonus(sequence.map((step) => step.action), mode)]);
};

const appendCoherentSequences = ({
  allActions,
  current,
  maxSteps,
  output,
}: {
  readonly allActions: readonly ScoredPlannedAction[];
  readonly current: readonly ScoredPlannedAction[];
  readonly maxSteps: number;
  readonly output: ScoredPlannedAction[][];
}): void => {
  if (current.length > 0) {
    output.push([...current]);
  }
  if (current.length >= maxSteps) {
    return;
  }
  for (const candidate of allActions) {
    if (
      current.some((step) => step.action.index === candidate.action.index)
    ) {
      continue;
    }
    const next = [...current, candidate];
    if (!sequenceIsCoherent(next.map((step) => step.action))) {
      continue;
    }
    appendCoherentSequences({ allActions, current: next, maxSteps, output });
  }
};

export const chooseTurnPlan = ({
  actions,
  features,
  mode,
  config = defaultBotPlanningConfig,
}: {
  readonly actions: readonly DevVisibleAction[];
  readonly features: BotFeatures;
  readonly mode: BotStrategicMode;
  readonly config?: BotPlanningConfig | undefined;
}): BotTurnPlan | undefined => {
  const reservation = chooseDonReservation({ actions, features, mode });
  const combat = chooseCombatPlanAction({ actions, features, mode });
  const candidates = actions
    .flatMap((action) => {
      const scored = actionScore({
        action,
        features,
        mode,
        reservation,
        combat,
      });
      return scored === undefined ? [] : [{ action, score: scored }];
    })
    .sort((left, right) => right.score.total - left.score.total)
    .slice(0, config.beamWidth);
  if (candidates.length === 0) {
    return undefined;
  }
  const sequences: ScoredPlannedAction[][] = [];
  appendCoherentSequences({
    allActions: candidates,
    current: [],
    maxSteps: config.maxSteps,
    output: sequences,
  });
  const best = sequences
    .map((sequence) => ({ sequence, score: sequenceScore(sequence, mode) }))
    .sort((left, right) => right.score.total - left.score.total)[0];
  if (best === undefined) {
    return undefined;
  }
  return {
    mode,
    steps: best.sequence.map((step) => ({
      actionIndex: step.action.index,
      actionType: step.action.type,
      label: step.action.label,
      score: step.score,
    })),
    score: best.score,
    summary: `${mode}: ${best.sequence.map((step) => step.action.type).join(" -> ")}`,
  };
};
