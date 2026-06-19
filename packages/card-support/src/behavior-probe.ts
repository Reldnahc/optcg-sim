import {
  applyAction,
  createInitialState,
  evaluateEffectBlockRuntimeSupport,
  getLegalActions,
  respondToMulliganDecision,
  startMulliganFlow,
} from "@optcg/engine-core";
import type {
  Action,
  CardId,
  CardInstance,
  EffectBlock,
  EngineResult,
  GameState,
  LegalAction,
  MatchCardManifest,
  MatchId,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";
import {
  gameplayLinesFromTextParts,
  materializeEffectDefinition,
  parseRawKeywordLine,
} from "@optcg/cards";

export interface BehaviorProbeRequest {
  readonly text: string;
}

export interface BehaviorProbeReport {
  readonly exitCode: number;
  readonly lines: readonly string[];
  readonly errors: readonly string[];
}

type SupportedScenario =
  | { readonly kind: "playCard"; readonly category: "character" | "event" }
  | { readonly kind: "skipped"; readonly reason: string };

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;
const probeCardId = "probe-card" as CardId;
const probeDefinitionId = "probe-card.behavior-probe";
const maxDecisionSteps = 30;

export const createBehaviorProbeReport = (
  request: BehaviorProbeRequest,
): BehaviorProbeReport => {
  const effectLines = gameplayLinesFromTextParts([request.text]).filter(
    (line) => parseRawKeywordLine({ text: line }) === undefined,
  );
  const materialized = materializeEffectDefinition(
    probeCardId,
    effectLines,
    "behavior-probe-source",
    {
      effectDefinitionsVersion: "behavior-probe",
      rulesVersion: "behavior-probe",
    },
    { evaluateRuntimeSupport: evaluateEffectBlockRuntimeSupport },
  );

  if (!materialized.runtimeSupported || materialized.definition === undefined) {
    return {
      exitCode: 1,
      lines: [
        "Behavior probe: failed",
        ...materialized.diagnostics.map(
          (diagnostic) => `Behavior probe diagnostic: ${diagnostic}`,
        ),
      ],
      errors: [],
    };
  }

  const scenario = scenarioForDefinition(materialized.definition.effects);
  if (scenario.kind === "skipped") {
    return {
      exitCode: 0,
      lines: [
        "Behavior probe: skipped",
        `Scenario 1 result: skipped - ${scenario.reason}`,
      ],
      errors: [],
    };
  }

  const result = runPlayCardScenario({
    category: scenario.category,
    definition: {
      ...materialized.definition,
      metadata: {
        ...materialized.definition.metadata,
        effectDefinitionsVersion: "behavior-probe",
      },
    },
    text: request.text,
  });
  const passed = result.ok;
  const resultLine = passed
    ? "passed"
    : `failed - ${result.reason ?? "unknown reason"}`;
  return {
    exitCode: passed ? 0 : 1,
    lines: [
      `Behavior probe: ${passed ? "passed" : "failed"}`,
      "Scenario 1 entrypoint: playCard",
      `Scenario 1 card category: ${scenario.category}`,
      `Scenario 1 result: ${resultLine}`,
      "Scenario 1 decision policy: max-progress",
      `Scenario 1 pending decisions: ${result.pendingDecisionDrained ? "drained" : "pending"}`,
      `Scenario 1 effect queue: ${result.effectQueueDrained ? "drained" : "pending"}`,
      `Scenario 1 decisions resolved: ${String(result.decisionsResolved)}`,
      `Scenario 1 events: ${String(result.eventCount)}`,
    ],
    errors: [],
  };
};

const scenarioForDefinition = (
  effects: readonly EffectBlock[],
): SupportedScenario => {
  const firstTrigger = effects[0]?.trigger.type;
  if (firstTrigger === undefined) {
    return { kind: "skipped", reason: "no runtime effect blocks" };
  }
  if (effects.every((effect) => effect.trigger.type === "onPlay")) {
    return { kind: "playCard", category: "character" };
  }
  if (effects.every((effect) => effect.trigger.type === "main")) {
    return { kind: "playCard", category: "event" };
  }
  return {
    kind: "skipped",
    reason: `no generated scenario for trigger ${firstTrigger}`,
  };
};

const runPlayCardScenario = (input: {
  readonly category: "character" | "event";
  readonly definition: NonNullable<
    ReturnType<typeof materializeEffectDefinition>["definition"]
  >;
  readonly text: string;
}): {
  readonly ok: boolean;
  readonly reason?: string;
  readonly pendingDecisionDrained: boolean;
  readonly effectQueueDrained: boolean;
  readonly eventCount: number;
  readonly decisionsResolved: number;
} => {
  const state = setupProbeMainState(input);
  const player = state.players[p1];
  const card = player?.hand.find(
    (candidate) => candidate.cardId === probeCardId,
  );
  if (card === undefined) {
    return {
      ok: false,
      reason: "probe card was not in hand",
      pendingDecisionDrained: state.pendingDecision === undefined,
      effectQueueDrained: state.effectQueue.length === 0,
      eventCount: 0,
      decisionsResolved: 0,
    };
  }

  const opened = applyAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  return drainRuntime(opened);
};

const drainRuntime = (
  initialResult: EngineResult,
): {
  readonly ok: boolean;
  readonly reason?: string;
  readonly pendingDecisionDrained: boolean;
  readonly effectQueueDrained: boolean;
  readonly eventCount: number;
  readonly decisionsResolved: number;
} => {
  let result = initialResult;
  let state = result.state;
  let eventCount = result.events.length;
  let decisionsResolved = 0;
  for (let step = 0; step < maxDecisionSteps; step += 1) {
    if (result.errors !== undefined && result.errors.length > 0) {
      return drainResult(
        false,
        state,
        eventCount,
        decisionsResolved,
        engineErrorReason(result.errors[0]),
      );
    }
    if (
      state.pendingDecision === undefined &&
      state.effectQueue.length === 0 &&
      state.deferredTriggers.length === 0
    ) {
      return drainResult(true, state, eventCount, decisionsResolved);
    }

    const decision = state.pendingDecision;
    if (decision === undefined) {
      return drainResult(
        false,
        state,
        eventCount,
        decisionsResolved,
        "runtime work did not drain",
      );
    }
    const nextAction =
      chooseDecisionAction(getLegalActions(state, decision.playerId)) ??
      choosePendingDecisionAction(state);
    if (nextAction === undefined) {
      return drainResult(
        false,
        state,
        eventCount,
        decisionsResolved,
        `no legal response for ${decision.type}`,
      );
    }
    result = applyAction(state, nextAction);
    state = result.state;
    eventCount += result.events.length;
    decisionsResolved += 1;
  }

  return drainResult(
    false,
    state,
    eventCount,
    decisionsResolved,
    "decision drain step limit hit",
  );
};

const drainResult = (
  ok: boolean,
  state: GameState,
  eventCount: number,
  decisionsResolved: number,
  reason?: string,
) => ({
  ok,
  ...(reason === undefined ? {} : { reason }),
  pendingDecisionDrained: state.pendingDecision === undefined,
  effectQueueDrained: state.effectQueue.length === 0,
  eventCount,
  decisionsResolved,
});

const chooseDecisionAction = (
  legalActions: readonly LegalAction[],
): Extract<Action, { type: "respondToDecision" }> | undefined => {
  const responses = legalActions.filter(
    (action): action is Extract<Action, { type: "respondToDecision" }> =>
      action.type === "respondToDecision",
  );
  if (responses.length === 0) {
    return undefined;
  }
  return [...responses].sort(compareDecisionProgress)[0];
};

const compareDecisionProgress = (
  left: Extract<Action, { type: "respondToDecision" }>,
  right: Extract<Action, { type: "respondToDecision" }>,
): number => decisionScore(right) - decisionScore(left);

const decisionScore = (
  action: Extract<Action, { type: "respondToDecision" }>,
): number => {
  const response = action.response;
  switch (response.type) {
    case "optionalActivation":
      return response.choice === "activate" ? 100 : 0;
    case "payment":
      return (
        90 +
        selectionCount(response.selectedCardInstanceIds) +
        selectionCount(response.selectedDonInstanceIds)
      );
    case "paymentDeclined":
      return 0;
    case "chooseQuantity":
      return 80 + response.quantity;
    case "targets":
      return 70 + response.targets.length;
    case "cards":
      return 60 + response.cards.length;
    case "effectOption":
      return 50;
    case "effectOptionDeclined":
      return 0;
    case "lifeTrigger":
      return response.choice === "activateTrigger" ? 40 : 0;
    case "replacement":
      return response.replacementId === undefined ? 0 : 30;
    case "orderedIds":
      return 20 + response.ids.length;
    case "topBottomPlacement":
      return 20 + response.topIds.length + response.bottomIds.length;
    case "loopCount":
      return 10 + response.count;
    case "mulligan":
    case "rollbackConsent":
      return 1;
  }
};

const selectionCount = (values: readonly unknown[] | undefined): number =>
  values?.length ?? 0;

const choosePendingDecisionAction = (
  state: GameState,
): Extract<Action, { type: "respondToDecision" }> | undefined => {
  const decision = state.pendingDecision;
  if (decision === undefined || decision.type !== "orderCards") {
    return undefined;
  }
  if (decision.placement?.type === "topOrBottom") {
    return {
      type: "respondToDecision",
      decisionId: decision.id,
      response: {
        type: "topBottomPlacement",
        topIds: [],
        bottomIds: decision.cards.map((card) => String(card.instanceId)),
      },
    };
  }
  return {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "orderedIds",
      ids: decision.cards.map((card) => String(card.instanceId)),
    },
  };
};

const setupProbeMainState = (input: {
  readonly category: "character" | "event";
  readonly definition: NonNullable<
    ReturnType<typeof materializeEffectDefinition>["definition"]
  >;
  readonly text: string;
}): GameState => {
  const setup = createInitialState({
    matchId: "behavior-probe-match" as MatchId,
    firstPlayerId: p1,
    rngSeed: "behavior-probe-seed",
    playerOrder: [p1, p2],
    leaderCardIds: {
      [p1]: "probe-leader-p1" as CardId,
      [p2]: "probe-leader-p2" as CardId,
    },
    leaderLifeCounts: {
      [p1]: 2,
      [p2]: 2,
    },
    deckCardIds: {
      [p1]: [
        probeCardId,
        "probe-p1-a" as CardId,
        "probe-p1-b" as CardId,
        "probe-p1-c" as CardId,
        "probe-p1-d" as CardId,
        "probe-p1-e" as CardId,
        "probe-p1-f" as CardId,
        "probe-p1-g" as CardId,
        "probe-p1-h" as CardId,
        "probe-p1-i" as CardId,
      ],
      [p2]: [
        "probe-p2-a" as CardId,
        "probe-p2-b" as CardId,
        "probe-p2-c" as CardId,
        "probe-p2-d" as CardId,
        "probe-p2-e" as CardId,
        "probe-p2-f" as CardId,
        "probe-p2-g" as CardId,
        "probe-p2-h" as CardId,
      ],
    },
    donDeckCardIds: {
      [p1]: probeDonCardIds("p1"),
      [p2]: probeDonCardIds("p2"),
    },
    cardManifest: createProbeManifest(),
    shuffleDecks: false,
  });
  const started = startMulliganFlow(setup);
  const first = respondToMulliganDecision(started.state, {
    type: "respondToDecision",
    decisionId: must(started.state.pendingDecision, "first mulligan").id,
    response: { type: "mulligan", keep: true },
  });
  const active = respondToMulliganDecision(first.state, {
    type: "respondToDecision",
    decisionId: must(first.state.pendingDecision, "second mulligan").id,
    response: { type: "mulligan", keep: true },
  }).state;
  active.turn.phase = "main";
  active.turn.turnPlayerId = p1;
  installActiveDon(active, p1);
  installActiveDon(active, p2);
  installProbeManifest(active, input);
  installGenericSearchableDeckMetadata(active, p1);
  installGenericSearchableDeckMetadata(active, p2);
  addProbeDeckCards(active, p1, 4);
  return active;
};

const createProbeManifest = (): MatchCardManifest => ({
  manifestHash: "behavior-probe-manifest",
  source: "manual-test",
  cardDataVersion: "behavior-probe",
  effectDefinitionsVersion: "behavior-probe",
  customHandlerVersion: "behavior-probe",
  banlistVersion: "behavior-probe",
  createdAt: "2026-06-19T00:00:00.000Z",
  cards: {},
});

const installProbeManifest = (
  state: GameState,
  input: {
    readonly category: "character" | "event";
    readonly definition: NonNullable<
      ReturnType<typeof materializeEffectDefinition>["definition"]
    >;
    readonly text: string;
  },
): void => {
  const definition = {
    ...input.definition,
    cardId: probeCardId,
  };
  const support: ResolvedCard["support"] = {
    cardId: probeCardId,
    status: "implemented-dsl",
    tested: true,
    rulesVersion: "behavior-probe",
    cardDataVersion: "behavior-probe",
    sourceTextHash: "behavior-probe-source",
    behaviorHash: "behavior-probe-behavior",
    effectDefinitionId: probeDefinitionId,
  };
  state.cardManifest.effectDefinitionsVersion = "behavior-probe";
  state.cardManifest.effectDefinitions = {
    [probeDefinitionId]: definition,
  };
  state.cardManifest.cards[probeCardId] = resolvedProbeCard({
    cardId: probeCardId,
    category: input.category,
    effectText: input.text,
    support,
  });
};

const installActiveDon = (state: GameState, playerId: PlayerId): void => {
  const player = must(state.players[playerId], `player ${String(playerId)}`);
  player.costArea = player.donDeck.map((card, index) => ({
    ...card,
    zone: { zone: "costArea", playerId, slot: "cost", index },
    state: "active",
  }));
  player.donDeck = [];
};

const addProbeDeckCards = (
  state: GameState,
  playerId: PlayerId,
  count: number,
): void => {
  const player = must(state.players[playerId], `player ${String(playerId)}`);
  const cards = Array.from({ length: count }, (_, index): CardInstance => {
    const cardId = `probe-extra-${String(playerId)}-${String(index)}` as CardId;
    state.cardManifest.cards[cardId] = resolvedProbeCard({
      cardId,
      category: "character",
      effectText: "",
      searchProfile: "broad",
    });
    return {
      instanceId:
        `probe-extra-${String(playerId)}-${String(index)}:instance` as CardInstance["instanceId"],
      cardId,
      owner: playerId,
      controller: playerId,
      zone: {
        zone: "deck",
        playerId,
        slot: "deck",
        index: player.deck.length + index,
      },
      state: "active",
      attachedDon: [],
      turnPlayed: 0,
    };
  });
  player.deck = [...player.deck, ...cards];
};

const installGenericSearchableDeckMetadata = (
  state: GameState,
  playerId: PlayerId,
): void => {
  const player = must(state.players[playerId], `player ${String(playerId)}`);
  for (const card of player.deck) {
    state.cardManifest.cards[card.cardId] = resolvedProbeCard({
      cardId: card.cardId,
      category: "character",
      effectText: "",
      searchProfile: "broad",
    });
  }
};

const engineErrorReason = (
  error: EngineResult["errors"] extends readonly (infer T)[] | undefined
    ? T | undefined
    : never,
): string | undefined => {
  if (error === undefined) {
    return undefined;
  }
  switch (error.type) {
    case "illegalAction":
    case "invalidDecisionResponse":
      return error.reason;
    case "invariantViolation":
      return `invariant violation: ${error.invariant}`;
    case "unsupportedCard":
      return `unsupported card: ${String(error.cardId)} ${error.status}`;
    case "effectRuntimeError":
      return `effect runtime error: ${error.effectId}`;
    case "loopDetected":
      return "loop detected";
  }
};

const probeDonCardIds = (player: "p1" | "p2"): CardId[] =>
  Array.from(
    { length: 10 },
    (_, index) => `probe-${player}-don-${String(index + 1)}` as CardId,
  );

const resolvedProbeCard = (params: {
  readonly cardId: CardId;
  readonly category: "leader" | "character" | "event" | "don" | "stage";
  readonly effectText: string;
  readonly searchProfile?: "broad";
  readonly support?: ResolvedCard["support"];
}): ResolvedCard => ({
  cardId: params.cardId,
  language: "en",
  name: String(params.cardId),
  category: params.category,
  set: "PROBE",
  setName: "Behavior Probe",
  released: true,
  colors: params.category === "don" ? [] : ["red"],
  attributes: [],
  types:
    params.searchProfile === "broad"
      ? [
          "Land of Wano",
          "Sky Island",
          "Red-Haired Pirates",
          "Dressrosa",
          "Straw Hat Crew",
          "Navy",
        ]
      : [],
  printedKeywords: [],
  variants: [],
  legality: {},
  officialFaq: [],
  errata: [],
  sourceTextHash: "behavior-probe-source",
  behaviorHash: "behavior-probe-behavior",
  support: params.support ?? {
    cardId: params.cardId,
    status: "vanilla-confirmed",
    tested: true,
    rulesVersion: "behavior-probe",
    cardDataVersion: "behavior-probe",
    sourceTextHash: "behavior-probe-source",
    behaviorHash: "behavior-probe-behavior",
  },
  ...(params.category === "character" ? { cost: 0, power: 2000 } : {}),
  ...(params.category === "event" ? { cost: 0 } : {}),
  ...(params.effectText.length === 0 ? {} : { effectText: params.effectText }),
});

const must = <T>(value: T | undefined, label: string): T => {
  if (value === undefined) {
    throw new Error(`Behavior probe missing ${label}.`);
  }
  return value;
};
