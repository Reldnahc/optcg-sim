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
  readonly selectedDonInstanceIds?: readonly InstanceId[];
}

export interface BotDecisionChoice {
  readonly type: "respondToDecision";
  readonly decisionId: DecisionId;
  readonly response: DecisionResponse;
}

export type BotActionChoice = BotSubmitActionChoice | BotDecisionChoice;

export type BotDecisionReason =
  | { readonly kind: "profile"; readonly profileId?: string }
  | { readonly kind: "visible-action"; readonly actionIndex: number }
  | { readonly kind: "fallback"; readonly decisionType: string }
  | { readonly kind: "counter-step-pass" };

export interface BotDecisionResponseChoice {
  readonly choice: BotActionChoice;
  readonly reason: BotDecisionReason;
}

export interface BotScoreTerm {
  readonly key: string;
  readonly value: number;
  readonly reason: string;
}

export interface BotExplainableScore {
  readonly total: number;
  readonly terms: readonly BotScoreTerm[];
}

export interface BotPlanStep {
  readonly actionIndex: number;
  readonly actionType: string;
  readonly label: string;
  readonly score: BotExplainableScore;
}

export interface BotTurnPlan {
  readonly mode: BotStrategicMode;
  readonly steps: readonly BotPlanStep[];
  readonly score: BotExplainableScore;
  readonly summary: string;
}

export interface BotRejectedCandidate {
  readonly actionIndex: number;
  readonly actionType: string;
  readonly reason: string;
}

export interface BotDeckCardKnowledge {
  readonly cardId: string;
  readonly count: number;
  readonly printedCounter: number;
  readonly roles: readonly string[];
}

export interface BotCounterPrior {
  readonly unknownCardCount: number;
  readonly totalCounterPower: number;
  readonly counter1000Count: number;
  readonly counter2000Count: number;
  readonly averageCounterPower: number;
}

export interface BotOpponentDeckKnowledge {
  readonly knownDecklistCardIds: readonly string[];
  readonly remainingUnknownCounterPrior: BotCounterPrior;
  readonly remainingEventCount: number;
  readonly remainingBlockerCount: number;
  readonly remainingRemovalCount: number;
}

export type BotStrategicMode =
  | "survive"
  | "stabilize"
  | "develop"
  | "pressure"
  | "lethal"
  | "cleanup";

export interface BotActionContext {
  readonly snapshot: DevMatchSnapshot;
  readonly botPlayerId: PlayerId;
  readonly action: DevVisibleAction;
  readonly relatedCards: readonly BotVisibleCard[];
}

export interface BotDecisionContext {
  readonly snapshot: DevMatchSnapshot;
  readonly botPlayerId: PlayerId;
}

export interface BotBehaviorProfile {
  readonly id?: string;
  readonly cardBehaviors?: Partial<Record<string, BotCardBehavior>>;
  readonly scoreAction?: (
    context: BotActionContext,
  ) => number | false | undefined;
  readonly chooseDecision?: (
    context: BotDecisionContext,
  ) => BotDecisionChoice | undefined;
}

export interface BotCardBehavior {
  readonly scoreAction?: (
    context: BotActionContext,
  ) => number | false | undefined;
}

export interface BotStrategy {
  readonly chooseAction: (input: {
    readonly snapshot: DevMatchSnapshot;
    readonly botPlayerId: PlayerId;
    readonly opponentDeckKnowledge?: BotOpponentDeckKnowledge | undefined;
  }) => BotActionChoice | undefined;
}

export type BotVisibleCard = PublicCardView;
