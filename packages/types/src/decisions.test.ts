import { expect, test } from "vitest";

import type {
  Action,
  BaseDecision,
  CardRef,
  CardSelectionCandidate,
  CardId,
  ChooseEffectOptionDecision,
  ChooseQuantityDecision,
  ChooseQuantityResponse,
  ChooseOptionalActivationDecision,
  ChooseReplacementDecision,
  ChooseTriggerOrderDecision,
  ConfirmLifeTriggerDecision,
  DecisionId,
  DecisionResponse,
  DeclareLoopCountDecision,
  EffectId,
  ExactQuantityDecision,
  LegalAction,
  MulliganDecision,
  OptionalPayCostDecision,
  OrderCardsDecision,
  PayCostDecision,
  PaymentDeclinedResponse,
  PaymentOption,
  PaymentResponse,
  PaymentSpec,
  PendingDecision,
  PlayerId,
  QueueEntryId,
  RollbackConsentDecision,
  SelectCardsDecision,
  SelectTargetsDecision,
  TargetCandidate,
} from "./index.js";

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
  const responseReplacementDecline: DecisionResponse = {
    type: "replacement",
  };
  const responseMulligan: DecisionResponse = { type: "mulligan", keep: true };
  const responseLoopCount: DecisionResponse = { type: "loopCount", count: 2 };
  const responseRollbackConsent: DecisionResponse = {
    type: "rollbackConsent",
    allow: true,
  };
  const responseChooseQuantity: ChooseQuantityResponse = {
    type: "chooseQuantity",
    quantity: 2,
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
    id: baseDecision.id,
    type: "chooseEffectOption",
    playerId: baseDecision.playerId,
    prompt: baseDecision.prompt,
    causedBy: baseDecision.causedBy,
    visibility: baseDecision.visibility,
    min: 1,
    max: 1,
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
  const chooseQuantity: ChooseQuantityDecision = {
    ...baseDecision,
    type: "chooseQuantity",
    min: 1,
    max: 3,
    mode: "upTo",
    defaultResponse: responseChooseQuantity,
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
    chooseQuantity,
  ];

  expect(pending).toHaveLength(13);
  expect(responseOrderedIds.type).toBe("orderedIds");
  expect(responseOptionalActivation.type).toBe("optionalActivation");
  expect(responsePayment.type).toBe("payment");
  expect(responseTargets.type).toBe("targets");
  expect(responseCards.type).toBe("cards");
  expect(responseEffectOption.type).toBe("effectOption");
  expect(responseLifeTrigger.type).toBe("lifeTrigger");
  expect(responseReplacement.type).toBe("replacement");
  expect(responseReplacementDecline.type).toBe("replacement");
  expect(responseMulligan.type).toBe("mulligan");
  expect(responseLoopCount.type).toBe("loopCount");
  expect(responseRollbackConsent.type).toBe("rollbackConsent");
  expect(responseChooseQuantity.type).toBe("chooseQuantity");
});

test("TYP-001E action contracts compile and reject transport envelope fields", () => {
  const cardRef: CardRef = {
    instanceId: "instance-1" as CardRef["instanceId"],
    cardId: "OP01-001" as CardId,
    playerId: "player-1" as PlayerId,
  };
  const response: DecisionResponse = { type: "loopCount", count: 1 };
  const quantityResponse: DecisionResponse = {
    type: "chooseQuantity",
    quantity: 2,
  };

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
    {
      type: "respondToDecision",
      decisionId: "decision-2" as DecisionId,
      response: quantityResponse,
    },
  ];
  const legalActions: LegalAction[] = actions;
  const actionsAgain: Action[] = legalActions;

  expect(actions).toHaveLength(10);
  expect(actionsAgain).toHaveLength(10);

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

test("TYP-007A exact quantity decisions require matching min and max", () => {
  const validExactQuantityDecision: ExactQuantityDecision<2> = {
    id: "decision-3" as DecisionId,
    type: "chooseQuantity",
    playerId: "player-1" as PlayerId,
    prompt: "Choose exactly 2",
    causedBy: { type: "playerAction", actionId: "action-2" },
    visibility: { type: "public" },
    mode: "exact",
    min: 2,
    max: 2,
  };
  const validUpToQuantityDecision: ChooseQuantityDecision = {
    ...validExactQuantityDecision,
    mode: "upTo",
    min: 0,
    max: 2,
  };
  const invalidExactQuantityDecision: ExactQuantityDecision<2> = {
    ...validExactQuantityDecision,
    // @ts-expect-error exact mode requires min and max to be identical.
    min: 1,
    max: 2,
  };
  expect(validExactQuantityDecision.mode).toBe("exact");
  expect(validUpToQuantityDecision.mode).toBe("upTo");
  void invalidExactQuantityDecision;
});

test("TYP-009A optional cost uses payCost with a canonical decline response", () => {
  const optionalCostDecision: OptionalPayCostDecision = {
    id: "decision-optional-cost-1" as DecisionId,
    type: "payCost",
    playerId: "player-1" as PlayerId,
    prompt: "You may return 1 DON!!",
    causedBy: {
      type: "effect",
      queueEntryId: "queue-1" as QueueEntryId,
      effectId: "effect-1" as EffectId,
    },
    visibility: { type: "public" },
    cost: {
      type: "returnDon",
      count: 1,
      chooser: "self",
      optional: true,
    },
    paymentOptions: [{ id: "return-1", type: "returnDon", count: 1 }],
    defaultResponse: { type: "paymentDeclined" },
  };

  const accepted: PaymentResponse = {
    type: "payment",
    optionId: "return-1",
    selectedDonInstanceIds: ["don-1" as CardRef["instanceId"]],
  };
  const declined: PaymentDeclinedResponse = { type: "paymentDeclined" };
  const acceptedDecisionResponse: DecisionResponse = accepted;
  const declinedDecisionResponse: DecisionResponse = declined;
  const pending: PendingDecision = optionalCostDecision;

  const malformedDecline: PaymentDeclinedResponse = {
    type: "paymentDeclined",
    // @ts-expect-error optional-cost decline carries no payment option details.
    optionId: "return-1",
  };
  const activationDecline: DecisionResponse = {
    type: "optionalActivation",
    choice: "decline",
  };

  expect(pending.type).toBe("payCost");
  expect(acceptedDecisionResponse.type).toBe("payment");
  expect(declinedDecisionResponse.type).toBe("paymentDeclined");
  expect(activationDecline.type).toBe("optionalActivation");
  void malformedDecline;
});

test("select cards decision can carry runtime play-source overflow metadata", () => {
  const decision: SelectCardsDecision = {
    id: "decision-play-source-overflow-1" as DecisionId,
    type: "selectCards",
    playerId: "player-1" as PlayerId,
    prompt: "Choose a Character to trash.",
    causedBy: {
      type: "effect",
      queueEntryId: "queue-1" as QueueEntryId,
      effectId: "effect-1" as EffectId,
    },
    visibility: { type: "private", playerId: "player-1" as PlayerId },
    request: {
      timing: "onResolution",
      chooser: "self",
      zone: "characterArea",
      min: 1,
      max: 1,
      allowFewerIfUnavailable: false,
    },
    candidates: [],
    runtime: {
      playSourceOverflow: {
        queueEntryId: "queue-1" as QueueEntryId,
        source: {
          instanceId: "card-1" as CardRef["instanceId"],
          cardId: "OP01-001" as CardId,
          playerId: "player-1" as PlayerId,
        },
        enterRested: false,
      },
    },
  };

  expect(decision.runtime?.playSourceOverflow?.queueEntryId).toBe("queue-1");
});
