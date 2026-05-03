import { expect, test } from "vitest";

import type {
  Action,
  BaseDecision,
  CardRef,
  CardSelectionCandidate,
  CardId,
  ChooseEffectOptionDecision,
  ChooseOptionalActivationDecision,
  ChooseReplacementDecision,
  ChooseTriggerOrderDecision,
  ConfirmLifeTriggerDecision,
  DecisionId,
  DecisionResponse,
  DeclareLoopCountDecision,
  EffectId,
  LegalAction,
  MulliganDecision,
  OrderCardsDecision,
  PayCostDecision,
  PaymentOption,
  PaymentSpec,
  PendingDecision,
  PlayerId,
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
