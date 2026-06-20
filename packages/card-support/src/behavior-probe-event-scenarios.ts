import {
  applyAction,
  evaluateEffectBlockRuntimeSupport,
  getLegalActions,
} from "@optcg/engine-core";
import { materializeEffectDefinition } from "@optcg/cards";
import type {
  Action,
  CardFilter,
  CardId,
  CardInstance,
  EffectDefinition,
  EngineResult,
  GameState,
  Keyword,
  PlayerId,
} from "@optcg/types";

import {
  configureProbeFieldSourceForScenario,
  fieldProbeSource,
  installProbeSourceMetadata,
  leaderProbeSource,
  resolvedProbeCard,
  setupProbeMainState,
} from "./behavior-probe-scenario-state.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;
const blockerKeyword = "blocker" as Keyword;

interface BehaviorProbeRunResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly pendingDecisionDrained: boolean;
  readonly effectQueueDrained: boolean;
  readonly eventCount: number;
  readonly decisionsResolved: number;
  readonly setupFilterCount: number;
}

export const runCardPlayedScenario = (
  input: {
    readonly category: "character";
    readonly definition: EffectDefinition;
    readonly setupFilters: readonly CardFilter[];
    readonly text: string;
  },
  drainRuntime: (
    initialResult: EngineResult,
    setupFilterCount: number,
  ) => BehaviorProbeRunResult,
): BehaviorProbeRunResult => {
  const state = setupProbeMainState(input);
  installProbeSourceMetadata(state, "character", input.setupFilters);
  const player = must(state.players[p1], `player ${String(p1)}`);
  const source = fieldProbeSource(player);
  if (source === undefined) {
    return failedProbeFielding(state, input.setupFilters.length);
  }
  const played = addProbeHandCard(state, p1, {
    cardId: "probe-card-played-match" as CardId,
    category: "character",
  });
  return drainRuntime(
    applyAction(state, { type: "playCard", cardInstanceId: played.instanceId }),
    input.setupFilters.length,
  );
};

export const runEndOfYourTurnScenario = (
  input: {
    readonly category: "character";
    readonly definition: EffectDefinition;
    readonly setupFilters: readonly CardFilter[];
    readonly text: string;
  },
  drainRuntime: (
    initialResult: EngineResult,
    setupFilterCount: number,
  ) => BehaviorProbeRunResult,
): BehaviorProbeRunResult => {
  const state = setupProbeMainState(input);
  installProbeSourceMetadata(state, "character", input.setupFilters);
  const player = must(state.players[p1], `player ${String(p1)}`);
  const source = fieldProbeSource(player);
  if (source === undefined) {
    return failedProbeFielding(state, input.setupFilters.length);
  }
  return drainRuntime(
    applyAction(state, { type: "endMainPhase" }),
    input.setupFilters.length,
  );
};

export const runCardRestedScenario = (
  input: {
    readonly category: "character";
    readonly definition: EffectDefinition;
    readonly setupFilters: readonly CardFilter[];
    readonly text: string;
  },
  drainRuntime: (
    initialResult: EngineResult,
    setupFilterCount: number,
  ) => BehaviorProbeRunResult,
): BehaviorProbeRunResult => {
  const state = setupProbeMainState(input);
  state.turn.globalTurn = 3;
  state.turn.playerTurnCounts[p1] = 2;
  state.turn.playerTurnCounts[p2] = 1;
  installProbeSourceMetadata(state, "character", input.setupFilters);
  const player = must(state.players[p1], `player ${String(p1)}`);
  const source = fieldProbeSource(player);
  if (source === undefined) {
    return failedProbeFielding(state, input.setupFilters.length);
  }
  configureProbeFieldSourceForScenario(state, source, input.definition.effects);
  const defender = must(state.players[p2], `player ${String(p2)}`);
  defender.hand = [];
  return drainRuntime(
    applyAction(state, {
      type: "declareAttack",
      attacker: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      target: {
        instanceId: defender.leader.instanceId,
        cardId: defender.leader.cardId,
        playerId: p2,
        zone: defender.leader.zone,
      },
    }),
    input.setupFilters.length,
  );
};

export const runAttackDeclaredScenario = (
  input: {
    readonly category: "leader";
    readonly definition: EffectDefinition;
    readonly setupFilters: readonly CardFilter[];
    readonly text: string;
  },
  drainRuntime: (
    initialResult: EngineResult,
    setupFilterCount: number,
  ) => BehaviorProbeRunResult,
): BehaviorProbeRunResult => {
  const state = setupProbeMainState(input);
  state.turn.globalTurn = 3;
  state.turn.playerTurnCounts[p1] = 2;
  state.turn.playerTurnCounts[p2] = 1;
  const source = leaderProbeSource(state);
  installProbeSourceMetadata(state, "leader", input.setupFilters);
  configureProbeFieldSourceForScenario(state, source, input.definition.effects);
  const defender = must(state.players[p2], `player ${String(p2)}`);
  source.state = "active";
  defender.leader.state = "active";
  defender.hand = [];
  return drainRuntime(
    applyAction(state, {
      type: "declareAttack",
      attacker: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      target: {
        instanceId: defender.leader.instanceId,
        cardId: defender.leader.cardId,
        playerId: p2,
        zone: defender.leader.zone,
      },
    }),
    input.setupFilters.length,
  );
};

export const runDonReturnedScenario = (
  input: {
    readonly category: "character";
    readonly definition: EffectDefinition;
    readonly setupFilters: readonly CardFilter[];
    readonly text: string;
  },
  drainRuntime: (
    initialResult: EngineResult,
    setupFilterCount: number,
  ) => BehaviorProbeRunResult,
): BehaviorProbeRunResult => {
  const state = setupProbeMainState(input);
  installProbeSourceMetadata(state, "character", input.setupFilters);
  state.turn.turnPlayerId = p2;
  state.turn.playerTurnCounts[p2] = Math.max(
    state.turn.playerTurnCounts[p2] ?? 0,
    1,
  );
  const player = must(state.players[p1], `player ${String(p1)}`);
  const source = fieldProbeSource(player);
  if (source === undefined) {
    return failedProbeFielding(state, input.setupFilters.length);
  }
  configureProbeFieldSourceForScenario(state, source, input.definition.effects);
  const event = addSupportedEventCard({
    state,
    playerId: p2,
    cardId: "probe-don-return-event" as CardId,
    effectText:
      "[Main] Your opponent returns 1 DON!! card from their field to their DON!! deck.",
    sourceTextHash: "behavior-probe-don-return-event",
  });
  return drainRuntime(
    applyAction(state, { type: "playCard", cardInstanceId: event.instanceId }),
    input.setupFilters.length,
  );
};

export const runEffectQueuedScenario = (
  input: {
    readonly category: "character";
    readonly definition: EffectDefinition;
    readonly setupFilters: readonly CardFilter[];
    readonly text: string;
  },
  drainRuntime: (
    initialResult: EngineResult,
    setupFilterCount: number,
  ) => BehaviorProbeRunResult,
): BehaviorProbeRunResult => {
  const state = setupProbeMainState(input);
  installProbeSourceMetadata(state, "character", input.setupFilters);
  state.turn.globalTurn = 3;
  state.turn.turnPlayerId = p2;
  state.turn.playerTurnCounts[p1] = 1;
  state.turn.playerTurnCounts[p2] = 2;
  const defender = must(state.players[p1], `player ${String(p1)}`);
  const attacker = must(state.players[p2], `player ${String(p2)}`);
  attacker.leader.state = "active";
  defender.leader.state = "active";
  const source = fieldProbeSource(defender);
  if (source === undefined) {
    return failedProbeFielding(state, input.setupFilters.length);
  }
  configureProbeFieldSourceForScenario(state, source, input.definition.effects);
  defender.hand = [];
  const event = addSupportedEventCard({
    state,
    playerId: p1,
    cardId: "probe-effect-queued-counter-event" as CardId,
    effectText:
      "[Counter] Up to 1 of your Leader or Character cards gains +1000 power during this battle.",
    sourceTextHash: "behavior-probe-effect-queued-counter-event",
  });
  const opened = applyAction(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.leader.instanceId,
      cardId: attacker.leader.cardId,
      playerId: p2,
      zone: attacker.leader.zone,
    },
    target: {
      instanceId: defender.leader.instanceId,
      cardId: defender.leader.cardId,
      playerId: p1,
      zone: defender.leader.zone,
    },
  });
  if (opened.errors !== undefined) {
    return drainRuntime(opened, input.setupFilters.length);
  }
  const counterAction = getLegalActions(opened.state, p1).find(
    (action): action is Extract<Action, { type: "useCounter" }> =>
      action.type === "useCounter" &&
      action.cardInstanceId === event.instanceId,
  );
  if (counterAction === undefined) {
    return failedScenarioResult(
      opened.state,
      opened.events.length,
      0,
      input.setupFilters.length,
      "no legal useCounter action",
    );
  }
  return drainRuntime(
    applyAction(opened.state, counterAction),
    input.setupFilters.length,
  );
};

export const runFieldRemovedScenario = (
  input: {
    readonly category: "character";
    readonly definition: EffectDefinition;
    readonly setupFilters: readonly CardFilter[];
    readonly text: string;
  },
  drainRuntime: (
    initialResult: EngineResult,
    setupFilterCount: number,
  ) => BehaviorProbeRunResult,
): BehaviorProbeRunResult => {
  const state = setupProbeMainState(input);
  installProbeSourceMetadata(state, "character", input.setupFilters);
  const player = must(state.players[p1], `player ${String(p1)}`);
  const source = fieldProbeSource(player);
  if (source === undefined) {
    return failedProbeFielding(state, input.setupFilters.length);
  }
  addProbeFieldCharacter(state, p2, "probe-field-removed-target" as CardId);
  const removalEvent = addFieldRemovalEventCard(state);
  return drainRuntime(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: removalEvent.instanceId,
    }),
    input.setupFilters.length,
  );
};

export const runOnBlockScenario = (
  input: {
    readonly category: "character";
    readonly definition: EffectDefinition;
    readonly setupFilters: readonly CardFilter[];
    readonly text: string;
  },
  drainRuntime: (
    initialResult: EngineResult,
    setupFilterCount: number,
  ) => BehaviorProbeRunResult,
): BehaviorProbeRunResult => {
  const state = setupProbeMainState(input);
  installProbeSourceMetadata(state, "character", input.setupFilters);
  state.turn.globalTurn = 3;
  state.turn.turnPlayerId = p2;
  state.turn.playerTurnCounts[p1] = 1;
  state.turn.playerTurnCounts[p2] = 2;
  const defender = must(state.players[p1], `player ${String(p1)}`);
  const attacker = must(state.players[p2], `player ${String(p2)}`);
  attacker.leader.state = "active";
  defender.leader.state = "active";
  const source = fieldProbeSource(defender);
  if (source === undefined) {
    return failedProbeFielding(state, input.setupFilters.length);
  }
  configureProbeFieldSourceForScenario(state, source, input.definition.effects);
  const metadata = state.cardManifest.cards[source.cardId];
  if (metadata !== undefined) {
    state.cardManifest.cards[source.cardId] = {
      ...metadata,
      printedKeywords: [
        ...new Set([...metadata.printedKeywords, blockerKeyword]),
      ],
    };
  }
  defender.hand = [];
  const opened = applyAction(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.leader.instanceId,
      cardId: attacker.leader.cardId,
      playerId: p2,
      zone: attacker.leader.zone,
    },
    target: {
      instanceId: defender.leader.instanceId,
      cardId: defender.leader.cardId,
      playerId: p1,
      zone: defender.leader.zone,
    },
  });
  if (opened.errors !== undefined) {
    return drainRuntime(opened, input.setupFilters.length);
  }
  const blockAction: Extract<Action, { type: "respondToDecision" }> = {
    type: "respondToDecision",
    decisionId: must(opened.state.pendingDecision, "block decision").id,
    response: {
      type: "cards",
      cards: [
        {
          instanceId: source.instanceId,
          cardId: source.cardId,
          playerId: p1,
          zone: source.zone,
        },
      ],
    },
  };
  return drainRuntime(
    applyAction(opened.state, blockAction),
    input.setupFilters.length,
  );
};

export const runHandTrashedByEffectScenario = (
  input: {
    readonly category: "character";
    readonly definition: EffectDefinition;
    readonly setupFilters: readonly CardFilter[];
    readonly text: string;
  },
  drainRuntime: (
    initialResult: EngineResult,
    setupFilterCount: number,
  ) => BehaviorProbeRunResult,
): BehaviorProbeRunResult => {
  const state = setupProbeMainState(input);
  installProbeSourceMetadata(state, "character", input.setupFilters);
  const player = must(state.players[p1], `player ${String(p1)}`);
  const source = fieldProbeSource(player);
  if (source === undefined) {
    return failedProbeFielding(state, input.setupFilters.length);
  }
  configureProbeFieldSourceForScenario(state, source, input.definition.effects);
  for (const card of player.hand) {
    state.cardManifest.cards[card.cardId] = resolvedProbeCard({
      cardId: card.cardId,
      category: "character",
      effectText: "",
    });
  }
  const event = addSupportedEventCard({
    state,
    playerId: p1,
    cardId: "probe-hand-trash-event" as CardId,
    effectText: "[Main] Trash 1 card from your hand.",
    sourceTextHash: "behavior-probe-hand-trash-event",
  });
  return drainRuntime(
    applyAction(state, { type: "playCard", cardInstanceId: event.instanceId }),
    input.setupFilters.length,
  );
};

export const runOpponentActivatedScenario = (
  input: {
    readonly category: "character";
    readonly definition: EffectDefinition;
    readonly setupFilters: readonly CardFilter[];
    readonly text: string;
  },
  drainRuntime: (
    initialResult: EngineResult,
    setupFilterCount: number,
  ) => BehaviorProbeRunResult,
): BehaviorProbeRunResult => {
  const state = setupProbeMainState(input);
  installProbeSourceMetadata(state, "character", input.setupFilters);
  state.turn.turnPlayerId = p2;
  state.turn.playerTurnCounts[p2] = Math.max(
    state.turn.playerTurnCounts[p2] ?? 0,
    1,
  );
  const player = must(state.players[p1], `player ${String(p1)}`);
  const source = fieldProbeSource(player);
  if (source === undefined) {
    return failedProbeFielding(state, input.setupFilters.length);
  }
  const event = addOpponentActivationEventCard(state);
  return drainRuntime(
    applyAction(state, { type: "playCard", cardInstanceId: event.instanceId }),
    input.setupFilters.length,
  );
};

export const runTriggerActivatedScenario = (
  input: {
    readonly category: "character";
    readonly definition: EffectDefinition;
    readonly setupFilters: readonly CardFilter[];
    readonly text: string;
  },
  drainRuntime: (
    initialResult: EngineResult,
    setupFilterCount: number,
  ) => BehaviorProbeRunResult,
): BehaviorProbeRunResult => {
  const state = setupProbeMainState(input);
  state.turn.globalTurn = 3;
  state.turn.turnPlayerId = p2;
  state.turn.playerTurnCounts[p1] = 1;
  state.turn.playerTurnCounts[p2] = 2;
  installProbeSourceMetadata(state, "character", input.setupFilters);
  const defender = must(state.players[p1], `player ${String(p1)}`);
  const attacker = must(state.players[p2], `player ${String(p2)}`);
  attacker.leader.state = "active";
  defender.leader.state = "active";
  const source = fieldProbeSource(defender);
  if (source === undefined) {
    return failedProbeFielding(state, input.setupFilters.length);
  }
  configureProbeFieldSourceForScenario(state, source, input.definition.effects);
  defender.hand = [];
  installLifeTriggerProbeCard(state, defender);

  return drainRuntime(
    applyAction(state, {
      type: "declareAttack",
      attacker: {
        instanceId: attacker.leader.instanceId,
        cardId: attacker.leader.cardId,
        playerId: p2,
        zone: attacker.leader.zone,
      },
      target: {
        instanceId: defender.leader.instanceId,
        cardId: defender.leader.cardId,
        playerId: p1,
        zone: defender.leader.zone,
      },
    }),
    input.setupFilters.length,
  );
};

const failedProbeFielding = (
  state: GameState,
  setupFilterCount: number,
): BehaviorProbeRunResult => ({
  ok: false,
  reason: "probe card could not be fielded",
  pendingDecisionDrained: state.pendingDecision === undefined,
  effectQueueDrained: state.effectQueue.length === 0,
  eventCount: 0,
  decisionsResolved: 0,
  setupFilterCount,
});

const failedScenarioResult = (
  state: GameState,
  eventCount: number,
  decisionsResolved: number,
  setupFilterCount: number,
  reason: string,
): BehaviorProbeRunResult => ({
  ok: false,
  reason,
  pendingDecisionDrained: state.pendingDecision === undefined,
  effectQueueDrained: state.effectQueue.length === 0,
  eventCount,
  decisionsResolved,
  setupFilterCount,
});

const addProbeHandCard = (
  state: GameState,
  playerId: PlayerId,
  params: {
    readonly cardId: CardId;
    readonly category: "character" | "event";
    readonly effectText?: string;
  },
): CardInstance => {
  const player = must(state.players[playerId], `player ${String(playerId)}`);
  state.cardManifest.cards[params.cardId] =
    state.cardManifest.cards[params.cardId] ??
    resolvedProbeCard({
      cardId: params.cardId,
      category: params.category,
      effectText: params.effectText ?? "",
    });
  const card: CardInstance = {
    instanceId:
      `${String(params.cardId)}:instance` as CardInstance["instanceId"],
    cardId: params.cardId,
    owner: playerId,
    controller: playerId,
    zone: {
      zone: "hand",
      playerId,
      slot: "hand",
      index: player.hand.length,
    },
    state: "active",
    attachedDon: [],
    turnPlayed: 0,
  };
  player.hand = [...player.hand, card];
  return card;
};

const addProbeFieldCharacter = (
  state: GameState,
  playerId: PlayerId,
  cardId: CardId,
): CardInstance => {
  const player = must(state.players[playerId], `player ${String(playerId)}`);
  state.cardManifest.cards[cardId] = resolvedProbeCard({
    cardId,
    category: "character",
    effectText: "",
  });
  const card: CardInstance = {
    instanceId: `${String(cardId)}:instance` as CardInstance["instanceId"],
    cardId,
    owner: playerId,
    controller: playerId,
    zone: {
      zone: "characterArea",
      playerId,
      slot: "character",
      index: player.characters.length,
    },
    state: "active",
    attachedDon: [],
    turnPlayed: 0,
  };
  player.characters = [...player.characters, card];
  return card;
};

const addFieldRemovalEventCard = (state: GameState): CardInstance => {
  return addSupportedEventCard({
    state,
    playerId: p1,
    cardId: "probe-field-removal-event" as CardId,
    effectText: "[Main] K.O. up to 1 of your opponent's Characters.",
    sourceTextHash: "behavior-probe-field-removal-event",
  });
};

const addOpponentActivationEventCard = (state: GameState): CardInstance => {
  return addSupportedEventCard({
    state,
    playerId: p2,
    cardId: "probe-opponent-activation-event" as CardId,
    effectText: "[Main] Draw 1 card.",
    sourceTextHash: "behavior-probe-opponent-activation-event",
  });
};

const installLifeTriggerProbeCard = (
  state: GameState,
  player: NonNullable<GameState["players"][PlayerId]>,
): void => {
  const topLife = must(player.life[0], "trigger activation top Life");
  const triggerCardId = "probe-trigger-activation-life" as CardId;
  const effectText = "[Trigger] Draw 1 card.";
  const materialized = materializeEffectDefinition(
    triggerCardId,
    [effectText],
    "behavior-probe-trigger-activation",
    {
      effectDefinitionsVersion: "behavior-probe",
      rulesVersion: "behavior-probe",
    },
    { evaluateRuntimeSupport: evaluateEffectBlockRuntimeSupport },
  );
  const definition = must(
    materialized.definition,
    "trigger activation definition",
  );
  const effectDefinitionId = `${String(triggerCardId)}.behavior-probe`;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[triggerCardId] = resolvedProbeCard({
    cardId: triggerCardId,
    category: "character",
    effectText,
    support: {
      cardId: triggerCardId,
      status: "implemented-dsl",
      tested: true,
      rulesVersion: "behavior-probe",
      cardDataVersion: "behavior-probe",
      sourceTextHash: "behavior-probe-trigger-activation",
      behaviorHash: "behavior-probe-trigger-activation",
      effectDefinitionId,
    },
  });
  const resolved = must(
    state.cardManifest.cards[triggerCardId],
    "trigger activation card metadata",
  );
  state.cardManifest.cards[triggerCardId] = {
    ...resolved,
    triggerText: effectText,
  };
  player.life[0] = {
    ...topLife,
    card: {
      ...topLife.card,
      cardId: triggerCardId,
    },
  };
};

const addSupportedEventCard = (params: {
  readonly state: GameState;
  readonly playerId: PlayerId;
  readonly cardId: CardId;
  readonly effectText: string;
  readonly sourceTextHash: string;
}): CardInstance => {
  const materialized = materializeEffectDefinition(
    params.cardId,
    [params.effectText],
    params.sourceTextHash,
    {
      effectDefinitionsVersion: "behavior-probe",
      rulesVersion: "behavior-probe",
    },
    { evaluateRuntimeSupport: evaluateEffectBlockRuntimeSupport },
  );
  const definition = must(
    materialized.definition,
    `${String(params.cardId)} event definition`,
  );
  const effectDefinitionId = `${String(params.cardId)}.behavior-probe`;
  params.state.cardManifest.effectDefinitions = {
    ...params.state.cardManifest.effectDefinitions,
    [effectDefinitionId]: definition,
  };
  params.state.cardManifest.cards[params.cardId] = resolvedProbeCard({
    cardId: params.cardId,
    category: "event",
    effectText: params.effectText,
    support: {
      cardId: params.cardId,
      status: "implemented-dsl",
      tested: true,
      rulesVersion: "behavior-probe",
      cardDataVersion: "behavior-probe",
      sourceTextHash: params.sourceTextHash,
      behaviorHash: params.sourceTextHash,
      effectDefinitionId,
    },
  });
  return addProbeHandCard(params.state, params.playerId, {
    cardId: params.cardId,
    category: "event",
    effectText: params.effectText,
  });
};

const must = <T>(value: T | undefined, label: string): T => {
  if (value === undefined) {
    throw new Error(`Behavior probe missing ${label}.`);
  }
  return value;
};
