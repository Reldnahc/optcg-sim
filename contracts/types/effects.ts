import type {
  CardId,
  InstanceId,
  Comparator,
  EffectId,
  PlayerRef,
  SelectionId,
  SelectionSetId,
  Visibility,
  Zone,
} from "./primitives.js";
import type {
  Attribute,
  CardRef,
  CardCategory,
  CardColor,
  CardSupportStatus,
  Keyword,
} from "./card-metadata.js";

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
  | { type: "restDon"; count: number; chooser?: PlayerRef; optional?: boolean }
  | {
      type: "returnDon";
      count: number;
      chooser?: PlayerRef;
      optional?: boolean;
    }
  | { type: "restSelf"; optional?: boolean }
  | {
      type: "trashFromHand";
      count: number;
      filter?: CardFilter;
      chooser: PlayerRef;
      optional?: boolean;
    }
  | { type: "trashSelf"; optional?: boolean }
  | {
      type: "trashFromField";
      count: number;
      filter?: CardFilter;
      chooser: PlayerRef;
      optional?: boolean;
    }
  | {
      type: "discard";
      count: number;
      filter?: CardFilter;
      chooser: PlayerRef;
      optional?: boolean;
    }
  | { type: "sequence"; costs: Cost[]; optional?: boolean }
  | { type: "chooseOne"; options: Cost[]; optional?: boolean }
  | { type: "custom"; action: string; optional?: boolean };

export type ExactCardinality<N extends number = number> = {
  mode: "exact";
  min: N;
  max: N;
};

export interface UpToCardinality {
  mode: "upTo";
  min: number;
  max: number;
}

export type Cardinality = ExactCardinality | UpToCardinality;

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
  | { type: "choose"; request: TargetRequest }
  | { type: "selection"; selection: HandSelectionId };

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
  optional?: boolean;
}

export interface SequenceSegmentResult {
  attempted: boolean;
  succeeded: boolean;
  changedState: boolean;
  selectedCards: CardRef[];
  selectedTargets: CardRef[];
  paidCost: boolean;
  playerDeclined: boolean;
}

export interface SavedSelectedCardsReference {
  kind: "selectedCards";
  cards: CardRef[];
}

export interface SavedSelectedTargetsReference {
  kind: "selectedTargets";
  targets: CardRef[];
}

export interface SavedPaidCostReference {
  kind: "paidCost";
  paidCost: true;
}

export interface SavedProducedObjectsReference {
  kind: "producedObjects";
  objects: Array<
    | CardRef
    | {
        instanceId: InstanceId;
      }
  >;
}

export type SequenceSavedResultReference =
  | SavedSelectedCardsReference
  | SavedSelectedTargetsReference
  | SavedPaidCostReference
  | SavedProducedObjectsReference;

type HandSelectionId = SelectionId & `handSelection:${string}`;

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
      zone: "hand";
      player: "self";
      chooser: "self";
      min: number;
      max: number;
      filter: CardFilter;
      saveAs: HandSelectionId;
      visibility: "chooserOnly";
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
      selection: HandSelectionId;
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
