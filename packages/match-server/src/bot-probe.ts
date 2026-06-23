import type {
  CardId,
  CardRef,
  DecisionId,
  InstanceId,
  PlayerId,
  PublicCardView,
  PublicPendingDecisionId,
} from "@optcg/types";

import { chooseBotActionReport } from "./bot-player.js";
import type { BotScoreBreakdown } from "./bot-score.js";
import type { BotTurnIntent } from "./bot-turn-intent.js";
import type { BotActionChoice, BotDecisionReason } from "./bot-types.js";
import type {
  DevMatchSnapshot,
  DevVisibleAction,
} from "./dev-snapshot-types.js";

const botPlayerId = "p2" as PlayerId;
const opponentPlayerId = "p1" as PlayerId;

type BotPendingDecision = NonNullable<
  DevMatchSnapshot["players"][PlayerId]["view"]["pendingDecision"]
>;
type BotPendingDecisionBase<TType extends BotPendingDecision["type"]> = Pick<
  Extract<BotPendingDecision, { type: TType }>,
  | "id"
  | "spotlightPendingId"
  | "type"
  | "playerId"
  | "prompt"
  | "causedBy"
  | "presentation"
>;

export interface BotProbeScenario {
  readonly id: string;
  readonly snapshot: DevMatchSnapshot;
  readonly botPlayerId: PlayerId;
  readonly expectedChoiceRequired: boolean;
}

export interface BotProbeScenarioReport {
  readonly id: string;
  readonly choice: BotActionChoice | undefined;
  readonly intent?: BotTurnIntent | undefined;
  readonly score?: BotScoreBreakdown | undefined;
  readonly decisionReason?: BotDecisionReason | undefined;
  readonly turnLength: number;
}

export interface BotProbeFailure {
  readonly scenarioId: string;
  readonly kind: "stall" | "missing-decision-response";
  readonly message: string;
}

export interface BotProbeReport {
  readonly scenarios: readonly BotProbeScenarioReport[];
  readonly failures: readonly BotProbeFailure[];
}

const cardRef = (instanceId: string, cardId: string = "OP01-001"): CardRef => ({
  instanceId: instanceId as InstanceId,
  cardId: cardId as CardId,
  playerId: botPlayerId,
});

const publicCard = (
  instanceId: string,
  cardId: string,
  fields: Partial<PublicCardView> = {},
): PublicCardView => ({
  instanceId: instanceId as InstanceId,
  cardId: cardId as CardId,
  owner: fields.owner ?? botPlayerId,
  controller: fields.controller ?? botPlayerId,
  zone: fields.zone ?? { playerId: botPlayerId, zone: "characterArea" },
  attachedDonCount: fields.attachedDonCount ?? 0,
  attachedDonIds: fields.attachedDonIds ?? [],
  ...fields,
});

const baseDecision = <TType extends BotPendingDecision["type"]>(
  id: string,
  type: TType,
): BotPendingDecisionBase<TType> =>
  ({
    id: id as DecisionId,
    spotlightPendingId:
      `spotlight:pending:probe:${id}` as PublicPendingDecisionId,
    type,
    playerId: botPlayerId,
    prompt: "Choose.",
    causedBy: { type: "ruleProcess", name: "probe" },
    presentation: { title: "Choose", instruction: "Choose." },
  }) as BotPendingDecisionBase<TType>;

const snapshotWithView = ({
  actions,
  pendingDecision,
  battle,
  selfLeader,
  selfLifeCount = 5,
  selfHand = [],
  selfCharacters = [],
  selfCostArea = [],
  opponentLeader,
  opponentLifeCount = 5,
  opponentHandCount = 0,
  opponentCharacters = [],
}: {
  readonly actions: readonly DevVisibleAction[];
  readonly pendingDecision?: BotPendingDecision | undefined;
  readonly battle?:
    | DevMatchSnapshot["players"][PlayerId]["view"]["battle"]
    | undefined;
  readonly selfLeader?: Partial<PublicCardView>;
  readonly selfLifeCount?: number;
  readonly selfHand?: readonly PublicCardView[];
  readonly selfCharacters?: readonly PublicCardView[];
  readonly selfCostArea?: readonly PublicCardView[];
  readonly opponentLeader?: Partial<PublicCardView>;
  readonly opponentLifeCount?: number;
  readonly opponentHandCount?: number;
  readonly opponentCharacters?: readonly PublicCardView[];
}): DevMatchSnapshot =>
  ({
    stateSeq: 7,
    actionSeq: 3,
    stateHash: "probe",
    status: "active",
    turn: {
      turnNumber: 1,
      turnPlayerId: botPlayerId,
      phase: "main",
      globalTurn: 1,
      playerTurnCounts: { [botPlayerId]: 2, [opponentPlayerId]: 1 },
    },
    activePlayerId: botPlayerId,
    players: {
      [botPlayerId]: {
        view: {
          self: {
            leader: publicCard("bot-leader", "OP09-001", {
              zone: { playerId: botPlayerId, zone: "leaderArea" },
              currentPower: 5_000,
              ...selfLeader,
            }),
            hand: selfHand,
            characters: selfCharacters,
            costArea: selfCostArea,
            life: { count: selfLifeCount, faceUpCards: [] },
          },
          opponent: {
            handCount: opponentHandCount,
            leader: publicCard("opponent-leader", "OP01-002", {
              owner: opponentPlayerId,
              controller: opponentPlayerId,
              zone: { playerId: opponentPlayerId, zone: "leaderArea" },
              currentPower: 5_000,
              ...opponentLeader,
            }),
            life: { count: opponentLifeCount, faceUpCards: [] },
            characters: opponentCharacters,
            costArea: [],
          },
          ...(pendingDecision === undefined ? {} : { pendingDecision }),
          ...(battle === undefined ? {} : { battle }),
        },
        actions,
      },
    },
  }) as unknown as DevMatchSnapshot;

const decisionSnapshot = (
  pendingDecision: BotPendingDecision,
  actions: readonly DevVisibleAction[] = [],
): DevMatchSnapshot =>
  ({
    stateSeq: 7,
    actionSeq: 3,
    stateHash: "probe",
    status: "active",
    turn: {
      turnNumber: 1,
      turnPlayerId: botPlayerId,
      phase: "main",
      globalTurn: 1,
      playerTurnCounts: { [botPlayerId]: 1 },
    },
    activePlayerId: botPlayerId,
    players: {
      [botPlayerId]: {
        view: { pendingDecision },
        actions,
      },
    },
  }) as unknown as DevMatchSnapshot;

export const probeScenarioWithQuantityDecision = (): BotProbeScenario => ({
  id: "quantity-fallback",
  botPlayerId,
  expectedChoiceRequired: true,
  snapshot: decisionSnapshot({
    ...baseDecision("decision:probe:quantity", "chooseQuantity"),
    mode: "upTo",
    min: 0,
    max: 2,
  }),
});

export const probeScenarioWithNoLegalBotChoice = (): BotProbeScenario => ({
  id: "no-legal-choice",
  botPlayerId,
  expectedChoiceRequired: true,
  snapshot: snapshotWithView({ actions: [] }),
});

const emptyBoardEarlyTurn = (): BotProbeScenario => ({
  id: "empty-board-early-turn",
  botPlayerId,
  expectedChoiceRequired: true,
  snapshot: snapshotWithView({
    actions: [{ index: 0, type: "endMainPhase", label: "End turn" }],
  }),
});

const playableCardVsLowValueDon = (): BotProbeScenario => ({
  id: "playable-card-vs-low-value-don",
  botPlayerId,
  expectedChoiceRequired: true,
  snapshot: snapshotWithView({
    actions: [
      {
        index: 0,
        type: "playCard",
        label: "Play attacker",
        placement: { instanceId: "attacker-card" as InstanceId },
      },
      {
        index: 1,
        type: "attachDon",
        label: "Attach DON",
        attachment: {
          donInstanceId: "don-1" as InstanceId,
          targetInstanceId: "bot-leader" as InstanceId,
        },
      },
    ],
    selfHand: [
      publicCard("attacker-card", "OP01-004", {
        zone: { playerId: botPlayerId, zone: "hand" },
        printedCost: 5,
      }),
    ],
    selfCostArea: [
      publicCard("don-1", "DON!!", {
        zone: { playerId: botPlayerId, zone: "costArea" },
      }),
    ],
  }),
});

const lethalAvailable = (): BotProbeScenario => ({
  id: "lethal-available",
  botPlayerId,
  expectedChoiceRequired: true,
  snapshot: snapshotWithView({
    actions: [
      {
        index: 0,
        type: "declareAttack",
        label: "Attack leader",
        attack: {
          attackerInstanceId: "bot-leader" as InstanceId,
          targetInstanceId: "opponent-leader" as InstanceId,
        },
      },
    ],
    selfLeader: { currentPower: 6_000 },
    opponentLifeCount: 0,
  }),
});

const lethalDefense = (): BotProbeScenario => ({
  id: "lethal-defense",
  botPlayerId,
  expectedChoiceRequired: true,
  snapshot: snapshotWithView({
    actions: [
      {
        index: 0,
        type: "useCounter",
        label: "Use counter",
        counter: {
          cardInstanceId: "counter-card" as InstanceId,
          targetInstanceId: "bot-leader" as InstanceId,
        },
      },
    ],
    selfLifeCount: 0,
    selfHand: [
      publicCard("counter-card", "OP01-003", {
        zone: { playerId: botPlayerId, zone: "hand" },
        printedCounter: 2_000,
      }),
    ],
    opponentLeader: { currentPower: 6_000 },
    battle: {
      attacker: cardRef("opponent-leader", "OP01-002"),
      originalTarget: cardRef("bot-leader", "OP09-001"),
      currentTarget: cardRef("bot-leader", "OP09-001"),
      step: "counter",
      damageCount: 1,
    },
  }),
});

const searchDecision = (): BotProbeScenario => ({
  id: "search-decision",
  botPlayerId,
  expectedChoiceRequired: true,
  snapshot: decisionSnapshot({
    ...baseDecision("decision:probe:search", "selectCards"),
    min: 1,
    max: 1,
    source: cardRef("searcher", "OP09-002"),
    candidates: [
      { card: cardRef("choice-low", "OP09-014") },
      { card: cardRef("choice-high", "OP16-012") },
    ],
    choices: [
      { card: cardRef("choice-low", "OP09-014"), selectable: true },
      { card: cardRef("choice-high", "OP16-012"), selectable: true },
    ],
  }),
});

const characterOverflowDecision = (): BotProbeScenario => ({
  id: "character-overflow-decision",
  botPlayerId,
  expectedChoiceRequired: true,
  snapshot: decisionSnapshot({
    ...baseDecision("decision:character-overflow:probe", "selectCards"),
    min: 1,
    max: 1,
    candidates: [
      { card: cardRef("preserve", "OP09-004") },
      { card: cardRef("trash", "OP01-010") },
    ],
    choices: [
      { card: cardRef("preserve", "OP09-004"), selectable: true },
      { card: cardRef("trash", "OP01-010"), selectable: true },
    ],
  }),
});

const optionalCostDecision = (): BotProbeScenario => ({
  id: "optional-cost-decision",
  botPlayerId,
  expectedChoiceRequired: true,
  snapshot: decisionSnapshot({
    ...baseDecision("decision:probe:optional-cost", "payCost"),
  }),
});

const replacementDecision = (): BotProbeScenario => ({
  id: "replacement-decision",
  botPlayerId,
  expectedChoiceRequired: true,
  snapshot: decisionSnapshot({
    ...baseDecision("decision:probe:replacement", "chooseReplacement"),
    presentation: {
      title: "Choose replacement",
      instruction: "Choose replacement.",
      choices: [{ responseKey: "decline", label: "Do not replace" }],
    },
  }),
});

const op16CheatLineDecision = (): BotProbeScenario => ({
  id: "op16-cheat-line",
  botPlayerId,
  expectedChoiceRequired: true,
  snapshot: decisionSnapshot({
    ...baseDecision("decision:probe:op16-cheat", "selectCards"),
    min: 1,
    max: 1,
    source: cardRef("benn", "OP16-012"),
    candidates: [
      { card: cardRef("mihawk", "OP09-004") },
      { card: cardRef("other", "OP01-010") },
    ],
    choices: [
      { card: cardRef("mihawk", "OP09-004"), selectable: true },
      { card: cardRef("other", "OP01-010"), selectable: true },
    ],
  }),
});

const powerReductionTargetDecision = (): BotProbeScenario => ({
  id: "power-reduction-target",
  botPlayerId,
  expectedChoiceRequired: true,
  snapshot: snapshotWithView({
    actions: [],
    pendingDecision: {
      ...baseDecision("decision:probe:power-target", "selectTargets"),
      min: 1,
      max: 1,
      source: cardRef("roo", "OP09-011"),
      candidates: [{ card: cardRef("target", "OP01-010") }],
    },
    selfCharacters: [
      publicCard("attacker", "OP01-004", {
        currentPower: 4_000,
      }),
    ],
    opponentCharacters: [
      publicCard("target", "OP01-010", {
        owner: opponentPlayerId,
        controller: opponentPlayerId,
        zone: { playerId: opponentPlayerId, zone: "characterArea" },
        currentPower: 5_000,
      }),
    ],
  }),
});

export const defaultBotProbeScenarios: readonly BotProbeScenario[] = [
  emptyBoardEarlyTurn(),
  playableCardVsLowValueDon(),
  lethalAvailable(),
  lethalDefense(),
  searchDecision(),
  characterOverflowDecision(),
  optionalCostDecision(),
  replacementDecision(),
  op16CheatLineDecision(),
  powerReductionTargetDecision(),
];

const visibleActionForChoice = (
  scenario: BotProbeScenario,
  choice: BotActionChoice | undefined,
): DevVisibleAction | undefined =>
  choice?.type !== "submitAction"
    ? undefined
    : scenario.snapshot.players[scenario.botPlayerId]?.actions.find(
        (action) => action.index === choice.actionIndex,
      );

const botOwnedPendingDecision = (
  scenario: BotProbeScenario,
): BotPendingDecision | undefined => {
  const decision =
    scenario.snapshot.players[scenario.botPlayerId]?.view.pendingDecision;
  return decision?.playerId === scenario.botPlayerId ? decision : undefined;
};

const isDecisionResponseChoice = (
  scenario: BotProbeScenario,
  pendingDecision: BotPendingDecision,
  choice: BotActionChoice | undefined,
): boolean =>
  choice?.type === "respondToDecision"
    ? choice.decisionId === pendingDecision.id
    : visibleActionForChoice(scenario, choice)?.type === "respondToDecision";

const runOneProbeScenario = (
  scenario: BotProbeScenario,
): BotProbeScenarioReport => {
  const report = chooseBotActionReport({
    snapshot: scenario.snapshot,
    botPlayerId: scenario.botPlayerId,
  });
  return {
    id: scenario.id,
    choice: report?.choice,
    intent: report?.intent,
    score: report?.score,
    decisionReason: report?.decisionReason,
    turnLength:
      scenario.snapshot.players[scenario.botPlayerId]?.actions.length ?? 0,
  };
};

export const evaluateBotProbeFailures = (
  scenario: BotProbeScenario,
  report: BotProbeScenarioReport,
): readonly BotProbeFailure[] => {
  const failures: BotProbeFailure[] = [];
  const pendingDecision = botOwnedPendingDecision(scenario);

  if (scenario.expectedChoiceRequired && report.choice === undefined) {
    failures.push({
      scenarioId: report.id,
      kind: "stall",
      message: "Expected a bot choice, but no choice was returned.",
    });
  }
  if (
    pendingDecision !== undefined &&
    !isDecisionResponseChoice(scenario, pendingDecision, report.choice)
  ) {
    failures.push({
      scenarioId: report.id,
      kind: "missing-decision-response",
      message:
        "Bot-owned pending decision did not produce a decision response.",
    });
  }
  if (report.intent === undefined && report.decisionReason === undefined) {
    failures.push({
      scenarioId: report.id,
      kind: "stall",
      message: "Bot choice is not explained by intent or decision reason.",
    });
  }
  return failures;
};

export const runBotProbe = (
  scenarios: readonly BotProbeScenario[] = defaultBotProbeScenarios,
): BotProbeReport => {
  const reports = scenarios.map(runOneProbeScenario);
  const failures = reports.flatMap((report, index) => {
    const scenario = scenarios[index];
    return scenario === undefined
      ? []
      : evaluateBotProbeFailures(scenario, report);
  });

  return {
    scenarios: reports,
    failures,
  };
};

if (process.argv[1]?.endsWith("bot-probe.ts") === true) {
  const report = runBotProbe();
  process.stdout.write(`${JSON.stringify(report, undefined, 2)}\n`);
  if (report.failures.length > 0) {
    process.exitCode = 1;
  }
}
