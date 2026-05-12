import type {
  BattleStep,
  CardId,
  EffectId,
  EngineEventId,
  InstanceId,
  PlayerId,
  SelectionSetId,
  StateSeq,
  TimingWindowId,
} from "./primitives.js";
import type { CardRef, Keyword, ZoneRef } from "./card-metadata.js";
import type { CausalityRef, EngineEvent, EventVisibility } from "./events.js";
import type { Duration } from "./effects.js";

export interface PlayerGameTimer {
  playerId: PlayerId;
  remainingMs: number;
  isRunning: boolean;
}

export interface TimerState {
  drainingPlayerId?: PlayerId;
  players: Record<PlayerId, PlayerGameTimer>;
  disconnect?: {
    playerId: PlayerId;
    startedAt: string;
    expiresAt: string;
  };
}

export interface PublicTimerState {
  activePlayerId?: PlayerId;
  players: Record<PlayerId, { remainingMs: number; isRunning: boolean }>;
}

export interface RngState {
  algorithm: "pcg32" | "xoshiro256ss" | "test-fixed";
  seedCommitment?: string;
  internalState: string;
  callCount: number;
}

export interface RngDrawResult<T> {
  value: T;
  nextRng: RngState;
  event: EngineEvent;
}

export interface CardInstance {
  instanceId: InstanceId;
  cardId: CardId;
  owner: PlayerId;
  controller: PlayerId;
  zone: ZoneRef;
  state?: "active" | "rested";
  attachedDon: InstanceId[];
  turnPlayed?: number;
}

export interface LifeCard {
  card: CardInstance;
  faceUp: boolean;
}

export interface PlayerState {
  playerId: PlayerId;
  deck: CardInstance[];
  donDeck: CardInstance[];
  hand: CardInstance[];
  trash: CardInstance[];
  leader: CardInstance;
  characters: CardInstance[];
  stage?: CardInstance;
  costArea: CardInstance[];
  life: LifeCard[];
  hasMulliganed: boolean;
  turnCount: number;
}

export type Winner = PlayerId | "draw";

export type MatchStatus =
  | { type: "setup" }
  | { type: "active" }
  | { type: "frozen"; reason?: string }
  | { type: "completed"; winner: Winner }
  | { type: "gameOver"; winner: Winner }
  | { type: "errored"; reason: string };

export interface BattleState {
  attacker: CardRef;
  originalTarget: CardRef;
  currentTarget: CardRef;
  blocker?: CardRef;
  step: BattleStep;
  damageCount: number;
  counterPower?: number;
}

export interface TurnState {
  globalTurn: number;
  playerTurnCounts: Record<PlayerId, number>;
  turnPlayerId: PlayerId;
  phase: "refresh" | "draw" | "don" | "main" | "end";
  step?: BattleStep;
}

export interface AuditEntry {
  type: string;
  createdAt: string;
  causedBy?: CausalityRef;
  payload: unknown;
}

export interface LoopSignature {
  key: string;
  repeats: number;
  recentStateHashes: string[];
}

export interface RevealRecord {
  id: string;
  cards: CardRef[];
  visibility: EventVisibility;
  origin: ZoneRef | "topOfDeck" | "lifeDamage" | "custom";
  createdAtStateSeq: StateSeq;
  cleanupPolicy: "returnToOrigin" | "trashAfterResolution" | "none";
}

export type ReplaceableProcessType =
  | "ko"
  | "damage"
  | "trash"
  | "draw"
  | "moveZone"
  | "custom";

export interface ReplacementProcess {
  id: string;
  type: ReplaceableProcessType;
  source?: CardRef;
  target?: CardRef;
  payload: unknown;
  causedBy: CausalityRef;
  usedReplacementIds: string[];
}

export interface ReplacementProcessState {
  processId: string;
  type: ReplaceableProcessType;
  usedReplacementIds: string[];
  payload: unknown;
}

export interface TriggerCandidate {
  effectBlockId: EffectId;
  controllerId: PlayerId;
  source: CardRef;
  causedBy: CausalityRef;
  triggerEventId?: EngineEventId;
  timingWindowId?: TimingWindowId;
  generation?: number;
}

export interface TransientCardSet {
  id: SelectionSetId;
  cards: CardRef[];
  origin: ZoneRef | "topOfDeck" | "lifeDamage" | "custom";
  visibility: EventVisibility;
  cleanupPolicy: "returnToOrigin" | "trashAfterResolution" | "none";
}

export interface DeferredTriggerBucket {
  timingWindowId: TimingWindowId;
  generation: number;
  triggerIds: string[];
  releasePolicy: "afterCurrentProcess" | "afterDamageStep" | "nextWindow";
}

export interface Protection {
  process: "ko" | "damage" | "trash" | "effect";
  source?: CardRef;
  duration?: Duration;
}

export type RestrictionIndex = Record<string, string[]>;

export interface ComputedCardView {
  instanceId: InstanceId;
  cardId: CardId;
  basePower?: number;
  currentPower?: number;
  baseCost?: number;
  currentCost?: number;
  keywords: Keyword[];
  canAttack: boolean;
  canBlock: boolean;
  cannotBeAttacked: boolean;
  protectedFrom: Protection[];
}

export interface ComputedGameView {
  seq: StateSeq;
  turnPlayerId: PlayerId;
  cards: Record<InstanceId, ComputedCardView>;
  legalAttackTargets: Record<InstanceId, InstanceId[]>;
  restrictions: RestrictionIndex;
}
