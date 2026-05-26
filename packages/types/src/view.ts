import type {
  BattleStep,
  CardId,
  DecisionId,
  EffectId,
  InstanceId,
  MatchId,
  PlayerId,
  StateSeq,
  Zone,
} from "./primitives.js";
import type { CardRef, ZoneRef } from "./card-metadata.js";
import type { CardSelectionCandidate } from "./decisions.js";
import type { PendingDecision } from "./decisions.js";
import type { CausalityRef, EngineEvent } from "./events.js";
import type { PublicTimerState } from "./runtime.js";

export interface SpectatorPolicy {
  mode: "disabled" | "live-filtered";
  allowHandRevealAfterGame: boolean;
}

export interface PublicTurnState {
  globalTurn: number;
  playerTurnCounts: Record<PlayerId, number>;
  turnPlayerId: PlayerId;
  phase: "refresh" | "draw" | "don" | "main" | "end";
  step?: BattleStep;
}

export interface PublicBattleState {
  attacker: CardRef;
  originalTarget: CardRef;
  currentTarget: CardRef;
  blocker?: CardRef;
  step: BattleStep;
  damageCount: number;
}

export interface PublicCardView {
  instanceId: InstanceId;
  cardId: CardId;
  owner: PlayerId;
  controller: PlayerId;
  zone: ZoneRef;
  state?: "active" | "rested";
  attachedDonCount: number;
  attachedDonIds: InstanceId[];
  turnPlayed?: number;
  printedPower?: number;
  currentPower?: number;
}

export interface PublicLifeView {
  count: number;
  faceUpCards: PublicCardView[];
}

export interface VisiblePlayerState {
  playerId: PlayerId;
  deckCount: number;
  donDeckCount: number;
  hand: PublicCardView[];
  trash: PublicCardView[];
  leader: PublicCardView;
  characters: PublicCardView[];
  stage?: PublicCardView;
  costArea: PublicCardView[];
  life: PublicLifeView;
  hasMulliganed: boolean;
  turnCount: number;
}

export interface OpponentVisibleState {
  playerId: PlayerId;
  deckCount: number;
  donDeckCount: number;
  handCount: number;
  trash: PublicCardView[];
  leader: PublicCardView;
  characters: PublicCardView[];
  stage?: PublicCardView;
  costArea: PublicCardView[];
  life: PublicLifeView;
  hasMulliganed: boolean;
  turnCount: number;
}

export type SpectatorVisiblePlayerState = OpponentVisibleState;

export interface PublicDecision<TType extends string = string> {
  id: DecisionId;
  type: TType;
  playerId: PlayerId;
  prompt: string;
  causedBy: CausalityRef;
  timeoutMs?: number;
}

export interface PublicChooseQuantityDecision extends PublicDecision<"chooseQuantity"> {
  type: "chooseQuantity";
  mode: "exact" | "upTo";
  min: number;
  max: number;
}

export interface PublicSelectCardsDecision extends PublicDecision<"selectCards"> {
  type: "selectCards";
  min: number;
  max: number;
  candidates: Array<Pick<CardSelectionCandidate, "card">>;
  choices: Array<
    Pick<CardSelectionCandidate, "card"> & { selectable: boolean }
  >;
}

export interface PublicOrderCardsDecision extends PublicDecision<"orderCards"> {
  type: "orderCards";
  cards: CardRef[];
  destination: Zone;
}

export type PublicPendingDecision =
  | PublicDecision<
      Exclude<
        PendingDecision["type"],
        "chooseQuantity" | "selectCards" | "orderCards"
      >
    >
  | PublicChooseQuantityDecision
  | PublicSelectCardsDecision
  | PublicOrderCardsDecision;

export type PublicLegalAction =
  | { type: "playCard"; card: CardRef; costPaymentRequired?: boolean }
  | { type: "activateEffect"; source: CardRef; effectId: EffectId }
  | { type: "attachDon"; don: CardRef; target: CardRef }
  | { type: "declareAttack"; attacker: CardRef; target: CardRef }
  | { type: "activateBlocker"; blocker: CardRef }
  | { type: "useCounter"; card: CardRef; target: CardRef }
  | { type: "endMainPhase" }
  | { type: "concede"; playerId: PlayerId }
  | { type: "respondToDecision"; decisionId: DecisionId };

export interface PublicRevealRecord {
  id: string;
  cards: CardRef[];
  visibility: "public" | "privateToRecipient";
  origin: ZoneRef | "topOfDeck" | "lifeDamage" | "custom";
  createdAtStateSeq: StateSeq;
  cleanupPolicy: "returnToOrigin" | "trashAfterResolution" | "none";
}

export type SpectatorRevealRecord = Omit<PublicRevealRecord, "visibility"> & {
  visibility: "public";
};

export type SpectatorEvent = Omit<EngineEvent, "visibility"> & {
  visibility: { type: "public" };
};

export interface PlayerView {
  matchId: MatchId;
  playerId: PlayerId;
  stateSeq: StateSeq;
  actionSeq: number;
  turn: PublicTurnState;
  self: VisiblePlayerState;
  opponent: OpponentVisibleState;
  battle?: PublicBattleState;
  pendingDecision?: PublicPendingDecision;
  legalActions: PublicLegalAction[];
  revealedCards: PublicRevealRecord[];
  events: EngineEvent[];
  timers: PublicTimerState;
}

export interface SpectatorView {
  matchId: MatchId;
  stateSeq: StateSeq;
  actionSeq: number;
  spectatorPolicy: SpectatorPolicy;
  turn: PublicTurnState;
  players: Record<PlayerId, SpectatorVisiblePlayerState>;
  battle?: PublicBattleState;
  revealedCards: SpectatorRevealRecord[];
  events: SpectatorEvent[];
  timers: PublicTimerState;
}
