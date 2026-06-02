export type {
  CardInstance,
  CardSnapshot,
  CardId,
  DecisionId,
  EffectDefinition,
  EffectId,
  EffectQueueEntry,
  InstanceId,
  PlayerId,
  QueueEntryId,
  SourcePresencePolicy,
  StateSeq,
  TargetRequest,
  TimingWindowId,
} from "@optcg/types";
import type {
  CardInstance,
  CardSnapshot,
  CardId,
  DecisionId,
  EffectDefinition,
  EffectId,
  EffectQueueEntry,
  InstanceId,
  PlayerId,
  QueueEntryId,
  StateSeq,
  TargetRequest,
  TimingWindowId,
} from "@optcg/types";

import { hashCanonicalStateValue } from "../canonical-state.js";
import { applyAction, getLegalActions } from "../index.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  toEngineEventId,
  reviewedOnPlayDrawDefinition,
} from "../action-test-fixtures.js";
import { processEffectRuntime } from "../effect-runtime.js";
import { filterStateForPlayer } from "../filter-state-for-player.js";

export const toCardId = (value: string): CardId => value as CardId;
export const toDecisionId = (value: string): DecisionId => value as DecisionId;
export const toEffectId = (value: string): EffectId => value as EffectId;
export const toInstanceId = (value: string): InstanceId => value as InstanceId;
export const toQueueEntryId = (value: string): QueueEntryId =>
  value as QueueEntryId;
export const toStateSeq = (value: number): StateSeq => value as StateSeq;
export const toTimingWindowId = (value: string): TimingWindowId =>
  value as TimingWindowId;
export const queuedEffect = (
  cardId: CardId = toCardId("hidden-life-card"),
): EffectQueueEntry => ({
  id: toQueueEntryId("queue-entry-1"),
  state: "pending",
  timingWindowId: toTimingWindowId("timing-window-1"),
  generation: 1,
  controllerId: p1,
  source: {
    instanceId: toInstanceId("hidden-instance-1"),
    cardId,
    playerId: p1,
    zone: { zone: "life", playerId: p1, slot: "life", index: 0 },
  },
  sourceSnapshot: {
    instanceId: toInstanceId("hidden-instance-1"),
    cardId,
    ownerId: p1,
    controllerId: p1,
    zone: { zone: "life", playerId: p1, slot: "life", index: 0 },
    category: "event",
    colors: ["red"],
    cost: 1,
    keywords: [],
  },
  effectBlockId: toEffectId("hidden-effect-block"),
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 4,
  queuedAtStateSeq: toStateSeq(7),
  sourcePresencePolicy: "resolveFromLastKnownInformation",
  causedBy: { type: "ruleProcess", name: "hidden-trigger" },
});

export const publicCharacterTargetRequest = (
  overrides: Partial<TargetRequest> = {},
): TargetRequest => ({
  timing: "onResolution",
  chooser: "self",
  player: "opponent",
  zone: "characterArea",
  min: 1,
  max: 1,
  allowFewerIfUnavailable: false,
  visibility: "public",
  ...overrides,
});

export const queueDrawForP1 = (): EffectQueueEntry => ({
  ...queuedEffect(toCardId("OP01-015")),
  source: {
    instanceId: toInstanceId("source-instance"),
    cardId: toCardId("OP01-015"),
    playerId: p1,
    zone: { zone: "leaderArea", playerId: p1, slot: "leader", index: 0 },
  },
  sourceSnapshot: {
    instanceId: toInstanceId("source-instance"),
    cardId: toCardId("OP01-015"),
    ownerId: p1,
    controllerId: p1,
    zone: { zone: "leaderArea", playerId: p1, slot: "leader", index: 0 },
    category: "leader",
    colors: ["red"],
    cost: 1,
    keywords: [],
  },
  controllerId: p1,
  effectBlockId: toEffectId("OP01-015:auto-on-play-1"),
});

export const withCardInZone = (params: {
  state: ReturnType<typeof createActiveState>;
  playerId: PlayerId;
  card: CardInstance;
  zone: "characterArea" | "stageArea";
  index?: number;
}): CardInstance => {
  const { state, playerId, card, zone } = params;
  const index = params.index ?? 0;
  const placed: CardInstance =
    zone === "characterArea"
      ? {
          ...card,
          zone: { zone, playerId, slot: "character", index },
          attachedDon: [],
          state: "active",
          turnPlayed: state.turn.globalTurn,
        }
      : {
          ...card,
          zone: { zone, playerId, slot: "stage", index: 0 },
          attachedDon: [],
          state: "active",
        };
  const player = must(state.players[playerId], "player");
  if (zone === "characterArea") {
    player.characters = [...player.characters, placed];
  } else {
    player.stage = placed;
  }
  return placed;
};

export const toSourceSnapshot = (
  card: CardInstance,
  ownerId: PlayerId,
  controllerId: PlayerId,
): CardSnapshot => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  ownerId,
  controllerId,
  zone: card.zone,
  category: card.zone.zone === "stageArea" ? "stage" : "character",
  colors: ["red"],
  keywords: [],
});

export const appendCardPlayedEvent = (
  state: ReturnType<typeof createActiveState>,
  card: CardInstance,
  category: "character" | "stage",
) => {
  const event = {
    id: toEngineEventId(`event:${String(state.seq)}:1:cardPlayed`),
    seq: state.eventJournal.length + 1,
    type: "cardPlayed" as const,
    payload: {
      playerId: card.zone.playerId,
      instanceId: card.instanceId,
      cardId: card.cardId,
      category,
    },
    visibility: { type: "public" as const },
    causedBy: { type: "ruleProcess" as const, name: "turnFlow" },
    createdAtStateSeq: state.seq,
  };
  state.eventJournal.push(event);
};

export const setupOnPlayDefinition = (
  state: ReturnType<typeof createActiveState>,
  played: CardInstance,
  definition: EffectDefinition,
  effectDefinitionId = "def-on-play",
): void => {
  state.cardManifest.effectDefinitionsVersion = "0.1.0";
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[played.cardId] = resolvedCard({
    cardId: played.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: definition.metadata.rulesVersion,
      sourceTextHash: definition.metadata.sourceTextHash,
    },
  });
};

export const setupOnKODefinition = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
  effectDefinitionId = "def-on-ko",
): EffectDefinition => {
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 3000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "on-ko-rules",
      sourceTextHash: "on-ko-source",
    },
  });
  const onPlay = reviewedOnPlayDrawDefinition(
    source.cardId,
    supportCard.support,
  );
  const definition: EffectDefinition = {
    ...onPlay,
    effects: [
      {
        ...must(onPlay.effects[0], "draw effect"),
        trigger: { type: "onKO" },
        sourcePresencePolicy: "resolveFromDestinationZone",
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

export const setupCustomEffectResolvedDefinition = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
  eventName: string,
  effectDefinitionId = "def-effect-resolved",
): EffectDefinition => {
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "effect-resolved-rules",
      sourceTextHash: "effect-resolved-source",
    },
  });
  const onPlay = reviewedOnPlayDrawDefinition(
    source.cardId,
    supportCard.support,
  );
  const definition: EffectDefinition = {
    ...onPlay,
    effects: [
      {
        ...must(onPlay.effects[0], "draw effect"),
        trigger: { type: "custom", event: eventName },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

export const queueingState = (): {
  state: ReturnType<typeof createActiveState>;
  played: CardInstance;
} => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.hand[0], "hand source");
  const played = withCardInZone({
    state,
    playerId: p1,
    card: source,
    zone: "characterArea",
  });
  appendCardPlayedEvent(state, played, "character");
  return { state, played };
};

export const targetSelectionQueueState = (
  request: TargetRequest = publicCharacterTargetRequest(),
): {
  state: ReturnType<typeof createActiveState>;
  entry: EffectQueueEntry;
  request: TargetRequest;
  targets: readonly CardInstance[];
} => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  const firstTarget = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "first target"),
    zone: "characterArea",
    index: 0,
  });
  const secondTarget = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[1], "second target"),
    zone: "characterArea",
    index: 1,
  });
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-target-selection",
      rulesVersion: "target-selection-rules",
      sourceTextHash: "target-selection-source",
    },
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    source.cardId,
    supportCard.support,
  );
  const effectBlockId = toEffectId("target-selection-effect");
  const definition: EffectDefinition = {
    ...baseDefinition,
    effects: [
      {
        ...must(baseDefinition.effects[0], "base effect"),
        id: effectBlockId,
        effect: { type: "ko", target: { type: "choose", request } },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-target-selection": definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  state.cardManifest.cards[firstTarget.cardId] = resolvedCard({
    cardId: firstTarget.cardId,
    category: "character",
    cost: 2,
    power: 3000,
  });
  state.cardManifest.cards[secondTarget.cardId] = resolvedCard({
    cardId: secondTarget.cardId,
    category: "character",
    cost: 4,
    power: 5000,
  });

  const entry: EffectQueueEntry = {
    id: toQueueEntryId("queue-entry-target-selection"),
    state: "pending",
    timingWindowId: toTimingWindowId("window-target-selection"),
    generation: 0,
    controllerId: p1,
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    sourceSnapshot: toSourceSnapshot(source, p1, p1),
    effectBlockId,
    orderingGroup: "turnPlayer",
    createdAtEventSeq: 1,
    queuedAtStateSeq: toStateSeq(state.seq),
    sourcePresencePolicy: "mustRemainInSameZone",
    causedBy: { type: "ruleProcess", name: "target-selection-test" },
  };
  state.effectQueue = [entry];

  return { state, entry, request, targets: [firstTarget, secondTarget] };
};

export const mixedOrderedDrawThenTargetState = (
  request: TargetRequest = publicCharacterTargetRequest(),
): {
  state: ReturnType<typeof createActiveState>;
  drawEntry: EffectQueueEntry;
  targetEntry: EffectQueueEntry;
} => {
  const { state, entry: targetEntry } = targetSelectionQueueState(request);
  const p1State = must(state.players[p1], "p1");
  const drawSource = withCardInZone({
    state,
    playerId: p1,
    card: {
      ...must(p1State.hand[2], "draw source"),
      cardId: toCardId("mixed-draw-source-card"),
    },
    zone: "characterArea",
    index: 1,
  });
  p1State.deck = [
    {
      ...must(p1State.hand[3], "mixed draw deck refill"),
      cardId: toCardId("mixed-draw-deck-card"),
      zone: { zone: "deck", playerId: p1, slot: "deck", index: 0 },
    },
    {
      ...must(p1State.hand[4], "mixed draw deck buffer"),
      cardId: toCardId("mixed-draw-deck-buffer"),
      zone: { zone: "deck", playerId: p1, slot: "deck", index: 1 },
    },
  ];
  const drawSupport = resolvedCard({
    cardId: drawSource.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-mixed-draw",
      rulesVersion: "mixed-draw-rules",
      sourceTextHash: "mixed-draw-source",
    },
  });
  const drawDefinition = reviewedOnPlayDrawDefinition(
    drawSource.cardId,
    drawSupport.support,
  );
  const drawEntry: EffectQueueEntry = {
    ...queueDrawForP1(),
    id: toQueueEntryId("queue-entry-mixed-draw"),
    timingWindowId: targetEntry.timingWindowId,
    generation: targetEntry.generation,
    controllerId: p1,
    source: {
      instanceId: drawSource.instanceId,
      cardId: drawSource.cardId,
      playerId: p1,
      zone: drawSource.zone,
    },
    sourceSnapshot: toSourceSnapshot(drawSource, p1, p1),
    effectBlockId: must(drawDefinition.effects[0], "draw effect").id,
    orderingGroup: "turnPlayer",
    createdAtEventSeq: 1,
    queuedAtStateSeq: toStateSeq(state.seq),
    sourcePresencePolicy: "mustRemainInSameZone",
    causedBy: { type: "ruleProcess", name: "mixed-draw-target-test" },
  };
  const normalizedTargetEntry: EffectQueueEntry = {
    ...targetEntry,
    id: toQueueEntryId("queue-entry-mixed-target"),
    createdAtEventSeq: 2,
    causedBy: { type: "ruleProcess", name: "mixed-draw-target-test" },
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-mixed-draw": drawDefinition,
  };
  state.cardManifest.cards[drawSource.cardId] = drawSupport;
  state.effectQueue = [drawEntry, normalizedTargetEntry];
  return { state, drawEntry, targetEntry: normalizedTargetEntry };
};

export {
  applyAction,
  createActiveState,
  filterStateForPlayer,
  getLegalActions,
  hashCanonicalStateValue,
  must,
  p1,
  p2,
  processEffectRuntime,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEngineEventId,
};
