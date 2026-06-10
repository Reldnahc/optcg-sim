import type {
  DecisionId,
  EffectId,
  InstanceId,
  PlayerRef,
  PlayerId,
  QueueEntryId,
  Zone,
} from "./primitives.js";
import type { CardRef } from "./card-metadata.js";
import type { CausalityRef, EventVisibility } from "./events.js";
import type {
  Cardinality,
  CardFilter,
  CardSelectionRequest,
  Cost,
  Duration,
  EffectOption,
  ExactCardinality,
  MultiZoneTargetRequest,
  OptionalCost,
  Target,
  TargetRequest,
} from "./effects.js";

export interface PaymentSpec {
  optionId: string;
  selectedCardInstanceIds?: InstanceId[];
  selectedDonInstanceIds?: InstanceId[];
}

export type PaymentOption =
  | { id: string; type: "restSelf" }
  | { id: string; type: "trashSelf" }
  | {
      id: string;
      type: "turnLifeFaceUp";
      count: number;
      player: PlayerRef;
      position: "top" | "bottom";
    }
  | { id: string; type: "restDon"; count: number }
  | {
      id: string;
      type: "attachDon";
      count: number;
      sourceState: "active" | "rested";
      target: Target;
    }
  | { id: string; type: "returnDon"; count: number }
  | { id: string; type: "trashFromHand"; count: number; filter?: CardFilter }
  | { id: string; type: "revealFromHand"; count: number; filter?: CardFilter }
  | { id: string; type: "trashFromField"; count: number; filter?: CardFilter }
  | {
      id: string;
      type: "modifyPower";
      target: Target;
      requiredState?: "active" | "rested";
      value: number;
      duration: Duration;
    }
  | {
      id: string;
      type: "moveCards";
      count: number;
      from: {
        player: PlayerRef;
        zone: Zone;
        position?: "top" | "bottom";
      };
      to: { player: PlayerRef; zone: Zone; position?: "top" | "bottom" };
      filter?: CardFilter;
    }
  | { id: string; type: "discard"; count: number; filter?: CardFilter }
  | { id: string; type: "custom"; action: string };

export interface TargetCandidate {
  card: CardRef;
  visibility: EventVisibility;
}

export interface CardSelectionCandidate {
  card: CardRef;
  visibility: EventVisibility;
}

export interface PaymentResponse {
  type: "payment";
  optionId: string;
  selectedCardInstanceIds?: InstanceId[];
  selectedDonInstanceIds?: InstanceId[];
}

export interface PaymentDeclinedResponse {
  type: "paymentDeclined";
}

export type DecisionResponse =
  | { type: "orderedIds"; ids: string[] }
  | { type: "topBottomPlacement"; topIds: string[]; bottomIds: string[] }
  | { type: "optionalActivation"; choice: "activate" | "decline" }
  | PaymentResponse
  | PaymentDeclinedResponse
  | { type: "targets"; targets: CardRef[] }
  | { type: "cards"; cards: CardRef[] }
  | { type: "effectOption"; optionId: string }
  | { type: "lifeTrigger"; choice: "activateTrigger" | "addToHand" }
  | { type: "replacement"; replacementId?: string }
  | { type: "mulligan"; keep: boolean }
  | { type: "loopCount"; count: number }
  | { type: "rollbackConsent"; allow: boolean }
  | ChooseQuantityResponse;

export interface ChooseQuantityResponse {
  type: "chooseQuantity";
  quantity: number;
}

export interface BaseDecision {
  id: DecisionId;
  type: string;
  playerId: PlayerId;
  prompt: string;
  causedBy: CausalityRef;
  timeoutMs?: number;
  defaultResponse?: DecisionResponse;
  visibility: EventVisibility;
}

export interface ChooseTriggerOrderDecision extends BaseDecision {
  type: "chooseTriggerOrder";
  triggerIds: string[];
  constraints: { mustUseAll: true };
}

export interface ChooseOptionalActivationDecision extends BaseDecision {
  type: "chooseOptionalActivation";
  effectId: EffectId;
  source: CardRef;
  options: ["activate", "decline"];
}

export interface PayCostDecision extends BaseDecision {
  type: "payCost";
  cost: Cost;
  paymentOptions: PaymentOption[];
}

export interface OptionalPayCostDecision extends BaseDecision {
  type: "payCost";
  cost: OptionalCost;
  paymentOptions: PaymentOption[];
  defaultResponse?: PaymentDeclinedResponse;
}

export interface SelectTargetsDecision extends BaseDecision {
  type: "selectTargets";
  request: TargetRequest | MultiZoneTargetRequest;
  candidates: TargetCandidate[];
}

export interface SelectCardsDecision extends BaseDecision {
  type: "selectCards";
  request: CardSelectionRequest;
  candidates: CardSelectionCandidate[];
  runtime?: {
    playSelectedOverflow?: {
      enterRested: boolean;
    };
    playSourceOverflow?: {
      queueEntryId: QueueEntryId;
      source: CardRef;
      enterRested: boolean;
    };
    trashFromHand?: {
      triggerSource: "effect" | "cost";
    };
    attackCost?: {
      attacker: CardRef;
      target: CardRef;
      cost: { type: "trashFromHand"; count: number };
    };
  };
}

export interface ChooseEffectOptionDecision extends BaseDecision {
  type: "chooseEffectOption";
  options: EffectOption[];
}

export interface ConfirmLifeTriggerDecision extends BaseDecision {
  type: "confirmLifeTrigger";
  card: CardRef;
  options: Array<"activateTrigger" | "addToHand">;
}

export interface OrderCardsDecision extends BaseDecision {
  type: "orderCards";
  cards: CardRef[];
  destination: Zone;
  placement?: { type: "topOrBottom" };
}

export interface MulliganDecision extends BaseDecision {
  type: "mulligan";
  options: ["keep", "mulligan"];
}

export interface DeclareLoopCountDecision extends BaseDecision {
  type: "declareLoopCount";
  min: number;
  max: number;
}

export interface RollbackConsentDecision extends BaseDecision {
  type: "rollbackConsent";
  rollbackPointId: string;
}

export interface ChooseReplacementDecision extends BaseDecision {
  type: "chooseReplacement";
  processId: string;
  replacementIds: string[];
  replacementOptions?: Array<{
    replacementId: string;
    label: string;
    source?: CardRef;
  }>;
  mandatory: boolean;
}

export type ChooseQuantityDecision = BaseDecision &
  Cardinality & {
    type: "chooseQuantity";
    defaultResponse?: ChooseQuantityResponse;
  };

export type ExactQuantityDecision<N extends number = number> = BaseDecision &
  ExactCardinality<N> & {
    type: "chooseQuantity";
    defaultResponse?: ChooseQuantityResponse;
  };

export type PendingDecision =
  | ChooseTriggerOrderDecision
  | ChooseOptionalActivationDecision
  | PayCostDecision
  | OptionalPayCostDecision
  | SelectTargetsDecision
  | SelectCardsDecision
  | ChooseEffectOptionDecision
  | ConfirmLifeTriggerDecision
  | OrderCardsDecision
  | MulliganDecision
  | DeclareLoopCountDecision
  | RollbackConsentDecision
  | ChooseReplacementDecision
  | ChooseQuantityDecision;

export type Action =
  | { type: "playCard"; cardInstanceId: InstanceId; costPayment?: PaymentSpec }
  | {
      type: "activateEffect";
      source: CardRef;
      effectId: EffectId;
      costPayment?: PaymentSpec;
    }
  | { type: "attachDon"; donInstanceId: InstanceId; target: CardRef }
  | { type: "declareAttack"; attacker: CardRef; target: CardRef }
  | { type: "activateBlocker"; blocker: CardRef }
  | { type: "useCounter"; cardInstanceId: InstanceId; target: CardRef }
  | { type: "endMainPhase" }
  | { type: "concede"; playerId: PlayerId }
  | {
      type: "respondToDecision";
      decisionId: DecisionId;
      response: DecisionResponse;
    };

export type LegalAction = Action;
