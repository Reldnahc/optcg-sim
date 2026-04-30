export type Brand<T, B extends string> = T & { readonly __brand: B };

export type CardId = Brand<string, "CardId">;
export type VariantKey = Brand<string, "VariantKey">;
export type LoadoutId = Brand<string, "LoadoutId">;
export type InstanceId = Brand<string, "InstanceId">;
export type PlayerId = Brand<string, "PlayerId">;
export type MatchId = Brand<string, "MatchId">;
export type EffectId = Brand<string, "EffectId">;
export type DecisionId = Brand<string, "DecisionId">;
export type EngineEventId = Brand<string, "EngineEventId">;
export type QueueEntryId = Brand<string, "QueueEntryId">;
export type TimingWindowId = Brand<string, "TimingWindowId">;
export type SelectionSetId = Brand<string, "SelectionSetId">;
export type SelectionId = Brand<string, "SelectionId">;
export type StateSeq = Brand<number, "StateSeq">;

export type CardCategory = "leader" | "character" | "event" | "stage" | "don";
export type CardColor =
  | "red"
  | "green"
  | "blue"
  | "purple"
  | "black"
  | "yellow";
export type Attribute = "slash" | "strike" | "ranged" | "special" | "wisdom";
export type Keyword =
  | "rush"
  | "rushCharacter"
  | "doubleAttack"
  | "banish"
  | "blocker"
  | "unblockable";
export type Zone =
  | "hand"
  | "deck"
  | "trash"
  | "life"
  | "costArea"
  | "characterArea"
  | "stageArea"
  | "leaderArea"
  | "donDeck"
  | "noZone";
export type Visibility =
  | "bothPlayers"
  | "chooserOnly"
  | "ownerOnly"
  | "controllerOnly"
  | "hidden"
  | "replayOnly";
export type Comparator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
export type PlayerRef =
  | "self"
  | "opponent"
  | "turnPlayer"
  | "nonTurnPlayer"
  | "owner"
  | "controller";
export type BattleStep = "attack" | "block" | "counter" | "damage" | "end";
export type MatchSource = "poneglyph" | "poneglyph-fixture" | "manual-test";

export interface ZoneRef {
  zone: Zone;
  playerId?: PlayerId;
  index?: number;
  slot?:
    | "leader"
    | "stage"
    | "character"
    | "cost"
    | "life"
    | "hand"
    | "deck"
    | "trash"
    | "donDeck"
    | "temporary";
}

export interface CardRef {
  instanceId: InstanceId;
  cardId: CardId;
  playerId: PlayerId;
  zone?: ZoneRef;
}

export interface CardSnapshot {
  instanceId: InstanceId;
  cardId: CardId;
  ownerId: PlayerId;
  controllerId: PlayerId;
  zone: ZoneRef;
  category: CardCategory;
  colors: CardColor[];
  cost?: number;
  power?: number;
  counter?: number;
  life?: number;
  keywords: Keyword[];
}

export interface CardVariant {
  variantKey: VariantKey;
  variantIndex: number;
  imageUrl?: string;
  label?: string;
}

export interface CardMetadata {
  cardId: CardId;
  source: MatchSource;
  name: string;
  category: CardCategory;
  colors: CardColor[];
  cost?: number;
  life?: number;
  power?: number;
  counter?: number;
  types?: string[];
  attributes?: Attribute[];
  text: string;
  variants?: CardVariant[];
  sourceTextHash?: string;
}

export interface RuntimeVersionSet {
  specVersion: string;
  rulesVersion: string;
  engineVersion: string;
  cardDataVersion: string;
  effectDefinitionsVersion: string;
  customHandlerVersion: string;
  banlistVersion: string;
}

export interface RulingNote {
  source: "official-faq" | "errata" | "simulator-note";
  text: string;
}

export type CardSupportStatus =
  | "vanilla-confirmed"
  | "implemented-dsl"
  | "implemented-custom"
  | "unsupported"
  | "banned-in-simulator";

export interface CardImplementationRecord {
  cardId: CardId;
  status: CardSupportStatus;
  effectDefinitionId?: string;
  customHandlerIds?: string[];
  tested: boolean;
  rulesVersion: string;
  cardDataVersion: string;
  sourceTextHash: string;
  behaviorHash: string;
  notes?: string;
}

export interface BanlistRecord {
  cardId: CardId;
  format: string;
  status:
    | "legal"
    | "banned"
    | "restricted"
    | "leaderLocked"
    | "simulatorBanned";
  maxCopies?: number;
  reason?: string;
  effectiveFrom: string;
}

export interface ResolvedCardOverlay {
  cardId: CardId;
  support: CardImplementationRecord;
  effectDefinitionId?: string;
  customHandlerIds?: string[];
  rulingNotes?: RulingNote[];
  banlist?: BanlistRecord[];
  simulatorTags?: string[];
}

export interface PoneglyphLegalityRecord {
  status: string;
  banned_at?: string;
  reason?: string;
  max_copies?: number;
  paired_with?: string[];
}

export interface PoneglyphOfficialFaq {
  question: string;
  answer: string;
  updated_on: string;
}

export interface PoneglyphErrata {
  date: string;
  label: string | null;
  before_text: string | null;
  after_text: string | null;
  images?: {
    source?: string | null;
    scan?: {
      display: string | null;
      full: string | null;
      thumb: string | null;
    };
  };
}

export interface PoneglyphVariant {
  index: number;
  name: string | null;
  label: string | null;
  artist: string | null;
  product: {
    id: string | null;
    slug: string | null;
    name: string | null;
    set_code: string | null;
    released_at: string | null;
  };
  images: {
    stock: { full: string | null; thumb: string | null };
    scan: {
      display: string | null;
      full: string | null;
      thumb: string | null;
    };
  };
  errata: PoneglyphErrata[];
  market: {
    tcgplayer_url: string | null;
    market_price: string | null;
    low_price: string | null;
    mid_price: string | null;
    high_price: string | null;
  };
}

export interface PoneglyphCardDetail {
  card_number: string;
  name: string;
  language: string;
  set: string;
  set_name: string;
  released_at: string | null;
  released: boolean;
  card_type: string;
  rarity: string | null;
  color: string[];
  cost: number | null;
  power: number | null;
  counter: number | null;
  life: number | null;
  attribute: string[] | null;
  types: string[];
  effect: string | null;
  trigger: string | null;
  block: string | null;
  variants: PoneglyphVariant[];
  legality: Record<string, PoneglyphLegalityRecord>;
  available_languages: string[];
  official_faq: PoneglyphOfficialFaq[];
}

export interface NormalizedErrata extends PoneglyphErrata {
  variantIndex: number;
  variantKey: VariantKey;
}

export interface ResolvedCardVariant {
  variantKey: VariantKey;
  variantIndex: number;
  label?: string;
  artist?: string;
  productId?: string;
  productSlug?: string;
  productName?: string;
  productSetCode?: string;
  stockImageFull?: string;
  stockImageThumb?: string;
  scanImageDisplay?: string;
  scanImageFull?: string;
  scanImageThumb?: string;
}

export interface ResolvedCard {
  cardId: CardId;
  language: string;
  name: string;
  category: CardCategory;
  set: string;
  setName: string;
  block?: string;
  released: boolean;
  releasedAt?: string;
  rarity?: string;
  colors: CardColor[];
  cost?: number;
  power?: number;
  counter?: number;
  life?: number;
  attributes: Attribute[];
  types: string[];
  effectText?: string;
  triggerText?: string;
  printedKeywords: Keyword[];
  variants: ResolvedCardVariant[];
  legality: Record<string, PoneglyphLegalityRecord>;
  officialFaq: PoneglyphOfficialFaq[];
  errata: NormalizedErrata[];
  sourceTextHash: string;
  behaviorHash: string;
  support: CardImplementationRecord;
}

export interface MatchCardManifest {
  manifestHash: string;
  source: MatchSource;
  cardDataVersion: string;
  effectDefinitionsVersion: string;
  customHandlerVersion: string;
  banlistVersion: string;
  cards: Record<CardId, ResolvedCard>;
  createdAt: string;
}

export interface DecklistEntry {
  cardId: CardId;
  quantity: number;
  variantKey?: VariantKey;
}

export interface ResolvedDeckCard {
  cardId: CardId;
  quantity: number;
  variants: VariantKey[];
  resolvedCard: ResolvedCard;
}

export interface DeckValidationError {
  code: string;
  message: string;
  cardId?: CardId;
}

export interface DeckValidationWarning {
  code: string;
  message: string;
  cardId?: CardId;
}

export interface DeckValidationResult {
  valid: boolean;
  errors: DeckValidationError[];
  warnings: DeckValidationWarning[];
  resolvedCards: ResolvedDeckCard[];
  versions: {
    cardDataVersion: string;
    effectDefinitionsVersion: string;
    overlayVersion: string;
    banlistVersion: string;
  };
}

export interface Loadout {
  loadoutId: LoadoutId;
  ownerPlayerId: PlayerId;
  name: string;
  deck: DecklistEntry[];
  donDeckVariantKey?: VariantKey;
  sleevesId?: string;
  playmatId?: string;
  iconId?: string;
  cardVariants?: Partial<Record<CardId, VariantKey>>;
}

export type EventVisibility =
  | { type: "public" }
  | { type: "private"; playerId: PlayerId }
  | { type: "hidden" }
  | { type: "replayOnly" }
  | { type: "serverOnly" };

export interface EngineEvent {
  id: EngineEventId;
  seq: number;
  type: EngineEventType;
  actor?: PlayerId;
  source?: CardRef;
  affected?: CardRef[];
  payload: unknown;
  causedBy?: CausalityRef;
  visibility: EventVisibility;
  createdAtStateSeq: StateSeq;
}

export type EngineEventType =
  | "phaseStarted"
  | "phaseEnded"
  | "cardRevealed"
  | "cardMoved"
  | "cardPlayed"
  | "cardDrawn"
  | "cardDiscarded"
  | "cardTrashed"
  | "cardKOd"
  | "cardReturned"
  | "donAttached"
  | "donReturned"
  | "costPaid"
  | "attackDeclared"
  | "blockerActivated"
  | "counterUsed"
  | "damageWouldBeDealt"
  | "damageDealt"
  | "lifeTaken"
  | "triggerActivated"
  | "effectQueued"
  | "effectResolved"
  | "replacementApplied"
  | "decisionCreated"
  | "decisionResolved"
  | "ruleProcessingChecked"
  | "gameEnded";

export type CausalityRef =
  | { type: "playerAction"; actionId: string }
  | { type: "effect"; queueEntryId: QueueEntryId; effectId: EffectId }
  | { type: "ruleProcess"; name: string }
  | { type: "replacement"; replacementId: string }
  | { type: "decision"; decisionId: DecisionId };

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
}

export interface TurnState {
  globalTurn: number;
  playerTurnCounts: Record<PlayerId, number>;
  turnPlayerId: PlayerId;
  phase: "refresh" | "draw" | "don" | "main" | "end";
  step?: BattleStep;
}

export interface TargetCandidate {
  card: CardRef;
  visibility: EventVisibility;
}

export interface CardSelectionCandidate {
  card: CardRef;
  visibility: EventVisibility;
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

export interface ReplacementProcessState {
  processId: string;
  type: ReplaceableProcessType;
  usedReplacementIds: string[];
  payload: unknown;
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
  players: Record<PlayerId, PlayerState>;
  timers: TimerState;
  battle?: BattleState;
  pendingDecision?: PendingDecision;
  oncePerTurn: OncePerTurnRecord[];
  effectQueue: EffectQueueEntry[];
  deferredTriggers: DeferredTriggerBucket[];
  continuousEffects: ContinuousEffectRecord[];
  replacementState: ReplacementProcessState[];
  revealedCards: RevealRecord[];
  rng: RngState;
  eventJournal: EngineEvent[];
  audit: AuditEntry[];
}

export type FailurePolicy =
  | "doAsMuchAsPossible"
  | "requiresAll"
  | "skipIfNoLegalTarget"
  | "optionalIfPossible";

export type SourcePresencePolicy =
  | "mustRemainInSameZone"
  | "resolveFromDestinationZone"
  | "resolveFromLastKnownInformation"
  | "noSourceRequired";

export type EffectCategory = "auto" | "activate" | "permanent" | "replacement";

export type Trigger =
  | { type: "onPlay" }
  | { type: "whenAttacking" }
  | { type: "onOpponentAttack" }
  | { type: "onBlock" }
  | { type: "onKO" }
  | { type: "endOfYourTurn" }
  | { type: "endOfOpponentTurn" }
  | { type: "trigger" }
  | { type: "donAttach"; count: number }
  | { type: "activateMain" }
  | { type: "main" }
  | { type: "counter" }
  | { type: "permanent" }
  | { type: "replacement"; replacement: ReplacementTrigger }
  | { type: "startOfGame" }
  | { type: "startOfYourTurn" }
  | { type: "startOfOpponentTurn" }
  | { type: "startOfMainPhase" }
  | { type: "endOfBattle" }
  | { type: "custom"; event: string };

export type Condition =
  | { type: "donCount"; target?: Target; min: number }
  | { type: "attachedDonCount"; target: Target; op: Comparator; value: number }
  | { type: "yourTurn" }
  | { type: "opponentTurn" }
  | { type: "lifeCount"; player: PlayerRef; op: Comparator; value: number }
  | {
      type: "fieldCount";
      player: PlayerRef;
      filter?: CardFilter;
      op: Comparator;
      value: number;
    }
  | { type: "handCount"; player: PlayerRef; op: Comparator; value: number }
  | {
      type: "trashCount";
      player: PlayerRef;
      filter?: CardFilter;
      op: Comparator;
      value: number;
    }
  | { type: "hasCardInZone"; zone: Zone; player: PlayerRef; filter: CardFilter }
  | { type: "attackTarget"; targetType: "leader" | "character" | "any" }
  | { type: "cardState"; target: Target; state: "active" | "rested" }
  | { type: "sourceStillInZone" }
  | { type: "eventPayload"; path: string; op: Comparator; value: unknown }
  | { type: "and"; conditions: Condition[] }
  | { type: "or"; conditions: Condition[] }
  | { type: "not"; condition: Condition }
  | { type: "custom"; check: string };

export type Cost =
  | { type: "restDon"; count: number; chooser?: PlayerRef }
  | { type: "returnDon"; count: number; chooser?: PlayerRef }
  | { type: "restSelf" }
  | {
      type: "trashFromHand";
      count: number;
      filter?: CardFilter;
      chooser: PlayerRef;
    }
  | { type: "trashSelf" }
  | {
      type: "trashFromField";
      count: number;
      filter?: CardFilter;
      chooser: PlayerRef;
    }
  | { type: "discard"; count: number; filter?: CardFilter; chooser: PlayerRef }
  | { type: "sequence"; costs: Cost[] }
  | { type: "chooseOne"; options: Cost[] }
  | { type: "custom"; action: string };

export interface TargetRequest {
  timing: "onActivation" | "onResolution";
  chooser: PlayerRef;
  zone: Zone;
  player: PlayerRef;
  filter?: CardFilter;
  min: number;
  max: number;
  allowFewerIfUnavailable: boolean;
  visibility?: "public" | "privateToChooser";
}

export interface CardSelectionRequest {
  timing: "onActivation" | "onResolution";
  chooser: PlayerRef;
  player?: PlayerRef;
  zone?: Zone;
  set?: SelectionSetId;
  filter?: CardFilter;
  min: number;
  max: number;
  allowFewerIfUnavailable: boolean;
  visibility?: "public" | "privateToChooser";
}

export type Target =
  | { type: "self" }
  | { type: "myLeader" }
  | { type: "opponentLeader" }
  | { type: "attacker" }
  | { type: "attackTarget" }
  | { type: "blocker" }
  | { type: "triggerCard" }
  | { type: "all"; zone: Zone; player: PlayerRef; filter?: CardFilter }
  | { type: "choose"; request: TargetRequest };

export interface CardFilter {
  cardIds?: CardId[];
  names?: string[];
  nameContains?: string;
  nameNot?: string[];
  categories?: CardCategory[];
  colorsAny?: CardColor[];
  colorsAll?: CardColor[];
  typesAny?: string[];
  typesAll?: string[];
  attributesAny?: Attribute[];
  attributesAll?: Attribute[];
  cost?: { op: Comparator; value: number } | { min?: number; max?: number };
  power?: { op: Comparator; value: number } | { min?: number; max?: number };
  counter?: { op: Comparator; value: number } | { min?: number; max?: number };
  hasKeywords?: Keyword[];
  lacksKeywords?: Keyword[];
  state?: "active" | "rested" | "attached";
  owner?: PlayerRef;
  controller?: PlayerRef;
  excludeSelf?: boolean;
  custom?: string;
}

export type Duration =
  | { type: "thisAction" }
  | { type: "thisBattle" }
  | { type: "thisTurn" }
  | {
      type: "untilEndOfTurn";
      whoseTurn?: "current" | "sourceController" | "targetController";
    }
  | { type: "untilStartOfNextTurn"; player: PlayerRef }
  | { type: "whileSourceOnField" }
  | { type: "whileConditionTrue"; condition: Condition }
  | { type: "permanent" };

export interface SearchRequest {
  zone: "deck" | "trash" | "life";
  player: PlayerRef;
  lookCount?: number;
  filter: CardFilter;
  min: number;
  max: number;
  destination: Zone;
  revealTo: Visibility;
  remainingCards?: {
    destination: Zone;
    position: "top" | "bottom";
    order: "ownerChoice" | "random";
  };
  shuffleAfter?: boolean;
}

export type ReplacementTrigger =
  | { type: "wouldBeKOd"; target: Target }
  | { type: "wouldTakeDamage"; target: Target }
  | { type: "wouldBeTrashed"; target: Target }
  | { type: "wouldDraw"; player: PlayerRef }
  | { type: "wouldMoveZone"; from?: Zone; to?: Zone; target: Target }
  | { type: "custom"; event: string };

export interface EffectOption {
  id: string;
  label?: string;
  effect: Effect;
}

export interface SequencedEffect {
  id?: string;
  effect: Effect;
  connector:
    | "always"
    | "then"
    | "ifPreviousSucceeded"
    | "ifYouDo"
    | "ifPossible";
  saveResultAs?: string;
}

export type Effect =
  | { type: "draw"; count: number; player: PlayerRef }
  | { type: "drawUpTo"; count: number; player: PlayerRef }
  | { type: "search"; request: SearchRequest }
  | { type: "lookAtTop"; player: PlayerRef; count: number }
  | {
      type: "revealFromZone";
      player: PlayerRef;
      zone: Zone;
      count?: number;
      filter?: CardFilter;
      to: Visibility;
    }
  | {
      type: "revealTop";
      player: PlayerRef;
      count: number;
      saveAs: SelectionSetId;
      visibility: Visibility;
    }
  | {
      type: "selectFromSet";
      set: SelectionSetId;
      chooser: PlayerRef;
      min: number;
      max: number;
      filter?: CardFilter;
      saveAs: SelectionId;
    }
  | {
      type: "selectCards";
      zone: Zone;
      player: PlayerRef;
      chooser: PlayerRef;
      min: number;
      max: number;
      filter?: CardFilter;
      saveAs: SelectionId;
      visibility: Visibility;
    }
  | {
      type: "moveSelected";
      selection: SelectionId;
      from: Zone | SelectionSetId;
      to: Zone;
      position?: "top" | "bottom";
    }
  | {
      type: "putRemaining";
      zone: Zone;
      position: "top" | "bottom";
      order: "ownerChoice" | "chooserChoice" | "random";
    }
  | { type: "shuffleDeck"; player: PlayerRef }
  | {
      type: "bounce";
      target: Target;
      destination: "hand" | "deckTop" | "deckBottom";
    }
  | { type: "trash"; target: Target }
  | { type: "ko"; target: Target }
  | {
      type: "play";
      source: Zone;
      player: PlayerRef;
      filter: CardFilter;
      costModifier?: number;
    }
  | {
      type: "playSelected";
      selection: SelectionId;
      enterRested?: boolean;
      ignoreCost?: boolean;
    }
  | {
      type: "returnUnselectedToDeck";
      set: SelectionSetId;
      player: PlayerRef;
      position: "top" | "bottom";
      order: "original" | "ownerChoice" | "random";
      faceDown: boolean;
    }
  | {
      type: "trashFromHand";
      player: PlayerRef;
      count: number;
      filter?: CardFilter;
      chooser: PlayerRef;
    }
  | { type: "modifyPower"; target: Target; value: number; duration: Duration }
  | { type: "setPowerToZero"; target: Target; duration: Duration }
  | { type: "setBasePower"; target: Target; value: number; duration: Duration }
  | {
      type: "modifyCost";
      filter: CardFilter;
      value: number;
      duration: Duration;
      player: PlayerRef;
    }
  | { type: "setBaseCost"; target: Target; value: number; duration: Duration }
  | { type: "rest"; target: Target }
  | { type: "activate"; target: Target }
  | {
      type: "giveKeyword";
      target: Target;
      keyword: Keyword;
      duration: Duration;
    }
  | {
      type: "removeKeyword";
      target: Target;
      keyword: Keyword;
      duration: Duration;
    }
  | { type: "addDon"; count: number; player: PlayerRef }
  | { type: "attachDon"; target: Target; count: number; player: PlayerRef }
  | { type: "returnDon"; count: number; player: PlayerRef }
  | {
      type: "addLife";
      count: number;
      player: PlayerRef;
      source: "deck" | "hand" | "trash";
      faceUp?: boolean;
    }
  | { type: "damage"; target: "leader"; player: PlayerRef; count: number }
  | { type: "invalidateEffects"; target: Target; duration: Duration }
  | { type: "protectFromKO"; target: Target; duration: Duration }
  | { type: "cannotAttack"; target: Target; duration: Duration }
  | { type: "cannotBlock"; target: Target; duration: Duration }
  | { type: "cannotBeAttacked"; target: Target; duration: Duration }
  | {
      type: "cannotBeBlockedBy";
      target: Target;
      filter: CardFilter;
      duration: Duration;
    }
  | { type: "sequence"; effects: SequencedEffect[] }
  | {
      type: "choice";
      chooser: PlayerRef;
      options: EffectOption[];
      min: number;
      max: number;
    }
  | { type: "conditional"; if: Condition; then: Effect; else?: Effect }
  | {
      type: "forEachMatch";
      zone: Zone;
      player: PlayerRef;
      filter: CardFilter;
      effect: Effect;
    }
  | { type: "repeat"; count: number; effect: Effect }
  | { type: "replacement"; when: ReplacementTrigger; instead: Effect }
  | { type: "custom"; handler: string };

export interface EffectDefinitionMetadata {
  sourceTextHash: string;
  rulesVersion: string;
  effectDefinitionsVersion: string;
  tested: boolean;
  reviewer?: string;
  notes?: string;
  generatedBy?: "manual" | "rule-parser" | "llm-assisted";
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface EffectBlock {
  id: EffectId;
  category: EffectCategory;
  trigger: Trigger;
  condition?: Condition;
  conditionTiming?: "activation" | "resolution" | "both";
  cost?: Cost;
  optional?: boolean;
  oncePerTurn?: boolean;
  failurePolicy?: FailurePolicy;
  sourcePresencePolicy?: SourcePresencePolicy;
  effect: Effect;
}

export interface EffectDefinition {
  cardId: CardId;
  implementationStatus: CardSupportStatus;
  effects: EffectBlock[];
  metadata: EffectDefinitionMetadata;
}

export interface PaymentSpec {
  optionId: string;
  selectedCardInstanceIds?: InstanceId[];
  selectedDonInstanceIds?: InstanceId[];
}

export type PaymentOption =
  | { id: string; type: "restDon"; count: number }
  | { id: string; type: "returnDon"; count: number }
  | { id: string; type: "trashFromHand"; count: number; filter?: CardFilter }
  | { id: string; type: "trashFromField"; count: number; filter?: CardFilter }
  | { id: string; type: "discard"; count: number; filter?: CardFilter }
  | { id: string; type: "custom"; action: string };

export type DecisionResponse =
  | { type: "orderedIds"; ids: string[] }
  | { type: "optionalActivation"; choice: "activate" | "decline" }
  | {
      type: "payment";
      optionId: string;
      selectedCardInstanceIds?: InstanceId[];
      selectedDonInstanceIds?: InstanceId[];
    }
  | { type: "targets"; targets: CardRef[] }
  | { type: "cards"; cards: CardRef[] }
  | { type: "effectOption"; optionId: string }
  | { type: "lifeTrigger"; choice: "activateTrigger" | "addToHand" }
  | { type: "replacement"; replacementId?: string }
  | { type: "mulligan"; keep: boolean }
  | { type: "loopCount"; count: number }
  | { type: "rollbackConsent"; allow: boolean };

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

export interface SelectTargetsDecision extends BaseDecision {
  type: "selectTargets";
  request: TargetRequest;
  candidates: TargetCandidate[];
}

export interface SelectCardsDecision extends BaseDecision {
  type: "selectCards";
  request: CardSelectionRequest;
  candidates: CardSelectionCandidate[];
}

export interface ChooseEffectOptionDecision extends BaseDecision {
  type: "chooseEffectOption";
  options: EffectOption[];
}

export interface ConfirmLifeTriggerDecision extends BaseDecision {
  type: "confirmLifeTrigger";
  card: CardRef;
  options: ["activateTrigger", "addToHand"];
}

export interface OrderCardsDecision extends BaseDecision {
  type: "orderCards";
  cards: CardRef[];
  destination: Zone;
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
  mandatory: boolean;
}

export type PendingDecision =
  | ChooseTriggerOrderDecision
  | ChooseOptionalActivationDecision
  | PayCostDecision
  | SelectTargetsDecision
  | SelectCardsDecision
  | ChooseEffectOptionDecision
  | ConfirmLifeTriggerDecision
  | OrderCardsDecision
  | MulliganDecision
  | DeclareLoopCountDecision
  | RollbackConsentDecision
  | ChooseReplacementDecision;

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

export interface OncePerTurnRecord {
  cardInstanceId: InstanceId;
  effectId: string;
  turnNumber: number;
  usedAtStateSeq: StateSeq;
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

export interface TriggerCandidate {
  effectBlockId: EffectId;
  controllerId: PlayerId;
  source: CardRef;
  causedBy: CausalityRef;
  triggerEventId?: EngineEventId;
  timingWindowId?: TimingWindowId;
  generation?: number;
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

export interface TransientCardSet {
  id: SelectionSetId;
  cards: CardRef[];
  origin: ZoneRef | "topOfDeck" | "lifeDamage" | "custom";
  visibility: EventVisibility;
  cleanupPolicy: "returnToOrigin" | "trashAfterResolution" | "none";
}

export type TargetSpec =
  | Target
  | { type: "selection"; selection: SelectionId }
  | { type: "allMatching"; zone: Zone; player: PlayerRef; filter?: CardFilter };

export type ModifierLayer =
  | "basePowerSet"
  | "baseCostSet"
  | "powerAdd"
  | "costAdd"
  | "keywordAdd"
  | "keywordRemove"
  | "restriction"
  | "protection";

export type ModifierOperation =
  | { type: "setBasePower"; value: number }
  | { type: "setBaseCost"; value: number }
  | { type: "addPower"; value: number }
  | { type: "addCost"; value: number }
  | { type: "addKeyword"; keyword: Keyword }
  | { type: "removeKeyword"; keyword: Keyword }
  | { type: "restriction"; restriction: string }
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
