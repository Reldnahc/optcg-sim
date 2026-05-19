import { expect, test } from "vitest";

import type * as Types from "./index.js";
import type {
  AuditEntry,
  CardId,
  CardInstance,
  CardRef,
  CardSnapshot,
  CausalityRef,
  ComputedCardView,
  ComputedGameView,
  ContinuousEffect,
  ContinuousEffectRecord,
  DeferredTriggerBucket,
  EffectContext,
  EffectExecutionContext,
  EffectId,
  EffectQueueEntry,
  EngineEvent,
  EngineEventId,
  ExactCardTargetSpec,
  InstanceId,
  LifeCard,
  LoopSignature,
  MatchStatus,
  Modifier,
  ModifierLayer,
  ModifierOperation,
  OncePerTurnRecord,
  ProtectionExclusionPolicy,
  ProtectionFieldRemovalClassification,
  ProtectionFieldRemovalProcessFamily,
  ProtectionFieldRemovalSourceControllerRelation,
  ProtectionFieldRemovalSourceKind,
  ProtectionFieldRemovalTargetScope,
  PlayerGameTimer,
  PlayerId,
  PlayerState,
  Protection,
  PublicTimerState,
  QueueEntryId,
  ReplaceableProcessType,
  ReplacementProcess,
  ReplacementProcessState,
  RestrictionIndex,
  RevealRecord,
  RngDrawResult,
  RngState,
  SelectionId,
  SelectionSetId,
  SequenceSavedResultReferenceMap,
  SequenceSegmentResult,
  SequenceSegmentResultMap,
  StateSeq,
  TargetSpec,
  TimerState,
  TimingWindowId,
  TransientCardSet,
  TriggerCandidate,
  TurnState,
  Winner,
  ZoneRef,
} from "./index.js";

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
  const battle = {
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
    step: "damage" as const,
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
  expect(battle.damageCount).toBe(1);
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
  const exactCardTarget: ExactCardTargetSpec = {
    type: "exactCard",
    card: source,
    binding: {
      family: "selectedTargets",
      saveResultAs: "chosenCharacter",
      objectIndex: 0,
      sourceSegmentId: "choose-character",
    },
    createdAtStateSeq: 1 as StateSeq,
  };
  const layer: ModifierLayer = "powerAdd";
  const operation: ModifierOperation = { type: "addPower", value: 1000 };
  const modifier: Modifier = { layer, target: targetSpec, operation };
  const exactCardModifier: Modifier = {
    layer: "restriction",
    target: exactCardTarget,
    operation: { type: "restriction", restriction: "cannotAttack" },
  };
  const attackRestrictionModifier: Modifier = {
    layer: "restriction",
    target: { type: "selection", selection: "sel-1" as SelectionId },
    operation: { type: "restriction", restriction: "cannotAttack" },
  };
  const blockRestrictionModifier: Modifier = {
    layer: "restriction",
    target: { type: "selection", selection: "sel-1" as SelectionId },
    operation: { type: "restriction", restriction: "cannotBlock" },
  };
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
  expect(exactCardModifier.target.type).toBe("exactCard");
  expect(attackRestrictionModifier.operation.type).toBe("restriction");
  if (attackRestrictionModifier.operation.type !== "restriction") {
    throw new Error("Expected attack restriction modifier operation.");
  }
  if (blockRestrictionModifier.operation.type !== "restriction") {
    throw new Error("Expected block restriction modifier operation.");
  }
  expect(attackRestrictionModifier.operation.restriction).toBe("cannotAttack");
  expect(blockRestrictionModifier.operation.restriction).toBe("cannotBlock");
  expect(audit.type).toBe("test");
  expect(loop.recentStateHashes).toHaveLength(1);
  expect(reveal.cards).toHaveLength(1);
});

test("TYP-009B exact-card continuous target binding rejects ambiguous saved-reference carriers", () => {
  const player = "player-1" as PlayerId;
  const source: CardRef = {
    instanceId: "i1" as CardRef["instanceId"],
    cardId: "OP01-002" as CardId,
    playerId: player,
  };
  // @ts-expect-error exact-card continuous targets must retain saved field-object binding provenance.
  const missingBinding: ExactCardTargetSpec = {
    type: "exactCard",
    card: source,
    createdAtStateSeq: 1 as StateSeq,
  };
  const unsupportedFamily: ExactCardTargetSpec = {
    type: "exactCard",
    card: source,
    binding: {
      // @ts-expect-error exact-card targets bind only saved field-object families.
      family: "selectedCards",
      saveResultAs: "handCard",
    },
    createdAtStateSeq: 1 as StateSeq,
  };
  const staleSelectionCarrier: TargetSpec = {
    type: "selection",
    selection: "handSelection:thatCharacter" as SelectionId,
  };

  void missingBinding;
  void unsupportedFamily;
  void staleSelectionCarrier;
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
    // @ts-expect-error TYP-001F must not export PublicActionWindow.
    Types.PublicActionWindow,
  ];
  const outOfScopeExportWitness: OutOfScopeExportWitness | null = null;

  expect(outOfScopeExportWitness).toBeNull();
});

test("runtime contracts compile with sequence segment result and saved-reference ledgers", () => {
  const resultLedger: SequenceSegmentResultMap = {
    opening: {
      attempted: true,
      succeeded: true,
      changedState: false,
      selectedCards: [],
      selectedTargets: [],
      paidCost: false,
      playerDeclined: false,
    },
  };

  const savedReferences: SequenceSavedResultReferenceMap = {
    openingSelection: {
      kind: "selectedCards",
      cards: [],
    },
  };

  const firstResult: SequenceSegmentResult | undefined =
    resultLedger["opening"];
  const openingSelection = savedReferences["openingSelection"];
  expect(openingSelection).toBeDefined();
  if (!openingSelection) {
    throw new Error("expected opening selection reference");
  }

  expect(firstResult?.attempted).toBe(true);
  expect(openingSelection.kind).toBe("selectedCards");
});

test("TYP-012A protection contract supports structured field-removal metadata", () => {
  const sourceKind: ProtectionFieldRemovalSourceKind = "cardEffect";
  const sourceControllerRelation: ProtectionFieldRemovalSourceControllerRelation =
    "opponentControlled";
  const processFamily: ProtectionFieldRemovalProcessFamily = "fieldRemoval";
  const classification: ProtectionFieldRemovalClassification =
    "moveFromFieldToTrash";
  const targetScope: ProtectionFieldRemovalTargetScope = "thisCard";
  const exclusionPolicy: ProtectionExclusionPolicy = "failClosed";
  const protection: Protection = {
    process: "fieldRemoval",
    fieldRemoval: {
      processFamily,
      classification,
      sourceKind,
      sourceControllerRelation,
      targetScope,
      exclusions: {
        battleKO: exclusionPolicy,
        ruleProcessTrash: exclusionPolicy,
        controllerCost: exclusionPolicy,
        controllerOwnedEffect: exclusionPolicy,
        ambiguousCustomRemoval: exclusionPolicy,
      },
    },
  };

  expect(protection.fieldRemoval.sourceKind).toBe("cardEffect");
  expect(protection.fieldRemoval.sourceControllerRelation).toBe(
    "opponentControlled",
  );
  expect(protection.fieldRemoval.targetScope).toBe("thisCard");
});

test("TYP-012A rejects malformed field-removal protection shapes", () => {
  // @ts-expect-error fieldRemoval process requires structured metadata axes.
  const missingFieldRemovalMetadata: Protection = {
    process: "fieldRemoval",
  };
  const malformedSimpleProtection = {
    process: "ko" as const,
    fieldRemoval: {
      processFamily: "fieldRemoval" as const,
      classification: "moveFromFieldToTrash" as const,
      sourceKind: "cardEffect" as const,
      sourceControllerRelation: "opponentControlled" as const,
      targetScope: "thisCard" as const,
      exclusions: {
        battleKO: "failClosed" as const,
        ruleProcessTrash: "failClosed" as const,
        controllerCost: "failClosed" as const,
        controllerOwnedEffect: "failClosed" as const,
        ambiguousCustomRemoval: "failClosed" as const,
      },
    },
  };
  // @ts-expect-error simple process protections must not carry fieldRemoval metadata.
  const simpleProcessWithFieldRemovalMetadata: Protection =
    malformedSimpleProtection;

  void missingFieldRemovalMetadata;
  void simpleProcessWithFieldRemovalMetadata;
});
