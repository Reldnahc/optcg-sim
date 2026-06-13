import type {
  DecisionId,
  DecisionResponse,
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
}

export interface BotDecisionChoice {
  readonly type: "respondToDecision";
  readonly decisionId: DecisionId;
  readonly response: DecisionResponse;
}

export type BotActionChoice = BotSubmitActionChoice | BotDecisionChoice;

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
  }) => BotActionChoice | undefined;
}

export type BotVisibleCard = PublicCardView;
