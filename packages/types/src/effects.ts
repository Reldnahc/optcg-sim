import type {
  CardId,
  Comparator,
  PlayerRef,
  SelectionId,
  SelectionSetId,
  StateSeq,
  Visibility,
  Zone,
} from "./primitives.js";
import type {
  Attribute,
  CardRef,
  CardCategory,
  CardColor,
  Keyword,
} from "./card-metadata.js";
import type { EffectTextPresentationRef } from "./effect-presentation.js";

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
  | { type: "onOpponentAttack"; attackerFilter?: CardFilter }
  | { type: "onBlock" }
  | { type: "onKO" }
  | { type: "endOfYourTurn" }
  | { type: "endOfOpponentTurn" }
  | { type: "trigger" }
  | { type: "anyOf"; triggers: Trigger[] }
  | { type: "damageDealt"; players: PlayerRef[] }
  | { type: "lifeRemoved"; players: PlayerRef[] }
  | {
      type: "fieldRemoved";
      target?: "self" | "any";
      player: PlayerRef;
      filter?: CardFilter;
      sourceController?: PlayerRef;
      sourceKind?: "effect" | "ko" | "any";
    }
  | {
      type: "cardPlayed";
      player: PlayerRef;
      filter?: CardFilter;
      sourceZone?: Zone;
      sourceFilter?: CardFilter;
      anyOf?: Array<{
        filter?: CardFilter;
        sourceZone?: Zone;
        sourceFilter?: CardFilter;
      }>;
    }
  | {
      type: "cardRested";
      target?: "self" | "any";
      player: PlayerRef;
      filter?: CardFilter;
      sourceController?: PlayerRef;
      sourceKind?: "effect" | "any";
    }
  | { type: "handTrashedByEffect"; player: PlayerRef }
  | { type: "opponentActivated"; activations: OpponentActivationKind[] }
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
  | { type: "turnCount"; player: PlayerRef; op: Comparator; value: number }
  | { type: "opponentTurn" }
  | { type: "lifeCount"; player: PlayerRef; op: Comparator; value: number }
  | {
      type: "lifeCountDifference";
      minuend: { player: PlayerRef };
      subtrahend: { player: PlayerRef };
      op: Comparator;
      value: number;
    }
  | {
      type: "lifeCountTotal";
      players: PlayerRef[];
      op: Comparator;
      value: number;
    }
  | {
      type: "fieldCount";
      player: PlayerRef;
      filter?: CardFilter;
      op: Comparator;
      value: number;
    }
  | {
      type: "fieldCountDifference";
      minuend: {
        player: PlayerRef;
        filter?: CardFilter;
      };
      subtrahend: {
        player: PlayerRef;
        filter?: CardFilter;
      };
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
  // prettier-ignore
  | { type: "eventHistory"; event: "cardPlayed" | "cardKOd"; player: PlayerRef; filter?: CardFilter; window: "thisTurn"; op: Comparator; value: number }
  | {
      type: "leaderColorCount";
      player: PlayerRef;
      op: Comparator;
      value: number;
    }
  | {
      type: "onlyMatchingFieldCards";
      zone: Zone;
      player: PlayerRef;
      filter: CardFilter;
    }
  | { type: "hasCardInZone"; zone: Zone; player: PlayerRef; filter: CardFilter }
  | { type: "attackTarget"; targetType: "leader" | "character" | "any" }
  | { type: "cardState"; target: Target; state: "active" | "rested" }
  | { type: "sourcePlayedThisTurn" }
  | { type: "sourceStillInZone" }
  | { type: "eventPayload"; path: string; op: Comparator; value: unknown }
  | { type: "and"; conditions: Condition[] }
  | { type: "or"; conditions: Condition[] }
  | { type: "not"; condition: Condition }
  | { type: "custom"; check: string };

export type Cost =
  | { type: "restDon"; count: number; chooser?: PlayerRef; optional?: boolean }
  | {
      type: "restFromField";
      count: number;
      filter?: CardFilter;
      chooser: PlayerRef;
      optional?: boolean;
    }
  | {
      type: "attachDon";
      count: number;
      sourceState: "active" | "rested";
      target: Target;
      optional?: boolean;
    }
  | {
      type: "returnDon";
      count: number;
      chooser?: PlayerRef;
      sourceState?: "active";
      optional?: boolean;
    }
  | { type: "restSelf"; optional?: boolean }
  | {
      type: "turnLifeFaceUp";
      count: number;
      player: PlayerRef;
      position: "top" | "bottom";
    }
  // prettier-ignore
  | { type: "trashFromHand"; count: number; maxCount?: number | "available"; filter?: CardFilter; chooser: PlayerRef }
  | {
      type: "revealFromHand";
      count: number;
      filter?: CardFilter;
      chooser: PlayerRef;
    }
  | {
      type: "moveCards";
      count: number;
      chooser: PlayerRef;
      from: {
        player: PlayerRef;
        zone: Zone;
        position?: "top" | "bottom" | "topOrBottom";
      };
      to: { player: PlayerRef; zone: Zone; position?: "top" | "bottom" };
      order: "chooserChoice";
      optional?: boolean;
    }
  | {
      type: "modifyPower";
      target: Target;
      requiredState?: "active" | "rested";
      value: number;
      duration: Duration;
      optional?: boolean;
    }
  | { type: "trashSelf"; filter?: CardFilter }
  | {
      type: "trashFromField";
      count: number;
      filter?: CardFilter;
      chooser: "self";
      optional?: boolean;
    }
  | {
      type: "discard";
      count: number;
      filter?: CardFilter;
      chooser: PlayerRef;
    }
  | { type: "sequence"; costs: Cost[]; optional?: boolean }
  | { type: "custom"; action: string };

// prettier-ignore
export type OptionalTrashFromHandCost = { type: "trashFromHand"; count: number; maxCount?: number | "available"; filter?: CardFilter; chooser: PlayerRef; optional: true };

export type OptionalRevealFromHandCost = {
  type: "revealFromHand";
  count: number;
  filter?: CardFilter;
  chooser: PlayerRef;
  optional: true;
};

export type OptionalMoveCardsCost = {
  type: "moveCards";
  count: number;
  chooser: PlayerRef;
  from: {
    player: PlayerRef;
    zone: Zone;
    position?: "top" | "bottom" | "topOrBottom";
  };
  to: { player: PlayerRef; zone: Zone; position?: "top" | "bottom" };
  order: "chooserChoice";
  filter?: CardFilter;
  optional: true;
};

export type ScopedOptionalFieldTrashCost = {
  type: "trashFromField";
  count: number;
  filter?: CardFilter;
  chooser: "self";
  optional: true;
};

export type OptionalChooseOneTrashCostAlternative =
  | OptionalTrashFromHandCost
  | ScopedOptionalFieldTrashCost;

export type OptionalChooseOneTrashCost = {
  type: "chooseOne";
  options: [
    OptionalChooseOneTrashCostAlternative,
    ...OptionalChooseOneTrashCostAlternative[],
  ];
  optional: true;
};

export type OptionalCost =
  | { type: "restDon"; count: number; chooser?: PlayerRef; optional: true }
  | {
      type: "attachDon";
      count: number;
      sourcePlayer?: PlayerRef;
      sourceState: "active" | "rested";
      target: Target;
      optional: true;
    }
  | {
      type: "returnDon";
      count: number;
      chooser?: PlayerRef;
      sourceState?: "active";
      optional: true;
    }
  | { type: "restSelf"; optional: true }
  | {
      type: "restFromField";
      count: number;
      filter?: CardFilter;
      chooser: PlayerRef;
      optional: true;
    }
  | { type: "trashSelf"; filter?: CardFilter; optional: true }
  | ScopedOptionalFieldTrashCost
  | {
      type: "modifyPower";
      target: Target;
      requiredState?: "active" | "rested";
      value: number;
      duration: Duration;
      optional: true;
    }
  | {
      type: "turnLifeFaceUp";
      count: number;
      player: PlayerRef;
      position: "top" | "bottom";
      optional: true;
    }
  | OptionalTrashFromHandCost
  | OptionalRevealFromHandCost
  | OptionalMoveCardsCost
  | OptionalChooseOneTrashCost
  | { type: "sequence"; costs: Cost[]; optional: true };

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
  player: TargetPlayerRef;
  filter?: CardFilter;
  min: number;
  max: number;
  allowFewerIfUnavailable: boolean;
  visibility?: "public" | "privateToChooser";
}

export type TargetPlayerRef = PlayerRef | "anyPlayer";

export interface MultiZoneTargetRequest extends Omit<TargetRequest, "zone"> {
  zones: Zone[];
}

export interface SelectedTargetsRequest extends TargetRequest {
  zone: SavedFieldObjectZone;
  visibility: "public";
}

export type RemainingCardsPlacement =
  | {
      destination: "deck";
      position: "top" | "bottom";
      order: "ownerChoice" | "random";
    }
  | {
      destination: "trash";
    };

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
  remainingCards?: RemainingCardsPlacement;
}

export type OpponentActivationKind = "event" | "blocker" | "trigger";

export type DynamicNumberValue =
  | {
      type: "sumSelectedCardCosts";
      selection: SelectionSetId;
      multiplier: number;
    }
  | {
      type: "paidCostCardCount";
      cost: string;
      multiplier: number;
    }
  | {
      type: "countDistinctMatchingFieldNames";
      player: PlayerRef;
      zone: "characterArea";
      filter: CardFilter;
      multiplier: number;
    }
  | {
      type: "countMatchingZoneCards";
      player: PlayerRef;
      zone: "trash";
      filter?: CardFilter;
      per: number;
      multiplier: number;
    };

export type SnapshotNumberValue = {
  type: "snapshotCardStat";
  target: Target;
  stat: "currentPower";
};

export type Target =
  | { type: "self" }
  | { type: "myLeader" }
  | { type: "opponentLeader" }
  | { type: "attacker" }
  | { type: "attackTarget" }
  | { type: "blocker" }
  | { type: "triggerCard" }
  | { type: "player"; player: PlayerRef }
  | { type: "all"; zone: Zone; player: PlayerRef; filter?: CardFilter }
  | { type: "choose"; request: TargetRequest }
  | { type: "chooseFromZones"; request: MultiZoneTargetRequest }
  | SavedFieldObjectTarget;

export interface CardFilter {
  anyOf?: CardFilter[];
  cardIds?: CardId[];
  names?: string[];
  nameContains?: string;
  nameNot?: string[];
  categories?: CardCategory[];
  colorsAny?: CardColor[];
  colorsAll?: CardColor[];
  typesAny?: string[];
  typesIncludeAny?: string[];
  typesAll?: string[];
  attributesAny?: Attribute[];
  attributesAll?: Attribute[];
  baseCost?: { op: Comparator; value: number } | { min?: number; max?: number };
  cost?: { op: Comparator; value: number } | { min?: number; max?: number };
  power?: { op: Comparator; value: number } | { min?: number; max?: number };
  currentPower?:
    | { op: Comparator; value: number }
    | { min?: number; max?: number };
  counter?: { op: Comparator; value: number } | { min?: number; max?: number };
  hasKeywords?: Keyword[];
  lacksKeywords?: Keyword[];
  effectEntryPoint?: {
    mode: "with" | "without";
    trigger: Trigger;
    condition?: Condition;
  };
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
  | { type: "untilEndOfNextTurn"; player: PlayerRef }
  | { type: "untilStartOfNextTurn"; player: PlayerRef }
  | { type: "whileSourceOnField" }
  | { type: "whileConditionTrue"; condition: Condition }
  | { type: "permanent" };

export type ReplacementTrigger =
  | {
      type: "wouldBeKOd";
      sourceKind?: "battle" | "cardEffect";
      sourceControllerRelation?: "any";
      target: Target;
    }
  | { type: "wouldTakeDamage"; target: Target }
  | { type: "wouldBeTrashed"; target: Target }
  | { type: "wouldDraw"; player: PlayerRef }
  | {
      type: "wouldMoveZone";
      from?: Zone;
      to?: Zone;
      sourceKind?: "battle" | "cardEffect";
      sourceControllerRelation?: "any" | "opponentControlled";
      target: Target;
    }
  | { type: "custom"; event: string };

export interface EffectOption {
  id: string;
  label?: string;
  effect: Effect;
}

export interface SequencedEffect {
  id?: string;
  effect: Effect | PayCostEffect;
  connector:
    | "always"
    | "then"
    | "ifPreviousSucceeded"
    | "ifYouDo"
    | "ifPossible";
  saveResultAs?: string;
  optional?: boolean;
  presentation?: EffectTextPresentationRef;
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

export type OptionalCostSegmentResult =
  | (SequenceSegmentResult & {
      attempted: true;
      succeeded: true;
      paidCost: true;
      playerDeclined: false;
    })
  | (SequenceSegmentResult & {
      attempted: true;
      succeeded: false;
      changedState: false;
      paidCost: false;
      playerDeclined: true;
    })
  | (SequenceSegmentResult & {
      attempted: true;
      succeeded: false;
      changedState: false;
      paidCost: false;
      playerDeclined: false;
    });

export type SavedFieldObjectReferenceFamily =
  | "selectedTargets"
  | "forEachSavedTarget"
  | "producedObjects";

export type SavedFieldObjectZone =
  | "leaderArea"
  | "characterArea"
  | "stageArea"
  | "costArea";

export interface SavedFieldObjectTargetBinding {
  family: SavedFieldObjectReferenceFamily;
  saveResultAs: string;
  objectIndex?: number;
  sourceSegmentId?: string;
}

export interface SavedFieldObjectReference {
  binding: SavedFieldObjectTargetBinding;
  object: CardRef;
  capturedAtStateSeq: StateSeq;
  visibility: "public";
}

export type SavedFieldObjectReferenceFailureReason =
  | "unsupportedFamily"
  | "staleObject"
  | "goneObject"
  | "hiddenObject"
  | "illegalObject";

export interface SavedFieldObjectReferenceFailure {
  reason: SavedFieldObjectReferenceFailureReason;
  publicReason: "savedFieldObjectUnavailable";
  visibility: "privateEffectLog";
}

export interface SavedFieldObjectTarget {
  type: "savedFieldObject";
  binding: SavedFieldObjectTargetBinding;
  zone?: SavedFieldObjectZone;
  zones?: readonly SavedFieldObjectZone[];
  player: TargetPlayerRef;
  controller?: PlayerRef;
  filter?: CardFilter;
  visibility: "publicOnly";
  onFailure: "failClosed";
}

export interface SavedSelectedCardsReference {
  kind: "selectedCards";
  cards: CardRef[];
}

export interface SavedSelectedTargetsReference {
  kind: "selectedTargets";
  targets: SavedFieldObjectReference[];
}

export interface SavedPaidCostReference {
  kind: "paidCost";
  paidCost: true;
  selectedCards?: CardRef[];
}

export interface SavedProducedObjectsReference {
  kind: "producedObjects";
  objects: SavedFieldObjectReference[];
}

export type SequenceSavedResultReference =
  | SavedSelectedCardsReference
  | SavedSelectedTargetsReference
  | SavedPaidCostReference
  | SavedProducedObjectsReference;

export type HandSelectionId = SelectionId & `handSelection:${string}`;

export interface SelectCardsEffect {
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

export interface SelectTargetsEffect {
  type: "selectTargets";
  request: SelectedTargetsRequest | MultiZoneTargetRequest;
}

export interface SelectAllTargetsEffect {
  type: "selectAllTargets";
  request: Omit<
    SelectedTargetsRequest,
    "min" | "max" | "allowFewerIfUnavailable"
  >;
}

export interface SelectTargetsProducerSegment extends SequencedEffect {
  effect: SelectTargetsEffect | SelectAllTargetsEffect;
  saveResultAs: string;
}

export type HandSelectCardsEffect = SelectCardsEffect & {
  zone: "hand";
  player: "self";
  chooser: "self";
  filter: CardFilter;
  saveAs: HandSelectionId;
  visibility: "chooserOnly";
};

export interface PlaySelectedEffect {
  type: "playSelected";
  selection: SelectionId;
  enterRested?: boolean;
  ignoreCost?: boolean;
}

export interface ActivateSelectedEventEffect {
  type: "activateSelectedEvent";
  selection: SelectionId;
  trigger: Trigger;
  ignoreCost: boolean;
}

export interface PlaySourceEffect {
  type: "playSource";
  source: Target;
  enterRested?: boolean;
  ignoreCost?: boolean;
}

export type PlayHandSelectedEffect = PlaySelectedEffect & {
  selection: HandSelectionId;
};

export interface PayCostEffect {
  type: "payCost";
  cost: OptionalCost;
}

export interface EffectDslFieldRemovalProtection {
  process: "fieldRemoval";
  fieldRemoval: {
    processFamily: "fieldRemoval";
    classification:
      | "moveFromFieldToTrash"
      | "moveFromFieldToHand"
      | "moveFromFieldToDeck"
      | "moveFromFieldToLife"
      | "moveFromFieldToOtherZone";
    sourceKind: "cardEffect" | "ruleProcess" | "battle" | "cost" | "custom";
    sourceControllerRelation:
      | "opponentControlled"
      | "selfControlled"
      | "eitherController"
      | "unknownController";
    targetScope:
      | "thisCard"
      | "controllerFieldCharacter"
      | "controllerField"
      | "anyFieldCard";
    exclusions: {
      battleKO: "excluded" | "failClosed";
      ruleProcessTrash: "excluded" | "failClosed";
      controllerCost: "excluded" | "failClosed";
      controllerOwnedEffect: "excluded" | "failClosed";
      ambiguousCustomRemoval: "excluded" | "failClosed";
    };
  };
}

export interface EffectDslRestProtection {
  process: "rest";
  sourceKind: "cardEffect" | "ruleProcess" | "battle" | "cost" | "custom";
  sourceControllerRelation:
    | "opponentControlled"
    | "selfControlled"
    | "eitherController"
    | "unknownController";
  sourceCardCategories?: CardCategory[];
}

export type EffectDslProtection =
  | EffectDslFieldRemovalProtection
  | EffectDslRestProtection;

export type AttackTrashCost = { type: "trashFromHand"; count: number };

export type Effect =
  | { type: "draw"; count: number; player: PlayerRef }
  | { type: "drawUpTo"; count: number; player: PlayerRef }
  | {
      type: "preventDraw";
      player: PlayerRef;
      source: "ownEffects";
      duration: Duration;
    }
  | {
      type: "preventDonActivation";
      player: PlayerRef;
      sourceCategories: CardCategory[];
      duration: Duration;
    }
  | {
      type: "preventPlay";
      player: PlayerRef;
      filter: CardFilter;
      duration: Duration;
    }
  | {
      type: "placeTopDeckCards";
      player: PlayerRef;
      count: number;
      destination: "top" | "bottom" | "topOrBottom";
      order: "ownerChoice";
    }
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
      type: "reorderLife";
      player: PlayerRef;
      viewer: PlayerRef;
    }
  | {
      type: "setLifeFaceUp";
      player: PlayerRef;
      faceUp: boolean;
    }
  | {
      type: "revealTop";
      player: PlayerRef;
      zone?: Zone;
      count: number;
      min?: number;
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
      type: "revealSelected";
      selection: SelectionId;
      visibility: Visibility;
    }
  | SelectCardsEffect
  | SelectTargetsEffect
  | SelectAllTargetsEffect
  | {
      type: "moveSelected";
      selection: SelectionId;
      from: Zone | SelectionSetId;
      to: Zone;
      position?: "top" | "bottom" | "topOrBottom";
      destinationFaceUp?: boolean;
    }
  | {
      type: "moveCards";
      count: number;
      min?: number;
      from: {
        player: PlayerRef;
        zone: Zone;
        position?: "top" | "bottom";
        source?: "effectSource";
      };
      to: { player: PlayerRef; zone: Zone; position?: "top" | "bottom" };
      order: "original";
      destinationState?: "active" | "rested";
      destinationFaceUp?: boolean;
    }
  | {
      type: "putRemaining";
      zone: Zone;
      position: "top" | "bottom";
      order: "ownerChoice" | "chooserChoice" | "random";
    }
  | {
      type: "placeSetRemainder";
      set: SelectionSetId;
      owner: PlayerRef;
      destination: Zone;
      position: "top" | "bottom" | "topOrBottom";
      order: "chooser" | "owner" | "original" | "random";
    }
  | { type: "shuffleDeck"; player: PlayerRef }
  | {
      type: "bounce";
      target: Target;
      destination: "hand" | "deckTop" | "deckBottom" | "lifeTop" | "lifeBottom";
      destinationFaceUp?: boolean;
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
  | PlaySelectedEffect
  | ActivateSelectedEventEffect
  | PlaySourceEffect
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
  | {
      type: "trashFromHandUntilCount";
      player: PlayerRef;
      chooser: PlayerRef;
      handCount: number;
    }
  | {
      type: "modifyPower";
      target: Target;
      value: number | DynamicNumberValue;
      duration: Duration;
    }
  | { type: "setPowerToZero"; target: Target; duration: Duration }
  | {
      type: "setBasePower";
      target: Target;
      value: number | SnapshotNumberValue;
      duration: Duration;
    }
  | {
      type: "modifyCost";
      filter?: CardFilter;
      target?: Target;
      value: number | DynamicNumberValue;
      duration: Duration;
      usageLimit?: { type: "nextMatchingPlay"; maxUses: number };
      player: PlayerRef;
      sourceZone?: Zone;
    }
  | {
      type: "modifyCounter";
      filter?: CardFilter;
      value: number;
      duration: Duration;
      player: PlayerRef;
      sourceZone?: Zone;
    }
  | { type: "setBaseCost"; target: Target; value: number; duration: Duration }
  | { type: "rest"; target: Target }
  | { type: "activate"; target: Target }
  | {
      type: "delayed";
      timing: { type: "endOfTurn"; turn: "current" };
      effect: Effect;
    }
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
  | {
      type: "giveProtection";
      target: Target;
      protection: EffectDslProtection;
      duration: Duration;
    }
  | { type: "addDon"; count: number; player: PlayerRef }
  | { type: "attachDon"; target: Target; count: number; player: PlayerRef }
  | {
      type: "attachSelectedDon";
      selection: SelectionId;
      sourceState?: "active" | "rested";
      target: Target;
      targetOwner?: "selectedDonOwner";
    }
  | { type: "returnDon"; count: number; player: PlayerRef }
  | { type: "winGame"; player: PlayerRef }
  | {
      type: "addLife";
      count: number;
      player: PlayerRef;
      source: "deck" | "hand" | "trash";
      faceUp?: boolean;
    }
  | { type: "damage"; target: "leader"; player: PlayerRef; count: number }
  | { type: "invalidateEffects"; target: Target; duration: Duration }
  | {
      type: "protectFromKO";
      target: Target;
      duration: Duration;
      sourceKind?: "battle" | "cardEffect";
      sourceControllerRelation?: "eitherController" | "opponentControlled";
      sourceCardCategories?: CardCategory[];
    }
  | { type: "cannotBecomeActive"; target: Target; duration: Duration }
  | { type: "cannotAttack"; target: Target; duration: Duration }
  | {
      type: "attackCost";
      target: Target;
      cost: AttackTrashCost;
      duration: Duration;
    }
  | { type: "cannotBlock"; target: Target; duration: Duration }
  | {
      type: "preventBlockerActivation";
      target: Target;
      duration: Duration;
    }
  | { type: "changeAttackTarget"; target: Target }
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
  | {
      type: "forEachSavedTarget";
      selection: string;
      saveCurrentAs: string;
      effect: Effect;
    }
  | { type: "repeat"; count: number; effect: Effect }
  | { type: "activateReferencedEffect"; source: Target; trigger: Trigger }
  | { type: "replacement"; when: ReplacementTrigger; instead: Effect }
  | { type: "custom"; handler: string };

export type {
  EffectBlock,
  EffectBlockCost,
  EffectDefinition,
  EffectDefinitionMetadata,
} from "./effect-definition.js";
