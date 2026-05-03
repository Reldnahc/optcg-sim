import { expect, test } from "vitest";

import type * as Types from "./index.js";
import type {
  Attribute,
  BattleStep,
  CausalityRef,
  CardCategory,
  CardColor,
  CardImplementationRecord,
  CardId,
  CardMetadata,
  CardRef,
  CardSnapshot,
  CardSupportStatus,
  Comparator,
  DeckValidationResult,
  DecklistEntry,
  EngineEvent,
  EngineEventType,
  EffectId,
  EventVisibility,
  Keyword,
  Loadout,
  MatchCardManifest,
  MatchSource,
  MatchId,
  PoneglyphCardDetail,
  PoneglyphVariant,
  PlayerId,
  PlayerRef,
  QueueEntryId,
  ReplaceableProcessType,
  ReplacementProcess,
  ReplacementProcessState,
  RestrictionIndex,
  RngDrawResult,
  RngState,
  TimerState,
  TransientCardSet,
  TurnState,
  Winner,
  MatchStatus,
  BattleState,
  AuditEntry,
  LoopSignature,
  RevealRecord,
  TriggerCandidate,
  DeferredTriggerBucket,
  Protection,
  ComputedCardView,
  ComputedGameView,
  OncePerTurnRecord,
  EffectQueueEntry,
  EffectExecutionContext,
  EffectContext,
  TargetSpec,
  ModifierLayer,
  ModifierOperation,
  Modifier,
  ContinuousEffectRecord,
  ContinuousEffect,
  PlayerGameTimer,
  PublicTimerState,
  CardInstance,
  LifeCard,
  PlayerState,
  ResolvedCard,
  EngineEventId,
  VariantKey,
  StateSeq,
  TimingWindowId,
  SelectionSetId,
  SelectionId,
  Visibility,
  ZoneRef,
  Zone,
  FailurePolicy,
  SourcePresencePolicy,
  EffectCategory,
  Trigger,
  Condition,
  Cost,
  TargetRequest,
  CardSelectionRequest,
  Target,
  CardFilter,
  Duration,
  SearchRequest,
  ReplacementTrigger,
  EffectOption,
  SequencedEffect,
  Effect,
  EffectDefinitionMetadata,
  EffectBlock,
  EffectDefinition,
  PaymentSpec,
  PaymentOption,
  TargetCandidate,
  CardSelectionCandidate,
  DecisionResponse,
  BaseDecision,
  ChooseTriggerOrderDecision,
  ChooseOptionalActivationDecision,
  PayCostDecision,
  SelectTargetsDecision,
  SelectCardsDecision,
  ChooseEffectOptionDecision,
  ConfirmLifeTriggerDecision,
  OrderCardsDecision,
  MulliganDecision,
  DeclareLoopCountDecision,
  RollbackConsentDecision,
  ChooseReplacementDecision,
  PendingDecision,
  Action,
  LegalAction,
  DecisionId,
} from "./index.js";

test("types package entrypoint is importable in the shared Vitest baseline", async () => {
  const moduleNamespace = await import("./index.js");

  expect(Object.keys(moduleNamespace)).toEqual([]);
});

test("branded identifiers reject incompatible assignment at compile time", () => {
  const cardId = "OP01-001" as CardId;
  const playerId = "player-1" as PlayerId;
  const effectId = "effect-1" as EffectId;
  const matchId = "match-1" as MatchId;
  const stateSeq = 1 as StateSeq;

  const sameCardId: CardId = cardId;
  const samePlayerId: PlayerId = playerId;
  const sameEffectId: EffectId = effectId;
  const sameMatchId: MatchId = matchId;
  const sameStateSeq: StateSeq = stateSeq;

  expect(sameCardId).toBe(cardId);
  expect(samePlayerId).toBe(playerId);
  expect(sameEffectId).toBe(effectId);
  expect(sameMatchId).toBe(matchId);
  expect(sameStateSeq).toBe(stateSeq);

  // @ts-expect-error CardId must not be assignable to PlayerId.
  const invalidPlayerId: PlayerId = cardId;
  // @ts-expect-error PlayerId must not be assignable to CardId.
  const invalidCardId: CardId = playerId;
  // @ts-expect-error EffectId must not be assignable to MatchId.
  const invalidMatchId: MatchId = effectId;

  void invalidPlayerId;
  void invalidCardId;
  void invalidMatchId;
});

test("global scalar and reference primitives compile with representative values", () => {
  const zone: Zone = "hand";
  const visibility: Visibility = "bothPlayers";
  const comparator: Comparator = "gte";
  const playerRef: PlayerRef = "opponent";
  const battleStep: BattleStep = "counter";

  expect(zone).toBe("hand");
  expect(visibility).toBe("bothPlayers");
  expect(comparator).toBe("gte");
  expect(playerRef).toBe("opponent");
  expect(battleStep).toBe("counter");
});

test("deck entries and loadouts accept base card IDs plus optional variant keys", () => {
  const baseCardId = "OP01-060" as CardId;
  const altVariant = "OP01-060:v1" as VariantKey;
  const baseVariant = "OP01-060:v0" as VariantKey;

  const deck: DecklistEntry[] = [
    { cardId: baseCardId, quantity: 2, variantKey: baseVariant },
    { cardId: baseCardId, quantity: 2, variantKey: altVariant },
    { cardId: baseCardId, quantity: 1 },
  ];

  const loadout: Loadout = {
    loadoutId: "loadout-1" as Loadout["loadoutId"],
    ownerPlayerId: "player-1" as PlayerId,
    name: "split-variants",
    deck,
    cardVariants: {
      [baseCardId]: altVariant,
    },
  };

  expect(loadout.deck).toHaveLength(3);
  expect(loadout.cardVariants?.[baseCardId]).toBe(altVariant);
});

test("poneglyph and resolved/deck validation fixtures compile against canonical shapes", () => {
  const source: MatchSource = "poneglyph-fixture";
  const category: CardCategory = "character";
  const color: CardColor = "red";
  const attribute: Attribute = "strike";
  const keyword: Keyword = "rush";
  const status: CardSupportStatus = "implemented-dsl";
  const zoneRef: ZoneRef = {
    zone: "characterArea",
    playerId: "player-1" as PlayerId,
  };
  const cardRef: CardRef = {
    instanceId: "instance-1" as CardRef["instanceId"],
    cardId: "OP01-060" as CardId,
    playerId: "player-1" as PlayerId,
    zone: zoneRef,
  };
  const cardSnapshot: CardSnapshot = {
    instanceId: cardRef.instanceId,
    cardId: cardRef.cardId,
    ownerId: cardRef.playerId,
    controllerId: cardRef.playerId,
    zone: zoneRef,
    category,
    colors: [color],
    keywords: [keyword],
  };

  const variant: PoneglyphVariant = {
    index: 0,
    name: null,
    label: "Default",
    artist: null,
    product: {
      id: null,
      slug: null,
      name: null,
      set_code: null,
      released_at: null,
    },
    images: {
      stock: { full: null, thumb: null },
      scan: { display: null, full: null, thumb: null },
    },
    errata: [],
    market: {
      tcgplayer_url: null,
      market_price: null,
      low_price: null,
      mid_price: null,
      high_price: null,
    },
  };

  const poneglyphDetail: PoneglyphCardDetail = {
    card_number: "OP01-060",
    name: "Sample Card",
    language: "en",
    set: "OP01",
    set_name: "Romance Dawn",
    released_at: null,
    released: true,
    card_type: "Character",
    rarity: "SR",
    color: ["red"],
    cost: 5,
    power: 7000,
    counter: 1000,
    life: null,
    attribute: ["strike"],
    types: ["Supernovas"],
    effect: "Sample effect",
    trigger: null,
    block: null,
    variants: [variant],
    legality: { standard: { status: "legal" } },
    available_languages: ["en"],
    official_faq: [],
  };

  const support: CardImplementationRecord = {
    cardId: cardRef.cardId,
    status,
    tested: true,
    rulesVersion: "1.0.0",
    cardDataVersion: "2026-01-01",
    sourceTextHash: "hash-text",
    behaviorHash: "hash-behavior",
  };

  const metadata: CardMetadata = {
    cardId: cardRef.cardId,
    source,
    name: poneglyphDetail.name,
    category,
    colors: [color],
    cost: 5,
    power: 7000,
    counter: 1000,
    types: poneglyphDetail.types,
    attributes: [attribute],
    text: poneglyphDetail.effect ?? "",
    variants: [{ variantKey: "OP01-060:v0" as VariantKey, variantIndex: 0 }],
    sourceTextHash: support.sourceTextHash,
  };

  const resolvedCard: ResolvedCard = {
    cardId: metadata.cardId,
    language: poneglyphDetail.language,
    name: metadata.name,
    category: metadata.category,
    set: poneglyphDetail.set,
    setName: poneglyphDetail.set_name,
    released: poneglyphDetail.released,
    rarity: poneglyphDetail.rarity ?? "SR",
    colors: [color],
    cost: poneglyphDetail.cost ?? 5,
    power: poneglyphDetail.power ?? 7000,
    counter: poneglyphDetail.counter ?? 1000,
    attributes: [attribute],
    types: metadata.types ?? [],
    effectText: poneglyphDetail.effect ?? "",
    printedKeywords: [keyword],
    variants: [{ variantKey: "OP01-060:v0" as VariantKey, variantIndex: 0 }],
    legality: poneglyphDetail.legality,
    officialFaq: poneglyphDetail.official_faq,
    errata: [],
    sourceTextHash: support.sourceTextHash,
    behaviorHash: support.behaviorHash,
    support,
  };

  const manifest: MatchCardManifest = {
    manifestHash: "manifest-hash",
    source,
    cardDataVersion: support.cardDataVersion,
    effectDefinitionsVersion: "effects-v1",
    customHandlerVersion: "handlers-v1",
    banlistVersion: "banlist-v1",
    cards: { [resolvedCard.cardId]: resolvedCard },
    createdAt: "2026-05-03T00:00:00.000Z",
  };

  const validationResult: DeckValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    resolvedCards: [
      {
        cardId: resolvedCard.cardId,
        quantity: 4,
        variants: ["OP01-060:v0" as VariantKey, "OP01-060:v1" as VariantKey],
        resolvedCard,
      },
    ],
    versions: {
      cardDataVersion: manifest.cardDataVersion,
      effectDefinitionsVersion: manifest.effectDefinitionsVersion,
      overlayVersion: "overlay-v1",
      banlistVersion: manifest.banlistVersion,
    },
  };

  expect(cardSnapshot.cardId).toBe(cardRef.cardId);
  expect(validationResult.valid).toBe(true);
});

test("event visibility variants compile for canonical union", () => {
  const publicVisibility: EventVisibility = { type: "public" };
  const privateVisibility: EventVisibility = {
    type: "private",
    playerId: "player-1" as PlayerId,
  };
  const hiddenVisibility: EventVisibility = { type: "hidden" };
  const replayOnlyVisibility: EventVisibility = { type: "replayOnly" };
  const serverOnlyVisibility: EventVisibility = { type: "serverOnly" };

  expect(publicVisibility.type).toBe("public");
  expect(privateVisibility.type).toBe("private");
  expect(hiddenVisibility.type).toBe("hidden");
  expect(replayOnlyVisibility.type).toBe("replayOnly");
  expect(serverOnlyVisibility.type).toBe("serverOnly");
});

test("engine event compiles with causality ref and no out-of-scope contracts", () => {
  const eventType: EngineEventType = "cardMoved";
  const causedBy: CausalityRef = {
    type: "effect",
    queueEntryId: "queue-1" as QueueEntryId,
    effectId: "effect-1" as EffectId,
  };
  const event: EngineEvent = {
    id: "event-1" as EngineEventId,
    seq: 1,
    type: eventType,
    payload: { from: "hand", to: "trash" },
    visibility: { type: "public" },
    createdAtStateSeq: 1 as StateSeq,
    causedBy,
  };
  const privateEvent: EngineEvent = {
    id: "event-2" as EngineEventId,
    seq: 2,
    type: eventType,
    payload: { from: "deck", to: "hand" },
    visibility: {
      type: "private",
      playerId: "player-1" as PlayerId,
    },
    createdAtStateSeq: 2 as StateSeq,
  };

  expect(event.type).toBe("cardMoved");
  expect(event.causedBy?.type).toBe("effect");
  expect(privateEvent.visibility.type).toBe("private");
});

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

test("TYP-001E decision and response contracts compile against canonical variants", () => {
  const baseDecision: BaseDecision = {
    id: "decision-1" as DecisionId,
    type: "chooseTriggerOrder",
    playerId: "player-1" as PlayerId,
    prompt: "Choose order",
    causedBy: { type: "playerAction", actionId: "action-1" },
    visibility: { type: "public" },
  };

  const targetCandidate: TargetCandidate = {
    card: {
      instanceId: "instance-1" as CardRef["instanceId"],
      cardId: "OP01-001" as CardId,
      playerId: "player-1" as PlayerId,
    },
    visibility: { type: "public" },
  };
  const cardSelectionCandidate: CardSelectionCandidate = {
    card: targetCandidate.card,
    visibility: { type: "private", playerId: "player-1" as PlayerId },
  };

  const paymentSpec: PaymentSpec = {
    optionId: "opt-1",
    selectedCardInstanceIds: ["instance-1" as CardRef["instanceId"]],
    selectedDonInstanceIds: ["instance-2" as CardRef["instanceId"]],
  };
  const paymentOption: PaymentOption = {
    id: "opt-1",
    type: "restDon",
    count: 1,
  };

  const responseOrderedIds: DecisionResponse = {
    type: "orderedIds",
    ids: ["a", "b"],
  };
  const responseOptionalActivation: DecisionResponse = {
    type: "optionalActivation",
    choice: "activate",
  };
  const responsePayment: DecisionResponse = {
    type: "payment",
    optionId: paymentSpec.optionId,
    selectedCardInstanceIds: ["instance-1" as CardRef["instanceId"]],
  };
  const responseTargets: DecisionResponse = {
    type: "targets",
    targets: [targetCandidate.card],
  };
  const responseCards: DecisionResponse = {
    type: "cards",
    cards: [cardSelectionCandidate.card],
  };
  const responseEffectOption: DecisionResponse = {
    type: "effectOption",
    optionId: "effect-opt-1",
  };
  const responseLifeTrigger: DecisionResponse = {
    type: "lifeTrigger",
    choice: "activateTrigger",
  };
  const responseReplacement: DecisionResponse = {
    type: "replacement",
    replacementId: "replacement-1",
  };
  const responseMulligan: DecisionResponse = { type: "mulligan", keep: true };
  const responseLoopCount: DecisionResponse = { type: "loopCount", count: 2 };
  const responseRollbackConsent: DecisionResponse = {
    type: "rollbackConsent",
    allow: true,
  };

  const chooseTriggerOrder: ChooseTriggerOrderDecision = {
    ...baseDecision,
    type: "chooseTriggerOrder",
    triggerIds: ["t1", "t2"],
    constraints: { mustUseAll: true },
  };
  const chooseOptionalActivation: ChooseOptionalActivationDecision = {
    ...baseDecision,
    type: "chooseOptionalActivation",
    effectId: "effect-1" as EffectId,
    source: targetCandidate.card,
    options: ["activate", "decline"],
  };
  const payCost: PayCostDecision = {
    ...baseDecision,
    type: "payCost",
    cost: { type: "restDon", count: 1 },
    paymentOptions: [paymentOption],
  };
  const selectTargets: SelectTargetsDecision = {
    ...baseDecision,
    type: "selectTargets",
    request: {
      timing: "onActivation",
      chooser: "self",
      zone: "characterArea",
      player: "opponent",
      min: 1,
      max: 1,
      allowFewerIfUnavailable: false,
    },
    candidates: [targetCandidate],
  };
  const selectCards: SelectCardsDecision = {
    ...baseDecision,
    type: "selectCards",
    request: {
      timing: "onResolution",
      chooser: "self",
      zone: "deck",
      player: "self",
      min: 0,
      max: 1,
      allowFewerIfUnavailable: true,
    },
    candidates: [cardSelectionCandidate],
  };
  const chooseEffectOption: ChooseEffectOptionDecision = {
    ...baseDecision,
    type: "chooseEffectOption",
    options: [
      {
        id: "effect-opt-1",
        effect: { type: "draw", count: 1, player: "self" },
      },
    ],
  };
  const confirmLifeTrigger: ConfirmLifeTriggerDecision = {
    ...baseDecision,
    type: "confirmLifeTrigger",
    card: targetCandidate.card,
    options: ["activateTrigger", "addToHand"],
  };
  const orderCards: OrderCardsDecision = {
    ...baseDecision,
    type: "orderCards",
    cards: [targetCandidate.card],
    destination: "deck",
  };
  const mulligan: MulliganDecision = {
    ...baseDecision,
    type: "mulligan",
    options: ["keep", "mulligan"],
  };
  const declareLoopCount: DeclareLoopCountDecision = {
    ...baseDecision,
    type: "declareLoopCount",
    min: 1,
    max: 3,
  };
  const rollbackConsent: RollbackConsentDecision = {
    ...baseDecision,
    type: "rollbackConsent",
    rollbackPointId: "rp-1",
  };
  const chooseReplacement: ChooseReplacementDecision = {
    ...baseDecision,
    type: "chooseReplacement",
    processId: "proc-1",
    replacementIds: ["rep-1"],
    mandatory: false,
  };

  const pending: PendingDecision[] = [
    chooseTriggerOrder,
    chooseOptionalActivation,
    payCost,
    selectTargets,
    selectCards,
    chooseEffectOption,
    confirmLifeTrigger,
    orderCards,
    mulligan,
    declareLoopCount,
    rollbackConsent,
    chooseReplacement,
  ];

  expect(pending).toHaveLength(12);
  expect(responseOrderedIds.type).toBe("orderedIds");
  expect(responseOptionalActivation.type).toBe("optionalActivation");
  expect(responsePayment.type).toBe("payment");
  expect(responseTargets.type).toBe("targets");
  expect(responseCards.type).toBe("cards");
  expect(responseEffectOption.type).toBe("effectOption");
  expect(responseLifeTrigger.type).toBe("lifeTrigger");
  expect(responseReplacement.type).toBe("replacement");
  expect(responseMulligan.type).toBe("mulligan");
  expect(responseLoopCount.type).toBe("loopCount");
  expect(responseRollbackConsent.type).toBe("rollbackConsent");
});

test("TYP-001E action contracts compile and reject transport envelope fields", () => {
  const cardRef: CardRef = {
    instanceId: "instance-1" as CardRef["instanceId"],
    cardId: "OP01-001" as CardId,
    playerId: "player-1" as PlayerId,
  };
  const response: DecisionResponse = { type: "loopCount", count: 1 };

  const actions: Action[] = [
    {
      type: "playCard",
      cardInstanceId: cardRef.instanceId,
      costPayment: { optionId: "opt-1" },
    },
    {
      type: "activateEffect",
      source: cardRef,
      effectId: "effect-1" as EffectId,
    },
    {
      type: "attachDon",
      donInstanceId: "don-1" as CardRef["instanceId"],
      target: cardRef,
    },
    { type: "declareAttack", attacker: cardRef, target: cardRef },
    { type: "activateBlocker", blocker: cardRef },
    { type: "useCounter", cardInstanceId: cardRef.instanceId, target: cardRef },
    { type: "endMainPhase" },
    { type: "concede", playerId: cardRef.playerId },
    {
      type: "respondToDecision",
      decisionId: "decision-1" as DecisionId,
      response,
    },
  ];
  const legalActions: LegalAction[] = actions;
  const actionsAgain: Action[] = legalActions;

  expect(actions).toHaveLength(9);
  expect(actionsAgain).toHaveLength(9);

  const invalidActionClientActionId: Action = {
    type: "endMainPhase",
    // @ts-expect-error Action is transport-free and must reject envelope fields.
    clientActionId: "x",
  };
  const invalidActionExpectedStateSeq: Action = {
    type: "endMainPhase",
    // @ts-expect-error Action is transport-free and must reject envelope fields.
    expectedStateSeq: 1,
  };
  const invalidActionHash: Action = {
    type: "endMainPhase",
    // @ts-expect-error Action is transport-free and must reject envelope fields.
    actionHash: "hash",
  };
  const invalidActionSentAt: Action = {
    type: "endMainPhase",
    // @ts-expect-error Action is transport-free and must reject envelope fields.
    sentAtClientTime: "2026-05-03T00:00:00.000Z",
  };
  const invalidActionMatchId: Action = {
    type: "endMainPhase",
    // @ts-expect-error Action is transport-free and must reject envelope fields.
    matchId: "match-1",
  };
  const invalidActionSignature: Action = {
    type: "endMainPhase",
    // @ts-expect-error Action is transport-free and must reject envelope fields.
    signature: "sig",
  };
  const invalidLegalActionClientActionId: LegalAction = {
    type: "endMainPhase",
    // @ts-expect-error LegalAction is identical to Action and must reject envelope fields.
    clientActionId: "x",
  };
  const staleDecisionType: PendingDecision = {
    ...({} as BaseDecision),
    // @ts-expect-error non-canonical decision family must not exist.
    type: "chooseCharacterToTrashForOverflow",
  };

  void invalidActionClientActionId;
  void invalidActionExpectedStateSeq;
  void invalidActionHash;
  void invalidActionSentAt;
  void invalidActionMatchId;
  void invalidActionSignature;
  void invalidLegalActionClientActionId;
  void staleDecisionType;
});

test("TYP-001F runtime support fixtures compile for timers, rng, player state, battle, and turn", () => {
  const playerA = "player-a" as PlayerId;
  const playerB = "player-b" as PlayerId;
  const event: EngineEvent = {
    id: "event-1" as EngineEventId,
    seq: 1,
    type: "phaseStarted",
    payload: {},
    visibility: { type: "public" },
    createdAtStateSeq: 1 as StateSeq,
  };

  const timer: PlayerGameTimer = {
    playerId: playerA,
    remainingMs: 120_000,
    isRunning: true,
  };
  const timers: TimerState = {
    drainingPlayerId: playerA,
    players: {
      [playerA]: timer,
      [playerB]: { playerId: playerB, remainingMs: 130_000, isRunning: false },
    },
  };
  const publicTimers: PublicTimerState = {
    activePlayerId: playerA,
    players: {
      [playerA]: { remainingMs: 120_000, isRunning: true },
      [playerB]: { remainingMs: 130_000, isRunning: false },
    },
  };
  const rng: RngState = {
    algorithm: "test-fixed",
    internalState: "state",
    callCount: 1,
  };
  const draw: RngDrawResult<number> = { value: 1, nextRng: rng, event };

  const leader: CardInstance = {
    instanceId: "i-leader" as CardRef["instanceId"],
    cardId: "OP01-001" as CardId,
    owner: playerA,
    controller: playerA,
    zone: { zone: "leaderArea", playerId: playerA },
    state: "active",
    attachedDon: [],
  };
  const life: LifeCard = { card: leader, faceUp: false };
  const playerState: PlayerState = {
    playerId: playerA,
    deck: [],
    donDeck: [],
    hand: [],
    trash: [],
    leader,
    characters: [],
    costArea: [],
    life: [life],
    hasMulliganed: false,
    turnCount: 1,
  };
  const winner: Winner = "draw";
  const status: MatchStatus = { type: "active" };
  const battle: BattleState = {
    attacker: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: playerA,
    },
    originalTarget: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: playerB,
    },
    currentTarget: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: playerB,
    },
    step: "damage",
    damageCount: 1,
  };
  const turn: TurnState = {
    globalTurn: 1,
    playerTurnCounts: { [playerA]: 1, [playerB]: 0 },
    turnPlayerId: playerA,
    phase: "main",
    step: "attack",
  };

  expect(timers.players[playerA]?.remainingMs).toBe(120_000);
  expect(publicTimers.activePlayerId).toBe(playerA);
  expect(draw.value).toBe(1);
  expect(playerState.life).toHaveLength(1);
  expect(winner).toBe("draw");
  expect(status.type).toBe("active");
  expect(battle.step).toBe("damage");
  expect(turn.phase).toBe("main");
});

test("TYP-001F runtime support fixtures compile for replacement, queue, context, modifiers, and computed view", () => {
  const player = "player-1" as PlayerId;
  const source: CardRef = {
    instanceId: "i1" as CardRef["instanceId"],
    cardId: "OP01-002" as CardId,
    playerId: player,
  };
  const causedBy: CausalityRef = { type: "ruleProcess", name: "resolution" };
  const sourceSnapshot: CardSnapshot = {
    instanceId: source.instanceId,
    cardId: source.cardId,
    ownerId: player,
    controllerId: player,
    zone: { zone: "characterArea", playerId: player },
    category: "character",
    colors: ["red"],
    keywords: [],
  };

  const replacementType: ReplaceableProcessType = "ko";
  const replacement: ReplacementProcess = {
    id: "proc-1",
    type: replacementType,
    source,
    payload: {},
    causedBy,
    usedReplacementIds: [],
  };
  const replacementState: ReplacementProcessState = {
    processId: replacement.id,
    type: replacement.type,
    payload: replacement.payload,
    usedReplacementIds: [],
  };
  const trigger: TriggerCandidate = {
    effectBlockId: "effect-1" as EffectId,
    controllerId: player,
    source,
    causedBy,
  };
  const deferred: DeferredTriggerBucket = {
    timingWindowId: "window-1" as TimingWindowId,
    generation: 0,
    triggerIds: ["trigger-1"],
    releasePolicy: "afterCurrentProcess",
  };
  const transient: TransientCardSet = {
    id: "set-1" as SelectionSetId,
    cards: [source],
    origin: "topOfDeck",
    visibility: { type: "private", playerId: player },
    cleanupPolicy: "none",
  };
  const execution: EffectExecutionContext = {
    effectId: "effect-1" as EffectId,
    source,
    transientSets: { [transient.id]: transient },
    selections: { ["sel-1" as SelectionId]: [source] },
  };
  const context: EffectContext = {
    source,
    controllerId: player,
    causedBy,
    execution,
  };
  const queueEntry: EffectQueueEntry = {
    id: "q-1" as QueueEntryId,
    state: "pending",
    timingWindowId: "window-1" as TimingWindowId,
    generation: 0,
    controllerId: player,
    source,
    sourceSnapshot,
    effectBlockId: "effect-1" as EffectId,
    orderingGroup: "turnPlayer",
    createdAtEventSeq: 1,
    queuedAtStateSeq: 1 as StateSeq,
    sourcePresencePolicy: "mustRemainInSameZone",
    causedBy,
  };
  const targetSpec: TargetSpec = {
    type: "selection",
    selection: "sel-1" as SelectionId,
  };
  const layer: ModifierLayer = "powerAdd";
  const operation: ModifierOperation = { type: "addPower", value: 1000 };
  const modifier: Modifier = { layer, target: targetSpec, operation };
  const protection: Protection = { process: "ko", source };
  const cardView: ComputedCardView = {
    instanceId: source.instanceId,
    cardId: source.cardId,
    keywords: [],
    canAttack: true,
    canBlock: false,
    cannotBeAttacked: false,
    protectedFrom: [protection],
  };
  const restrictions: RestrictionIndex = {
    [source.instanceId]: ["cannot-attack"],
  };
  const gameView: ComputedGameView = {
    seq: 1 as StateSeq,
    turnPlayerId: player,
    cards: { [source.instanceId]: cardView },
    legalAttackTargets: { [source.instanceId]: [source.instanceId] },
    restrictions,
  };
  const oncePerTurn: OncePerTurnRecord = {
    cardInstanceId: source.instanceId,
    effectId: "effect-1",
    turnNumber: 1,
    usedAtStateSeq: 1 as StateSeq,
  };
  const continuousRecord: ContinuousEffectRecord = {
    id: "ce-1",
    source,
    sourceSnapshot,
    controller: player,
    modifier,
    duration: { type: "thisTurn" },
    createdBy: causedBy,
    createdAtStateSeq: 1 as StateSeq,
  };
  const continuous: ContinuousEffect = continuousRecord;
  const audit: AuditEntry = {
    type: "test",
    createdAt: "2026-05-03T00:00:00.000Z",
    payload: { ok: true },
    causedBy,
  };
  const loop: LoopSignature = {
    key: "loop-key",
    repeats: 1,
    recentStateHashes: ["hash-1"],
  };
  const reveal: RevealRecord = {
    id: "reveal-1",
    cards: [source],
    visibility: { type: "public" },
    origin: "custom",
    createdAtStateSeq: 1 as StateSeq,
    cleanupPolicy: "none",
  };

  expect(replacementState.type).toBe("ko");
  expect(trigger.controllerId).toBe(player);
  expect(deferred.generation).toBe(0);
  expect(context.execution.effectId).toBe("effect-1" as EffectId);
  expect(queueEntry.state).toBe("pending");
  expect(gameView.cards[source.instanceId]?.canAttack).toBe(true);
  expect(oncePerTurn.turnNumber).toBe(1);
  expect(continuous.modifier.layer).toBe("powerAdd");
  expect(audit.type).toBe("test");
  expect(loop.recentStateHashes).toHaveLength(1);
  expect(reveal.cards).toHaveLength(1);
});

test("TYP-001F rejects raw Set for runtime structures requiring arrays/records", () => {
  const player = "player-1" as PlayerId;
  const instanceId = "instance-1" as CardRef["instanceId"];
  const cardId = "OP01-001" as CardId;
  const zone: ZoneRef = { zone: "characterArea", playerId: player };
  const badCard: CardInstance = {
    instanceId,
    cardId,
    owner: player,
    controller: player,
    zone,
    // @ts-expect-error attachedDon requires InstanceId[] not Set.
    attachedDon: new Set<InstanceId>(),
  };
  const badTransient: TransientCardSet = {
    id: "set-1" as SelectionSetId,
    // @ts-expect-error cards requires CardRef[] not Set.
    cards: new Set<CardRef>(),
    origin: "custom",
    visibility: { type: "public" },
    cleanupPolicy: "none",
  };
  // @ts-expect-error transientSets requires Record<SelectionSetId, TransientCardSet>.
  const badTransientSets: EffectExecutionContext["transientSets"] = new Set();
  // @ts-expect-error selections requires Record<SelectionId, CardRef[]>.
  const badSelections: EffectExecutionContext["selections"] = new Set();
  // @ts-expect-error cards requires Record<InstanceId, ComputedCardView>.
  const badCards: ComputedGameView["cards"] = new Set();
  // @ts-expect-error legalAttackTargets requires Record<InstanceId, InstanceId[]>.
  const badTargets: ComputedGameView["legalAttackTargets"] = new Set();
  // @ts-expect-error RestrictionIndex is Record<string, string[]>.
  const badRestrictions: RestrictionIndex = new Set();
  // @ts-expect-error TimerState.players is a Record, not Set.
  const badTimerPlayers: TimerState["players"] = new Set();

  void badCard;
  void badTransient;
  void badTransientSets;
  void badSelections;
  void badCards;
  void badTargets;
  void badRestrictions;
  void badTimerPlayers;
});

test("TYP-001F does not introduce out-of-scope public or engine result exports", () => {
  type OutOfScopeExportWitness = [
    // @ts-expect-error TYP-001F must not export GameState.
    Types.GameState,
    // @ts-expect-error TYP-001F must not export EngineStepResult.
    Types.EngineStepResult,
    // @ts-expect-error TYP-001F must not export EngineResult.
    Types.EngineResult,
    // @ts-expect-error TYP-001F must not export EngineError.
    Types.EngineError,
    // @ts-expect-error TYP-001F must not export StateHashInput.
    Types.StateHashInput,
    // @ts-expect-error TYP-001F must not export AtomicMutation.
    Types.AtomicMutation,
    // @ts-expect-error TYP-001F must not export CustomHandler.
    Types.CustomHandler,
    // @ts-expect-error TYP-001F must not export PlayerView.
    Types.PlayerView,
    // @ts-expect-error TYP-001F must not export SpectatorView.
    Types.SpectatorView,
    // @ts-expect-error TYP-001F must not export PublicDecision.
    Types.PublicDecision,
    // @ts-expect-error TYP-001F must not export PublicLegalAction.
    Types.PublicLegalAction,
    // @ts-expect-error TYP-001F must not export PublicActionWindow.
    Types.PublicActionWindow,
  ];
  const outOfScopeExportWitness: OutOfScopeExportWitness | null = null;

  expect(outOfScopeExportWitness).toBeNull();
});
