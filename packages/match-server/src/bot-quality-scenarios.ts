import type {
  CardId,
  CardRef,
  DecisionId,
  EffectId,
  InstanceId,
  PlayerId,
  PublicCardView,
  PublicPendingDecisionId,
  QueueEntryId,
} from "@optcg/types";

import type { BotProbeScenario } from "./bot-probe.js";
import type {
  DevMatchSnapshot,
  DevVisibleAction,
} from "./dev-snapshot-types.js";

const botPlayerId = "p2" as PlayerId;
const opponentPlayerId = "p1" as PlayerId;

type BotPendingDecision = NonNullable<
  DevMatchSnapshot["players"][PlayerId]["view"]["pendingDecision"]
>;

export const botQualityScenarioIds = [
  "develop-before-low-value-don",
  "pressure-low-life-leader",
  "remove-high-value-rested-character",
  "take-early-nonlethal-life",
  "counter-lethal-leader-attack",
  "preserve-high-counter-card",
  "search-profile-priority",
  "pay-low-value-cost",
] as const;

export type BotQualityScenarioId = (typeof botQualityScenarioIds)[number];

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
): Pick<
  Extract<BotPendingDecision, { type: TType }>,
  | "id"
  | "spotlightPendingId"
  | "type"
  | "playerId"
  | "prompt"
  | "causedBy"
  | "presentation"
> =>
  ({
    id: id as DecisionId,
    spotlightPendingId:
      `spotlight:pending:quality:${id}` as PublicPendingDecisionId,
    type,
    playerId: botPlayerId,
    prompt: "Choose.",
    causedBy: { type: "ruleProcess", name: "quality" },
    presentation: { title: "Choose", instruction: "Choose." },
  }) as Pick<
    Extract<BotPendingDecision, { type: TType }>,
    | "id"
    | "spotlightPendingId"
    | "type"
    | "playerId"
    | "prompt"
    | "causedBy"
    | "presentation"
  >;

const snapshotWithView = ({
  actions,
  pendingDecision,
  battle,
  selfLifeCount = 5,
  selfHand = [],
  selfCharacters = [],
  selfCostArea = [],
  opponentLifeCount = 5,
  opponentHandCount = 5,
  opponentCharacters = [],
  opponentLeader,
}: {
  readonly actions: readonly DevVisibleAction[];
  readonly pendingDecision?: BotPendingDecision | undefined;
  readonly battle?:
    | DevMatchSnapshot["players"][PlayerId]["view"]["battle"]
    | undefined;
  readonly selfLifeCount?: number;
  readonly selfHand?: readonly PublicCardView[];
  readonly selfCharacters?: readonly PublicCardView[];
  readonly selfCostArea?: readonly PublicCardView[];
  readonly opponentLifeCount?: number;
  readonly opponentHandCount?: number;
  readonly opponentCharacters?: readonly PublicCardView[];
  readonly opponentLeader?: Partial<PublicCardView>;
}): DevMatchSnapshot =>
  ({
    stateSeq: 11,
    actionSeq: 5,
    stateHash: "quality",
    status: "active",
    turn: {
      turnNumber: 3,
      turnPlayerId: botPlayerId,
      phase: "main",
      globalTurn: 3,
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
            }),
            hand: selfHand,
            characters: selfCharacters,
            costArea: selfCostArea,
            life: { count: selfLifeCount, faceUpCards: [] },
          },
          opponent: {
            handCount: opponentHandCount,
            leader: publicCard("opponent-leader", "OP01-001", {
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

const scenario = (
  id: BotQualityScenarioId,
  snapshot: DevMatchSnapshot,
): BotProbeScenario => ({
  id,
  botPlayerId,
  expectedChoiceRequired: true,
  snapshot,
});

const developBeforeLowValueDonScenario = (): BotProbeScenario =>
  scenario(
    "develop-before-low-value-don",
    snapshotWithView({
      actions: [
        {
          index: 0,
          type: "playCard",
          label: "Play body",
          placement: { instanceId: "body" as InstanceId },
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
        publicCard("body", "OP01-004", {
          zone: { playerId: botPlayerId, zone: "hand" },
          printedCost: 5,
          printedPower: 6_000,
        }),
      ],
      selfCostArea: [
        publicCard("don-1", "DON!!", {
          zone: { playerId: botPlayerId, zone: "costArea" },
          state: "active",
        }),
      ],
    }),
  );

const pressureLowLifeLeaderScenario = (): BotProbeScenario =>
  scenario(
    "pressure-low-life-leader",
    snapshotWithView({
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
      opponentLifeCount: 1,
      opponentHandCount: 2,
      opponentLeader: { currentPower: 5_000 },
    }),
  );

const removeHighValueRestedCharacterScenario = (): BotProbeScenario =>
  scenario(
    "remove-high-value-rested-character",
    snapshotWithView({
      actions: [
        {
          index: 0,
          type: "playCard",
          label: "Play setup",
          placement: { instanceId: "setup" as InstanceId },
        },
        {
          index: 1,
          type: "declareAttack",
          label: "Attack threat",
          attack: {
            attackerInstanceId: "bot-character" as InstanceId,
            targetInstanceId: "opponent-threat" as InstanceId,
          },
        },
      ],
      selfHand: [
        publicCard("setup", "OP09-002", {
          zone: { playerId: botPlayerId, zone: "hand" },
          printedCost: 1,
        }),
      ],
      selfCharacters: [
        publicCard("bot-character", "OP01-004", {
          currentPower: 8_000,
        }),
      ],
      opponentCharacters: [
        publicCard("opponent-threat", "OP01-005", {
          owner: opponentPlayerId,
          controller: opponentPlayerId,
          zone: { playerId: opponentPlayerId, zone: "characterArea" },
          currentPower: 8_000,
          printedCost: 8,
          state: "rested",
        }),
      ],
    }),
  );

const takeEarlyNonlethalLifeScenario = (): BotProbeScenario =>
  scenario(
    "take-early-nonlethal-life",
    snapshotWithView({
      actions: [],
      selfLifeCount: 5,
      battle: {
        attacker: cardRef("opponent-leader", "OP01-001"),
        originalTarget: cardRef("bot-leader", "OP09-001"),
        currentTarget: cardRef("bot-leader", "OP09-001"),
        step: "counter",
        damageCount: 1,
      },
      pendingDecision: {
        ...baseDecision("take-early-life", "selectCards"),
        prompt: "Select counter cards.",
        min: 0,
        max: 1,
        candidates: [],
        choices: [],
      },
    }),
  );

const counterLethalLeaderAttackScenario = (): BotProbeScenario =>
  scenario(
    "counter-lethal-leader-attack",
    snapshotWithView({
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
        attacker: cardRef("opponent-leader", "OP01-001"),
        originalTarget: cardRef("bot-leader", "OP09-001"),
        currentTarget: cardRef("bot-leader", "OP09-001"),
        step: "counter",
        damageCount: 1,
      },
    }),
  );

const preserveHighCounterCardScenario = (): BotProbeScenario =>
  scenario(
    "preserve-high-counter-card",
    snapshotWithView({
      actions: [
        {
          index: 0,
          type: "playCard",
          label: "Play high counter",
          placement: { instanceId: "high-counter" as InstanceId },
        },
        { index: 1, type: "endMainPhase", label: "End main" },
      ],
      selfHand: [
        publicCard("high-counter", "OP09-011", {
          zone: { playerId: botPlayerId, zone: "hand" },
          printedCounter: 2_000,
        }),
      ],
    }),
  );

const searchProfilePriorityScenario = (): BotProbeScenario =>
  scenario(
    "search-profile-priority",
    snapshotWithView({
      actions: [],
      pendingDecision: {
        ...baseDecision("search-profile-priority", "selectCards"),
        source: cardRef("searcher", "OP09-002"),
        min: 1,
        max: 1,
        candidates: [
          { card: cardRef("choice-low", "OP09-014") },
          { card: cardRef("choice-high", "OP16-012") },
        ],
        choices: [
          { card: cardRef("choice-low", "OP09-014"), selectable: true },
          { card: cardRef("choice-high", "OP16-012"), selectable: true },
        ],
      },
    }),
  );

const payLowValueCostScenario = (): BotProbeScenario =>
  scenario(
    "pay-low-value-cost",
    snapshotWithView({
      actions: [],
      selfHand: [
        publicCard("low-value-card", "OP01-010", {
          zone: { playerId: botPlayerId, zone: "hand" },
          printedPower: 1_000,
          printedCost: 1,
        }),
        publicCard("high-value-card", "OP09-004", {
          zone: { playerId: botPlayerId, zone: "hand" },
          printedPower: 12_000,
          printedCost: 10,
        }),
      ],
      pendingDecision: {
        ...baseDecision("pay-low-value-cost", "selectCards"),
        prompt: "Trash a card from hand to pay the cost.",
        causedBy: {
          type: "effect",
          queueEntryId: "queue:pay-low-value-cost" as QueueEntryId,
          effectId: "effect:pay-low-value-cost" as EffectId,
        },
        min: 1,
        max: 1,
        candidates: [
          { card: cardRef("low-value-card") },
          { card: cardRef("high-value-card", "OP09-004") },
        ],
        choices: [
          { card: cardRef("low-value-card"), selectable: true },
          {
            card: cardRef("high-value-card", "OP09-004"),
            selectable: true,
          },
        ],
      },
    }),
  );

export const botQualityScenarios = (): readonly BotProbeScenario[] => [
  developBeforeLowValueDonScenario(),
  pressureLowLifeLeaderScenario(),
  removeHighValueRestedCharacterScenario(),
  takeEarlyNonlethalLifeScenario(),
  counterLethalLeaderAttackScenario(),
  preserveHighCounterCardScenario(),
  searchProfilePriorityScenario(),
  payLowValueCostScenario(),
];

export const expectedActionTypeByScenarioId: ReadonlyMap<string, string> =
  new Map([
    ["develop-before-low-value-don", "playCard"],
    ["pressure-low-life-leader", "declareAttack"],
    ["remove-high-value-rested-character", "declareAttack"],
    ["counter-lethal-leader-attack", "useCounter"],
  ]);
