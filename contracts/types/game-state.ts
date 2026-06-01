import type {
  CardId,
  EffectId,
  EngineEventId,
  InstanceId,
  MatchId,
  PlayerId,
  PlayerRef,
  QueueEntryId,
  SelectionId,
  SelectionSetId,
  StateSeq,
  TimingWindowId,
  Zone,
} from "./primitives.js";
import type {
  CardRef,
  CardCategory,
  CardSnapshot,
  CardSupportStatus,
  Keyword,
  MatchCardManifest,
  RuntimeVersionSet,
} from "./card-metadata.js";
import type { CausalityRef, EngineEvent } from "./events.js";
import type {
  CardFilter,
  Condition,
  Duration,
  SavedFieldObjectTargetBinding,
  SourcePresencePolicy,
  Target,
} from "./effects.js";
import type { PendingDecision } from "./decisions.js";
import type {
  AuditEntry,
  BattleState,
  DeferredTriggerBucket,
  EffectExecutionFrame,
  LoopSignature,
  MatchStatus,
  PlayerState,
  Protection,
  ReplacementProcessState,
  RevealRecord,
  RngState,
  SetupContinuationState,
  TimerState,
  TransientCardSet,
  TurnState,
} from "./runtime.js";

export interface EngineStepResult {
  state: GameState;
  events: EngineEvent[];
}

export interface EngineResult {
  state: GameState;
  events: EngineEvent[];
  decisions?: PendingDecision[];
  errors?: EngineError[];
  stateHash: string;
}

export interface StateHashInput {
  state: GameState;
  includeHidden: boolean;
  normalizeTransientIds: boolean;
}

export type AtomicMutation = (state: GameState) => EngineStepResult;

export interface GameState {
  matchId: MatchId;
  status: MatchStatus;
  version: RuntimeVersionSet;
  seq: StateSeq;
  actionSeq: number;
  turn: TurnState;
  cardManifest: MatchCardManifest;
  players: Record<PlayerId, PlayerState>;
  timers: TimerState;
  battle?: BattleState;
  pendingDecision?: PendingDecision;
  setupContinuation?: SetupContinuationState;
  oncePerTurn: OncePerTurnRecord[];
  effectQueue: EffectQueueEntry[];
  effectExecutionFrames: EffectExecutionFrame[];
  deferredTriggers: DeferredTriggerBucket[];
  continuousEffects: ContinuousEffectRecord[];
  replacementState: ReplacementProcessState[];
  revealedCards: RevealRecord[];
  rng: RngState;
  eventJournal: EngineEvent[];
  audit: AuditEntry[];
}

export interface OncePerTurnRecord {
  cardInstanceId: InstanceId;
  effectId: string;
  turnNumber: number;
  usedAtStateSeq: StateSeq;
}

export interface EffectQueueEntry {
  id: QueueEntryId;
  state: "pending" | "resolving" | "resolved" | "cancelled";
  timingWindowId: TimingWindowId;
  generation: number;
  controllerId: PlayerId;
  source: CardRef;
  sourceSnapshot: CardSnapshot;
  triggerEventId?: EngineEventId;
  effectBlockId: EffectId;
  orderingGroup: "turnPlayer" | "nonTurnPlayer";
  createdAtEventSeq: number;
  queuedAtStateSeq: StateSeq;
  sourcePresencePolicy: SourcePresencePolicy;
  causedBy: CausalityRef;
}

export interface EffectExecutionContext {
  effectId: EffectId;
  source: CardRef;
  transientSets: Record<SelectionSetId, TransientCardSet>;
  selections: Record<SelectionId, CardRef[]>;
}

export interface EffectContext {
  source: CardRef;
  controllerId: PlayerId;
  causedBy: CausalityRef;
  triggerEventId?: EngineEventId;
  execution: EffectExecutionContext;
}

export type TargetSpec =
  | Target
  | ExactCardTargetSpec
  | { type: "selection"; selection: SelectionId }
  | { type: "allMatching"; zone: Zone; player: PlayerRef; filter?: CardFilter };

export interface ExactCardTargetSpec {
  type: "exactCard";
  card: CardRef;
  binding: SavedFieldObjectTargetBinding;
  createdAtStateSeq: StateSeq;
}

export type ModifierLayer =
  | "basePowerSet"
  | "baseCostSet"
  | "powerAdd"
  | "costAdd"
  | "effectInvalidation"
  | "keywordAdd"
  | "keywordRemove"
  | "restriction"
  | "protection";

export type ModifierOperation =
  | { type: "setBasePower"; value: number }
  | { type: "setBaseCost"; value: number }
  | { type: "addPower"; value: number }
  | { type: "addCost"; value: number }
  | { type: "invalidateEffects" }
  | { type: "addKeyword"; keyword: Keyword }
  | { type: "removeKeyword"; keyword: Keyword }
  | {
      type: "restriction";
      restriction: string;
      sourceCategories?: CardCategory[];
    }
  | { type: "protection"; protection: Protection };

export interface Modifier {
  layer: ModifierLayer;
  target: TargetSpec;
  operation: ModifierOperation;
}

export interface ContinuousEffectRecord {
  id: string;
  source: CardRef;
  sourceSnapshot: CardSnapshot;
  controller: PlayerId;
  modifier: Modifier;
  duration: Duration;
  condition?: Condition;
  createdBy: CausalityRef;
  createdAtStateSeq: StateSeq;
}

export type ContinuousEffect = ContinuousEffectRecord;

export type EngineError =
  | { type: "illegalAction"; reason: string }
  | { type: "invalidDecisionResponse"; reason: string }
  | { type: "invariantViolation"; invariant: string; details: unknown }
  | { type: "unsupportedCard"; cardId: CardId; status: CardSupportStatus }
  | { type: "effectRuntimeError"; effectId: string; details: unknown }
  | { type: "loopDetected"; signature: LoopSignature };

export interface CustomHandler {
  id: string;
  cardId: CardId;
  effectId: string;
  execute(state: GameState, context: EffectContext): EngineResult;
}
