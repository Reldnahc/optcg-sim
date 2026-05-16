import { expect, test } from "vitest";

import type * as Types from "./index.js";
import type {
  CardFilter,
  CardId,
  CardRef,
  ExactCardinality,
  CardSelectionRequest,
  Condition,
  Cost,
  Duration,
  Effect,
  EffectBlock,
  EffectCategory,
  EffectDefinition,
  EffectDefinitionMetadata,
  EffectId,
  EffectOption,
  FailurePolicy,
  HandSelectCardsEffect,
  HandSelectionId,
  OptionalCost,
  OptionalCostSegmentResult,
  PayCostEffect,
  PlayHandSelectedEffect,
  ReplacementTrigger,
  SearchRequest,
  SavedFieldObjectReferenceFailure,
  SavedFieldObjectTarget,
  SavedFieldObjectTargetBinding,
  SequenceSavedResultReference,
  SequenceSavedResultReferenceMap,
  SequenceSegmentResult,
  SelectionId,
  SelectionSetId,
  SequencedEffect,
  SourcePresencePolicy,
  Target,
  TargetRequest,
  UpToCardinality,
  Trigger,
} from "./index.js";

test("effect support contracts compile with canonical representative values", () => {
  const filter: CardFilter = {
    categories: ["character"],
    colorsAny: ["red"],
    colorsAll: ["red"],
    cost: { op: "lte", value: 5 },
    hasKeywords: ["rush"],
  };

  const targetRequest: TargetRequest = {
    timing: "onActivation",
    chooser: "self",
    zone: "characterArea",
    player: "opponent",
    filter,
    min: 1,
    max: 1,
    allowFewerIfUnavailable: false,
    visibility: "public",
  };
  const target: Target = { type: "choose", request: targetRequest };
  const cost: Cost = {
    type: "trashFromHand",
    count: 1,
    chooser: "self",
    filter,
  };

  const zoneSelection: CardSelectionRequest = {
    timing: "onResolution",
    chooser: "self",
    player: "self",
    zone: "deck",
    min: 0,
    max: 1,
    allowFewerIfUnavailable: true,
  };
  const setSelection: CardSelectionRequest = {
    timing: "onResolution",
    chooser: "self",
    set: "set-1" as SelectionSetId,
    min: 1,
    max: 1,
    allowFewerIfUnavailable: false,
  };
  const exactOne: ExactCardinality<1> = { mode: "exact", min: 1, max: 1 };
  const upToThree: UpToCardinality = { mode: "upTo", min: 0, max: 3 };
  const invalidExactTwo: ExactCardinality<2> = {
    mode: "exact",
    min: 2,
    // @ts-expect-error exact cardinality requires min and max to match.
    max: 1,
  };

  const duration: Duration = {
    type: "whileConditionTrue",
    condition: { type: "yourTurn" },
  };
  const search: SearchRequest = {
    zone: "deck",
    player: "self",
    filter,
    min: 0,
    max: 1,
    destination: "hand",
    revealTo: "bothPlayers",
    shuffleAfter: true,
  };
  const replacement: ReplacementTrigger = {
    type: "wouldMoveZone",
    from: "characterArea",
    to: "trash",
    target: { type: "self" },
  };
  const effect: Effect = {
    type: "sequence",
    effects: [
      { connector: "always", effect: { type: "search", request: search } },
      { connector: "ifPreviousSucceeded", effect: { type: "trash", target } },
    ],
  };

  const metadata: EffectDefinitionMetadata = {
    sourceTextHash: "hash",
    rulesVersion: "v6",
    effectDefinitionsVersion: "v1",
    tested: true,
    generatedBy: "manual",
    reviewedBy: "reviewer",
    reviewedAt: "2026-05-03T00:00:00.000Z",
  };
  const block: EffectBlock = {
    id: "effect-1" as EffectId,
    category: "auto",
    trigger: { type: "onPlay" },
    conditionTiming: "activation",
    cost,
    effect,
  };
  const definition: EffectDefinition = {
    cardId: "OP01-001" as CardId,
    implementationStatus: "implemented-dsl",
    effects: [block],
    metadata,
  };

  const failurePolicy: FailurePolicy = "doAsMuchAsPossible";
  const sourcePolicy: SourcePresencePolicy = "mustRemainInSameZone";
  const category: EffectCategory = "activate";
  const trigger: Trigger = { type: "activateMain" };
  const condition: Condition = {
    type: "attachedDonCount",
    target,
    op: "gte",
    value: 1,
  };
  const option: EffectOption = {
    id: "opt-1",
    effect: { type: "draw", count: 1, player: "self" },
  };
  const segment: SequencedEffect = { connector: "then", effect: option.effect };

  const firstEffect = definition.effects[0];
  expect(firstEffect).toBeDefined();
  if (!firstEffect) {
    throw new Error("expected effect block");
  }
  expect(firstEffect.id).toBe("effect-1" as EffectId);
  expect(zoneSelection.zone).toBe("deck");
  expect(setSelection.set).toBe("set-1");
  expect(duration.type).toBe("whileConditionTrue");
  expect(replacement.type).toBe("wouldMoveZone");
  expect(failurePolicy).toBe("doAsMuchAsPossible");
  expect(sourcePolicy).toBe("mustRemainInSameZone");
  expect(category).toBe("activate");
  expect(trigger.type).toBe("activateMain");
  expect(condition.type).toBe("attachedDonCount");
  expect(segment.connector).toBe("then");
  expect(exactOne.max).toBe(1);
  expect(upToThree.mode).toBe("upTo");
  void invalidExactTwo;
});

test("replacement effect contract supports reviewed would-be-KOd self draw shape", () => {
  const replacement: ReplacementTrigger = {
    type: "wouldBeKOd",
    target: { type: "self" },
  };
  const effect: Effect = {
    type: "replacement",
    when: replacement,
    instead: { type: "draw", count: 1, player: "self" },
  };
  const block: EffectBlock = {
    id: "replacement-1" as EffectId,
    category: "replacement",
    trigger: { type: "replacement", replacement },
    optional: true,
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    effect,
  };
  const definition: EffectDefinition = {
    cardId: "OP01-002" as CardId,
    implementationStatus: "implemented-dsl",
    effects: [block],
    metadata: {
      sourceTextHash: "hash",
      rulesVersion: "v6",
      effectDefinitionsVersion: "v1",
      tested: true,
      reviewedBy: "reviewer",
      reviewedAt: "2026-05-11T00:00:00.000Z",
    },
  };

  expect(definition.effects[0]?.category).toBe("replacement");
  expect(effect.when.type).toBe("wouldBeKOd");
});

test("deprecated CardFilter aliases are rejected by canonical contract", () => {
  // @ts-expect-error deprecated alias
  const cardIdAlias: CardFilter = { cardId: "OP01-001" };
  // @ts-expect-error deprecated alias
  const cardNameAlias: CardFilter = { cardName: "Luffy" };
  // @ts-expect-error deprecated alias
  const cardNameContainsAlias: CardFilter = { cardNameContains: "Luf" };
  // @ts-expect-error deprecated alias
  const cardNameNotAlias: CardFilter = { cardNameNot: ["Luffy"] };
  // @ts-expect-error deprecated alias
  const categoryAlias: CardFilter = { category: "character" };
  // @ts-expect-error deprecated alias
  const colorAlias: CardFilter = { color: "red" };
  // @ts-expect-error deprecated alias
  const colorIncludesAlias: CardFilter = { colorIncludes: ["red"] };
  // @ts-expect-error deprecated alias
  const typeAlias: CardFilter = { type: "Straw Hat" };
  // @ts-expect-error deprecated alias
  const typeIncludesAlias: CardFilter = { typeIncludes: ["Straw Hat"] };
  // @ts-expect-error deprecated alias
  const typeIncludesAnyAlias: CardFilter = { typeIncludesAny: ["Straw Hat"] };
  // @ts-expect-error deprecated alias
  const attributeAlias: CardFilter = { attribute: "strike" };
  // @ts-expect-error deprecated alias
  const costOpAlias: CardFilter = { costOp: "gte" };
  // @ts-expect-error deprecated alias
  const costValueAlias: CardFilter = { costValue: 3 };
  // @ts-expect-error deprecated alias
  const powerOpAlias: CardFilter = { powerOp: "gte" };
  // @ts-expect-error deprecated alias
  const powerValueAlias: CardFilter = { powerValue: 5000 };
  // @ts-expect-error deprecated alias
  const hasKeywordAlias: CardFilter = { hasKeyword: "rush" };
  // @ts-expect-error deprecated alias
  const lacksKeywordAlias: CardFilter = { lacksKeyword: "blocker" };

  void cardIdAlias;
  void cardNameAlias;
  void cardNameContainsAlias;
  void cardNameNotAlias;
  void categoryAlias;
  void colorAlias;
  void colorIncludesAlias;
  void typeAlias;
  void typeIncludesAlias;
  void typeIncludesAnyAlias;
  void attributeAlias;
  void costOpAlias;
  void costValueAlias;
  void powerOpAlias;
  void powerValueAlias;
  void hasKeywordAlias;
  void lacksKeywordAlias;
});

test("sequence segment result and saved-result reference contracts compile with canonical shapes", () => {
  const selectedCard: CardRef = {
    instanceId: "instance-1" as CardRef["instanceId"],
    cardId: "OP01-003" as CardId,
    playerId: "player-1" as CardRef["playerId"],
  };

  const result: SequenceSegmentResult = {
    attempted: true,
    succeeded: true,
    changedState: false,
    selectedCards: [selectedCard],
    selectedTargets: [selectedCard],
    paidCost: true,
    playerDeclined: false,
  };

  const references: SequenceSavedResultReferenceMap = {
    previousSelection: {
      kind: "selectedCards",
      cards: [selectedCard],
    },
    previousTarget: {
      kind: "selectedTargets",
      targets: [
        {
          binding: {
            family: "selectedTargets",
            saveResultAs: "previousTarget",
            objectIndex: 0,
          },
          object: selectedCard,
          capturedAtStateSeq: 1 as Types.StateSeq,
          visibility: "public",
        },
      ],
    },
    previousCost: {
      kind: "paidCost",
      paidCost: true,
    },
    playedObject: {
      kind: "producedObjects",
      objects: [
        {
          binding: {
            family: "producedObjects",
            saveResultAs: "playedObject",
            objectIndex: 0,
          },
          object: selectedCard,
          capturedAtStateSeq: 1 as Types.StateSeq,
          visibility: "public",
        },
      ],
    },
  };

  const savedReferenceCandidate = references["previousTarget"];
  expect(savedReferenceCandidate).toBeDefined();
  if (!savedReferenceCandidate) {
    throw new Error("expected saved reference");
  }
  const savedReference: SequenceSavedResultReference = savedReferenceCandidate;

  expect(result.succeeded).toBe(true);
  expect(savedReference.kind).toBe("selectedTargets");
});

test("sequence saved-result references reject malformed or ambiguous shapes", () => {
  // @ts-expect-error unknown saved-reference kind is unsupported.
  const unsupportedKind: SequenceSavedResultReference = { kind: "unknown" };
  // @ts-expect-error selectedCards references must provide cards.
  const missingCards: SequenceSavedResultReference = { kind: "selectedCards" };
  const ambiguousPayload: SequenceSavedResultReference = {
    kind: "selectedTargets",
    // @ts-expect-error selectedTargets references must not use card payload.
    cards: [],
  };
  const invalidCostValue: SequenceSavedResultReference = {
    kind: "paidCost",
    // @ts-expect-error paidCost references require literal true.
    paidCost: false,
  };

  void unsupportedKind;
  void missingCards;
  void ambiguousPayload;
  void invalidCostValue;
});

test("sequence segment result rejects malformed shapes", () => {
  // @ts-expect-error segment result requires attempted.
  const missingAttempted: SequenceSegmentResult = {
    succeeded: true,
    changedState: false,
    selectedCards: [],
    selectedTargets: [],
    paidCost: false,
    playerDeclined: false,
  };
  const wrongSelectedTargetsPayload: SequenceSegmentResult = {
    attempted: true,
    succeeded: true,
    changedState: false,
    selectedCards: [],
    // @ts-expect-error selectedTargets must be resolved CardRef[].
    selectedTargets: [{ type: "self" }],
    paidCost: false,
    playerDeclined: false,
  };

  void missingAttempted;
  void wrongSelectedTargetsPayload;
});

test("sequence saved-result references support producedObjects with CardRef and instance identity", () => {
  const producedObjects: SequenceSavedResultReference = {
    kind: "producedObjects",
    objects: [
      {
        binding: {
          family: "producedObjects",
          saveResultAs: "playedCharacter",
          objectIndex: 0,
        },
        object: {
          instanceId: "instance-2" as CardRef["instanceId"],
          cardId: "OP01-004" as CardId,
          playerId: "player-2" as CardRef["playerId"],
        },
        capturedAtStateSeq: 1 as Types.StateSeq,
        visibility: "public",
      },
    ],
  };

  expect(producedObjects.kind).toBe("producedObjects");
  expect(producedObjects.objects).toHaveLength(1);
});

test("TYP-009B saved field-object references compile for selectedTargets and producedObjects consumers", () => {
  const selectedTargetBinding: SavedFieldObjectTargetBinding = {
    family: "selectedTargets",
    saveResultAs: "chosenCharacter",
    objectIndex: 0,
    sourceSegmentId: "choose-character",
  };
  const producedObjectBinding: SavedFieldObjectTargetBinding = {
    family: "producedObjects",
    saveResultAs: "playedCharacter",
    objectIndex: 0,
  };
  const selectedTarget: SavedFieldObjectTarget = {
    type: "savedFieldObject",
    binding: selectedTargetBinding,
    zone: "characterArea",
    player: "opponent",
    controller: "opponent",
    filter: { categories: ["character"] },
    visibility: "publicOnly",
    onFailure: "failClosed",
  };
  const producedObject: SavedFieldObjectTarget = {
    type: "savedFieldObject",
    binding: producedObjectBinding,
    zone: "characterArea",
    player: "self",
    controller: "self",
    visibility: "publicOnly",
    onFailure: "failClosed",
  };
  const effect: Effect = {
    type: "sequence",
    effects: [
      {
        id: "choose-character",
        connector: "always",
        saveResultAs: "chosenCharacter",
        effect: {
          type: "ko",
          target: {
            type: "choose",
            request: {
              timing: "onResolution",
              chooser: "self",
              zone: "characterArea",
              player: "opponent",
              min: 1,
              max: 1,
              allowFewerIfUnavailable: false,
              filter: { categories: ["character"] },
            },
          },
        },
      },
      {
        connector: "ifPreviousSucceeded",
        effect: {
          type: "cannotAttack",
          target: selectedTarget,
          duration: { type: "untilEndOfTurn", whoseTurn: "current" },
        },
      },
    ],
  };

  const selectedTargetsReference: SequenceSavedResultReference = {
    kind: "selectedTargets",
    targets: [
      {
        binding: selectedTargetBinding,
        object: {
          instanceId: "instance-2" as CardRef["instanceId"],
          cardId: "OP01-004" as CardId,
          playerId: "player-2" as CardRef["playerId"],
        },
        capturedAtStateSeq: 2 as Types.StateSeq,
        visibility: "public",
      },
    ],
  };
  const producedObjectsReference: SequenceSavedResultReference = {
    kind: "producedObjects",
    objects: [
      {
        binding: producedObjectBinding,
        object: {
          instanceId: "instance-3" as CardRef["instanceId"],
          cardId: "OP01-005" as CardId,
          playerId: "player-1" as CardRef["playerId"],
        },
        capturedAtStateSeq: 3 as Types.StateSeq,
        visibility: "public",
      },
    ],
  };

  expect(effect.type).toBe("sequence");
  expect(selectedTarget.binding.family).toBe("selectedTargets");
  expect(producedObject.binding.family).toBe("producedObjects");
  expect(selectedTargetsReference.kind).toBe("selectedTargets");
  expect(producedObjectsReference.kind).toBe("producedObjects");
});

test("TYP-009B saved field-object references reject unsupported and ambiguous families", () => {
  const unsupportedSelectedCardsBinding: SavedFieldObjectTargetBinding = {
    // @ts-expect-error selectedCards is a hand/card-selection family, not a field-object target family.
    family: "selectedCards",
    saveResultAs: "handCard",
  };
  const unsupportedPaidCostBinding: SavedFieldObjectTargetBinding = {
    // @ts-expect-error paidCost is not a field-object target family.
    family: "paidCost",
    saveResultAs: "paidReturnDon",
  };
  const hiddenVisibilityTarget: SavedFieldObjectTarget = {
    type: "savedFieldObject",
    binding: {
      family: "selectedTargets",
      saveResultAs: "chosenCharacter",
    },
    zone: "characterArea",
    player: "opponent",
    // @ts-expect-error field-object target consumers may not bind hidden or chooser-private objects.
    visibility: "privateToChooser",
    onFailure: "failClosed",
  };
  const ambiguousFailurePolicy: SavedFieldObjectTarget = {
    type: "savedFieldObject",
    binding: {
      family: "producedObjects",
      saveResultAs: "playedCharacter",
    },
    zone: "characterArea",
    player: "self",
    visibility: "publicOnly",
    // @ts-expect-error saved field-object target consumers must fail closed.
    onFailure: "doAsMuchAsPossible",
  };
  const handZoneTarget: SavedFieldObjectTarget = {
    type: "savedFieldObject",
    binding: {
      family: "selectedTargets",
      saveResultAs: "hiddenHandCard",
    },
    // @ts-expect-error saved field-object targets must use public field-object zones.
    zone: "hand",
    player: "self",
    visibility: "publicOnly",
    onFailure: "failClosed",
  };
  const hiddenFailure: SavedFieldObjectReferenceFailure = {
    reason: "hiddenObject",
    publicReason: "savedFieldObjectUnavailable",
    visibility: "privateEffectLog",
  };
  const unsupportedFailure: SavedFieldObjectReferenceFailure = {
    reason: "unsupportedFamily",
    publicReason: "savedFieldObjectUnavailable",
    visibility: "privateEffectLog",
  };

  expect(hiddenFailure.publicReason).toBe("savedFieldObjectUnavailable");
  expect(unsupportedFailure.reason).toBe("unsupportedFamily");
  void unsupportedSelectedCardsBinding;
  void unsupportedPaidCostBinding;
  void hiddenVisibilityTarget;
  void ambiguousFailurePolicy;
  void handZoneTarget;
});

test("condition and optionality authoring supports composed optional cost and optional effect clauses", () => {
  const condition: Condition = {
    type: "and",
    conditions: [
      { type: "lifeCount", player: "self", op: "gte", value: 1 },
      {
        type: "or",
        conditions: [
          { type: "handCount", player: "self", op: "gte", value: 1 },
          {
            type: "fieldCount",
            player: "self",
            op: "gte",
            value: 1,
            filter: { state: "rested" },
          },
        ],
      },
      { type: "sourceStillInZone" },
      {
        type: "not",
        condition: {
          type: "cardState",
          target: { type: "self" },
          state: "rested",
        },
      },
    ],
  };

  const optionalCost: Cost = {
    type: "sequence",
    optional: true,
    costs: [
      { type: "restDon", count: 1, chooser: "self", optional: true },
      { type: "restSelf" },
    ],
  };

  const optionalSequence: Effect = {
    type: "sequence",
    effects: [
      {
        connector: "always",
        optional: true,
        effect: { type: "draw", player: "self", count: 1 },
      },
      {
        connector: "ifYouDo",
        effect: { type: "ko", target: { type: "self" } },
      },
    ],
  };

  const malformedOptionalCost: Cost = {
    type: "restDon",
    count: 1,
    // @ts-expect-error optional cost clause requires a boolean value.
    optional: "yes",
  };
  const unsupportedOptionalCost: Cost = {
    type: "trashFromHand",
    count: 1,
    chooser: "self",
    // @ts-expect-error optional cost authoring is limited to schema-supported cost variants.
    optional: true,
  };

  const malformedOptionalClause: Effect = {
    type: "sequence",
    effects: [
      {
        connector: "always",
        // @ts-expect-error optional effect clause requires a boolean value.
        optional: "decline",
        effect: { type: "draw", player: "self", count: 1 },
      },
    ],
  };

  expect(condition.type).toBe("and");
  expect(optionalCost.type).toBe("sequence");
  expect(optionalSequence.type).toBe("sequence");
  void malformedOptionalCost;
  void unsupportedOptionalCost;
  void malformedOptionalClause;
});

test("cost and hand-selection play-from-hand authoring contracts compile with reviewed shapes", () => {
  const returnDonCost: Cost = {
    type: "returnDon",
    count: 2,
    chooser: "self",
  };
  const drawUpTo: Effect = { type: "drawUpTo", count: 2, player: "self" };
  const handSelectionId = "handSelection:playableCharacter" as HandSelectionId;
  const selectFromHand: HandSelectCardsEffect = {
    type: "selectCards",
    zone: "hand",
    player: "self",
    chooser: "self",
    min: 1,
    max: 1,
    filter: { categories: ["character"] },
    saveAs: handSelectionId,
    visibility: "chooserOnly",
  };
  const playSelected: PlayHandSelectedEffect = {
    type: "playSelected",
    selection: handSelectionId,
    ignoreCost: true,
    enterRested: true,
  };

  const malformedReturnDonCost: Cost = {
    type: "returnDon",
    // @ts-expect-error returnDon cost count must be a number.
    count: "2",
  };
  // @ts-expect-error drawUpTo requires count.
  const malformedDrawUpTo: Effect = { type: "drawUpTo", player: "self" };
  // @ts-expect-error playSelected requires selection.
  const malformedPlaySelected: Effect = {
    type: "playSelected",
    ignoreCost: true,
  };
  const broadSelectCards: Effect = {
    type: "selectCards",
    zone: "deck",
    player: "opponent",
    chooser: "self",
    min: 0,
    max: 2,
    saveAs: "selection:generic" as SelectionId,
    visibility: "chooserOnly",
  };
  const broadPlaySelected: Effect = {
    type: "playSelected",
    selection: "savedResult:selectedCards" as SelectionId,
    ignoreCost: true,
  };
  const invalidHandSelectionZone: HandSelectCardsEffect = {
    type: "selectCards",
    // @ts-expect-error selectCards is constrained to hand-zone selection.
    zone: "deck",
    player: "self",
    chooser: "self",
    min: 1,
    max: 1,
    filter: { categories: ["character"] },
    saveAs: handSelectionId,
    visibility: "chooserOnly",
  };
  const invalidHandSelectionPlayer: HandSelectCardsEffect = {
    type: "selectCards",
    zone: "hand",
    // @ts-expect-error selectCards player is constrained to self.
    player: "opponent",
    chooser: "self",
    min: 1,
    max: 1,
    filter: { categories: ["character"] },
    saveAs: handSelectionId,
    visibility: "chooserOnly",
  };
  const invalidHandSelectionChooser: HandSelectCardsEffect = {
    type: "selectCards",
    zone: "hand",
    player: "self",
    // @ts-expect-error selectCards chooser is constrained to self.
    chooser: "opponent",
    min: 1,
    max: 1,
    filter: { categories: ["character"] },
    saveAs: handSelectionId,
    visibility: "chooserOnly",
  };
  const invalidHandSelectionVisibility: HandSelectCardsEffect = {
    type: "selectCards",
    zone: "hand",
    player: "self",
    chooser: "self",
    min: 1,
    max: 1,
    filter: { categories: ["character"] },
    saveAs: handSelectionId,
    // @ts-expect-error selectCards visibility is constrained to chooserOnly.
    visibility: "bothPlayers",
  };
  const invalidHandSelectionReferencePrefix: HandSelectCardsEffect = {
    type: "selectCards",
    zone: "hand",
    player: "self",
    chooser: "self",
    min: 1,
    max: 1,
    filter: { categories: ["character"] },
    // @ts-expect-error hand-selection saveAs must use handSelection:* prefix.
    saveAs: "selection:generic" as SelectionId,
    visibility: "chooserOnly",
  };
  const invalidHandPlaySelectedReferencePrefix: PlayHandSelectedEffect = {
    type: "playSelected",
    // @ts-expect-error playSelected references must use handSelection:* prefix.
    selection: "savedResult:selectedCards" as SelectionId,
    ignoreCost: true,
  };

  expect(returnDonCost.type).toBe("returnDon");
  expect(drawUpTo.type).toBe("drawUpTo");
  expect(selectFromHand.type).toBe("selectCards");
  expect(playSelected.type).toBe("playSelected");
  expect(broadSelectCards.type).toBe("selectCards");
  expect(broadPlaySelected.type).toBe("playSelected");
  void malformedReturnDonCost;
  void malformedDrawUpTo;
  void malformedPlaySelected;
  void invalidHandSelectionZone;
  void invalidHandSelectionPlayer;
  void invalidHandSelectionChooser;
  void invalidHandSelectionVisibility;
  void invalidHandSelectionReferencePrefix;
  void invalidHandPlaySelectedReferencePrefix;
});

test("temporary modifier and restriction authoring supports extended durations and normal targets", () => {
  const chosenTarget: Target = {
    type: "choose",
    request: {
      timing: "onResolution",
      chooser: "self",
      zone: "characterArea",
      player: "opponent",
      min: 1,
      max: 1,
      allowFewerIfUnavailable: false,
      filter: { categories: ["character"] },
    },
  };

  const temporaryPowerModifier: Effect = {
    type: "modifyPower",
    target: chosenTarget,
    value: 1000,
    duration: { type: "untilEndOfTurn", whoseTurn: "targetController" },
  };
  const cannotAttack: Effect = {
    type: "cannotAttack",
    target: chosenTarget,
    duration: { type: "untilStartOfNextTurn", player: "self" },
  };
  const cannotBlock: Effect = {
    type: "cannotBlock",
    target: { type: "self" },
    duration: { type: "untilEndOfTurn" },
  };

  const unsupportedSavedSelectionTarget: Target = {
    // @ts-expect-error saved selection targets are deferred until a field-target producer exists.
    type: "selection",
    selection: "handSelection:thatCharacter" as HandSelectionId,
  };
  const malformedUntilEndDuration: Duration = {
    type: "untilEndOfTurn",
    // @ts-expect-error whoseTurn must use canonical enum values.
    whoseTurn: "nextTurn",
  };
  // @ts-expect-error untilStartOfNextTurn durations require player.
  const malformedUntilStartDuration: Duration = {
    type: "untilStartOfNextTurn",
  };
  const malformedCannotAttack: Effect = {
    type: "cannotAttack",
    // @ts-expect-error saved selection targets are not authorable in TYP-007E.
    target: { type: "selection" },
    duration: { type: "untilEndOfTurn" },
  };

  expect(temporaryPowerModifier.type).toBe("modifyPower");
  expect(cannotAttack.type).toBe("cannotAttack");
  expect(cannotBlock.type).toBe("cannotBlock");
  expect(chosenTarget.type).toBe("choose");
  void unsupportedSavedSelectionTarget;
  void malformedUntilEndDuration;
  void malformedUntilStartDuration;
  void malformedCannotAttack;
});

test("TYP-009A composed optional cost clauses use payCost sequence segments", () => {
  const optionalReturnDonCost: OptionalCost = {
    type: "returnDon",
    count: 1,
    chooser: "self",
    optional: true,
  };
  const payOptionalCost: PayCostEffect = {
    type: "payCost",
    cost: optionalReturnDonCost,
  };
  const optionalCostSequence: Effect = {
    type: "sequence",
    effects: [
      {
        id: "optional-return-don",
        connector: "always",
        effect: payOptionalCost,
        saveResultAs: "paidReturnDon",
      },
      {
        connector: "ifYouDo",
        effect: { type: "draw", player: "self", count: 1 },
      },
    ],
  };

  const nonOptionalCost: OptionalCost = {
    type: "restDon",
    count: 1,
    chooser: "self",
    // @ts-expect-error optional cost clauses require literal optional true.
    optional: false,
  };
  const missingOptionalFlag: OptionalCost = {
    type: "returnDon",
    count: 1,
    chooser: "self",
    // @ts-expect-error optional cost clauses require the optional flag.
    optional: undefined,
  };

  expect(optionalCostSequence.type).toBe("sequence");
  expect(payOptionalCost.type).toBe("payCost");
  void nonOptionalCost;
  void missingOptionalFlag;
});

test("TYP-009A optional cost segment results distinguish accept decline and failure", () => {
  const accepted: OptionalCostSegmentResult = {
    attempted: true,
    succeeded: true,
    changedState: true,
    selectedCards: [],
    selectedTargets: [],
    paidCost: true,
    playerDeclined: false,
  };
  const declined: OptionalCostSegmentResult = {
    attempted: true,
    succeeded: false,
    changedState: false,
    selectedCards: [],
    selectedTargets: [],
    paidCost: false,
    playerDeclined: true,
  };
  const failedPayment: OptionalCostSegmentResult = {
    attempted: true,
    succeeded: false,
    changedState: false,
    selectedCards: [],
    selectedTargets: [],
    paidCost: false,
    playerDeclined: false,
  };

  // @ts-expect-error declined optional costs are not successful cost payment.
  const ambiguousDecline: OptionalCostSegmentResult = {
    attempted: true,
    succeeded: true,
    changedState: false,
    selectedCards: [],
    selectedTargets: [],
    paidCost: false,
    playerDeclined: true,
  };
  // @ts-expect-error failed optional costs do not change canonical state.
  const ambiguousFailure: OptionalCostSegmentResult = {
    attempted: true,
    succeeded: false,
    changedState: true,
    selectedCards: [],
    selectedTargets: [],
    paidCost: false,
    playerDeclined: false,
  };

  expect(accepted.paidCost).toBe(true);
  expect(declined.playerDeclined).toBe(true);
  expect(failedPayment.playerDeclined).toBe(false);
  void ambiguousDecline;
  void ambiguousFailure;
});
