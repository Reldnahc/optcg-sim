import type {
  Action,
  CardInstance,
  CardRef,
  EngineError,
  EngineEvent,
  EngineEventId,
  EngineResult,
  GameState,
  LegalAction,
  PlayerId,
  StateSeq,
} from "@optcg/types";

import { hashCanonicalStateValue } from "./canonical-state.js";
import { computeView } from "./compute-view.js";
import { assertGameStateInvariants } from "./invariants.js";
import { advanceEndPhase } from "./phases.js";

const toStateSeq = (value: number): StateSeq => value as StateSeq;
const toEngineEventId = (value: string): EngineEventId =>
  value as EngineEventId;

const toEngineResult = (
  state: GameState,
  events: EngineEvent[],
  errors?: readonly [EngineError, ...EngineError[]],
): EngineResult => {
  const result: EngineResult = {
    state,
    events,
    stateHash: hashCanonicalStateValue(state),
  };
  if (state.pendingDecision !== undefined) {
    result.decisions = [state.pendingDecision];
  }
  if (errors !== undefined) {
    result.errors = [...errors];
  }
  return result;
};

const illegalAction = (state: GameState, reason: string): EngineResult =>
  toEngineResult(state, [], [{ type: "illegalAction", reason }]);

const createEvent = (
  state: GameState,
  seqOffset: number,
  type: EngineEvent["type"],
  payload: unknown,
  visibility: EngineEvent["visibility"] = { type: "public" },
): EngineEvent => ({
  id: toEngineEventId(
    `event:${String(state.seq)}:${String(seqOffset)}:${type}`,
  ),
  seq: state.eventJournal.length + seqOffset,
  type,
  payload,
  visibility,
  causedBy: { type: "ruleProcess", name: "turnFlow" },
  createdAtStateSeq: toStateSeq(state.seq + 1),
});

const appendRuleProcessingChecked = (
  state: GameState,
  events: EngineEvent[],
  phase: GameState["turn"]["phase"],
): void => {
  events.push(
    createEvent(
      state,
      events.length + 1,
      "ruleProcessingChecked",
      { phase, result: "ok" },
      { type: "replayOnly" },
    ),
  );
};

const appendEvent = (
  state: GameState,
  events: EngineEvent[],
  type: EngineEvent["type"],
  payload: unknown,
  visibility: EngineEvent["visibility"] = { type: "public" },
): void => {
  events.push(createEvent(state, events.length + 1, type, payload, visibility));
};

const rebaseEvents = (
  state: GameState,
  events: EngineEvent[],
  seqOffset: number,
): EngineEvent[] =>
  events.map((event, index) => ({
    ...event,
    id: toEngineEventId(
      `event:${String(state.seq)}:${String(seqOffset + index)}:${event.type}`,
    ),
    seq: state.eventJournal.length + seqOffset + index,
    createdAtStateSeq: toStateSeq(state.seq + 1),
  }));

const getOpponentId = (
  state: GameState,
  playerId: PlayerId,
): PlayerId | null => {
  const playerIds = Object.keys(state.players) as PlayerId[];
  return playerIds.find((candidate) => candidate !== playerId) ?? null;
};

const toCardRef = (card: CardInstance, playerId: PlayerId): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

const getAttachTargets = (state: GameState, playerId: PlayerId): CardRef[] => {
  const player = state.players[playerId];
  if (player === undefined) {
    return [];
  }
  return [
    toCardRef(player.leader, playerId),
    ...player.characters.map((card) => toCardRef(card, playerId)),
  ];
};

const isMatchActive = (state: GameState): boolean =>
  state.status.type === "active";

const canConcede = (state: GameState): boolean =>
  state.status.type !== "completed" && state.status.type !== "gameOver";

const zonesEqual = (
  left: NonNullable<CardRef["zone"]>,
  right: CardRef["zone"],
): boolean =>
  right !== undefined &&
  left.zone === right.zone &&
  left.playerId === right.playerId &&
  left.index === right.index &&
  left.slot === right.slot;

const targetMatchesCard = (target: CardRef, card: CardInstance): boolean =>
  target.cardId === card.cardId &&
  (target.zone === undefined || zonesEqual(target.zone, card.zone));

const getCombatCardByInstanceId = (
  state: GameState,
  instanceId: CardInstance["instanceId"],
): { card: CardInstance; playerId: PlayerId; isLeader: boolean } | null => {
  for (const [playerId, player] of Object.entries(state.players) as [
    PlayerId,
    GameState["players"][PlayerId],
  ][]) {
    if (player.leader.instanceId === instanceId) {
      return { card: player.leader, playerId, isLeader: true };
    }
    const character = player.characters.find(
      (candidate) => candidate.instanceId === instanceId,
    );
    if (character !== undefined) {
      return { card: character, playerId, isLeader: false };
    }
  }
  return null;
};

const reifyCardRef = (
  state: GameState,
  ref: CardRef,
): { card: CardInstance; playerId: PlayerId; isLeader: boolean } | null => {
  const located = getCombatCardByInstanceId(state, ref.instanceId);
  if (located === null) {
    return null;
  }
  if (
    ref.playerId !== located.playerId ||
    !targetMatchesCard(ref, located.card)
  ) {
    return null;
  }
  return located;
};

export const getLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  if (!isMatchActive(state) || state.players[playerId] === undefined) {
    return [];
  }

  const actions: LegalAction[] = [{ type: "concede", playerId }];
  if (state.pendingDecision !== undefined) {
    return actions;
  }
  if (state.turn.phase !== "main" || state.turn.turnPlayerId !== playerId) {
    return actions;
  }
  if (state.battle !== undefined) {
    return actions;
  }

  actions.push({ type: "endMainPhase" });
  const player = state.players[playerId];
  const activeDon = player.costArea.filter((card) => card.state === "active");
  const targets = getAttachTargets(state, playerId);
  for (const don of activeDon) {
    for (const target of targets) {
      actions.push({
        type: "attachDon",
        donInstanceId: don.instanceId,
        target,
      });
    }
  }

  try {
    const view = computeView(state);
    for (const [attackerId, targetIds] of Object.entries(
      view.legalAttackTargets,
    )) {
      const attacker = getCombatCardByInstanceId(
        state,
        attackerId as CardInstance["instanceId"],
      );
      if (attacker === null || attacker.playerId !== playerId) {
        continue;
      }
      for (const targetId of targetIds) {
        const target = getCombatCardByInstanceId(state, targetId);
        if (target === null) {
          continue;
        }
        actions.push({
          type: "declareAttack",
          attacker: toCardRef(attacker.card, attacker.playerId),
          target: toCardRef(target.card, target.playerId),
        });
      }
    }
  } catch {
    // Fail closed when computed combat metadata is unsupported or invalid.
  }
  return actions;
};

const applyConcede = (
  state: GameState,
  action: Extract<Action, { type: "concede" }>,
): EngineResult => {
  if (!canConcede(state)) {
    return illegalAction(
      state,
      "Concede is only legal before match completion.",
    );
  }
  if (state.players[action.playerId] === undefined) {
    return illegalAction(state, "Conceding player does not exist.");
  }
  const opponentId = getOpponentId(state, action.playerId);
  if (opponentId === null) {
    return illegalAction(state, "Concede requires exactly two players.");
  }

  const events: EngineEvent[] = [
    createEvent(
      state,
      1,
      "gameEnded",
      { winner: opponentId, loser: action.playerId, reason: "concede" },
      { type: "public" },
    ),
  ];
  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    status: { type: "completed", winner: opponentId },
    eventJournal: [...state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;
  assertGameStateInvariants(nextState);
  return toEngineResult(nextState, events);
};

const applyEndMainPhase = (state: GameState): EngineResult => {
  if (!isMatchActive(state)) {
    return illegalAction(
      state,
      "endMainPhase is only legal while match is active.",
    );
  }
  if (state.turn.phase !== "main") {
    return illegalAction(state, "endMainPhase requires main phase.");
  }

  const transitionEvents: EngineEvent[] = [
    createEvent(state, 1, "phaseEnded", {
      phase: "main",
      playerId: state.turn.turnPlayerId,
    }),
    createEvent(state, 2, "phaseStarted", {
      phase: "end",
      playerId: state.turn.turnPlayerId,
    }),
  ];
  appendRuleProcessingChecked(state, transitionEvents, "end");

  const preEndState: GameState = {
    ...state,
    actionSeq: state.actionSeq + 1,
    turn: { ...state.turn, phase: "end" },
  };
  assertGameStateInvariants(preEndState);

  const endResult = advanceEndPhase(preEndState);
  if (endResult.errors !== undefined) {
    return endResult;
  }
  const events = [
    ...transitionEvents,
    ...rebaseEvents(state, endResult.events, transitionEvents.length + 1),
  ];
  const nextState: GameState = {
    ...endResult.state,
    eventJournal: [...state.eventJournal, ...events],
  };
  assertGameStateInvariants(nextState);
  return toEngineResult(nextState, events);
};

const applyAttachDon = (
  state: GameState,
  action: Extract<Action, { type: "attachDon" }>,
): EngineResult => {
  if (!isMatchActive(state)) {
    return illegalAction(
      state,
      "attachDon is only legal while match is active.",
    );
  }
  if (state.turn.phase !== "main") {
    return illegalAction(state, "attachDon requires main phase.");
  }
  const turnPlayerId = state.turn.turnPlayerId;
  if (action.target.playerId !== turnPlayerId) {
    return illegalAction(state, "attachDon target must belong to turn player.");
  }
  const player = state.players[turnPlayerId];
  if (player === undefined) {
    return illegalAction(state, "Turn player does not exist.");
  }

  const donIndex = player.costArea.findIndex(
    (card) =>
      card.instanceId === action.donInstanceId &&
      card.state === "active" &&
      card.owner === turnPlayerId &&
      card.controller === turnPlayerId,
  );
  if (donIndex < 0) {
    return illegalAction(
      state,
      "attachDon requires an active DON!! in turn player's cost area.",
    );
  }
  const donor = player.costArea[donIndex];
  if (donor === undefined) {
    return illegalAction(state, "attachDon donor not found.");
  }

  const isLeaderTarget =
    player.leader.instanceId === action.target.instanceId &&
    targetMatchesCard(action.target, player.leader);
  const targetCharacterIndex = player.characters.findIndex(
    (character) =>
      character.instanceId === action.target.instanceId &&
      targetMatchesCard(action.target, character),
  );
  if (!isLeaderTarget && targetCharacterIndex < 0) {
    return illegalAction(
      state,
      "attachDon target must be turn player's leader or character.",
    );
  }
  const nextLeader = isLeaderTarget
    ? {
        ...player.leader,
        attachedDon: [...player.leader.attachedDon, donor.instanceId],
      }
    : player.leader;
  const nextCharacters = player.characters.map((character, index) =>
    index === targetCharacterIndex
      ? {
          ...character,
          attachedDon: [...character.attachedDon, donor.instanceId],
        }
      : character,
  );

  const updatedDon: CardInstance = { ...donor };
  delete updatedDon.state;
  const nextCostArea = player.costArea.map((card, index) =>
    index === donIndex ? updatedDon : card,
  );

  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    players: {
      ...state.players,
      [turnPlayerId]: {
        ...player,
        leader: nextLeader,
        characters: nextCharacters,
        costArea: nextCostArea,
      },
    },
  };
  const events: EngineEvent[] = [
    createEvent(
      state,
      1,
      "donAttached",
      {
        playerId: turnPlayerId,
        donInstanceId: donor.instanceId,
        targetInstanceId: action.target.instanceId,
      },
      { type: "replayOnly" },
    ),
  ];
  appendRuleProcessingChecked(state, events, "main");
  nextState.eventJournal = [...state.eventJournal, ...events];
  assertGameStateInvariants(nextState);
  return toEngineResult(nextState, events);
};

const applyDeclareAttack = (
  state: GameState,
  action: Extract<Action, { type: "declareAttack" }>,
): EngineResult => {
  if (!isMatchActive(state)) {
    return illegalAction(
      state,
      "declareAttack is only legal while match is active.",
    );
  }
  if (state.turn.phase !== "main") {
    return illegalAction(state, "declareAttack requires main phase.");
  }
  if (state.battle !== undefined) {
    return illegalAction(
      state,
      "declareAttack is illegal during an active battle.",
    );
  }

  const attacker = reifyCardRef(state, action.attacker);
  if (attacker === null) {
    return illegalAction(
      state,
      "declareAttack attacker reference is stale or invalid.",
    );
  }
  if (attacker.playerId !== state.turn.turnPlayerId) {
    return illegalAction(
      state,
      "declareAttack attacker must be controlled by turn player.",
    );
  }
  if (attacker.card.state !== "active") {
    return illegalAction(state, "declareAttack attacker must be active.");
  }

  const target = reifyCardRef(state, action.target);
  if (target === null) {
    return illegalAction(
      state,
      "declareAttack target reference is stale or invalid.",
    );
  }

  let legalTargets: readonly CardInstance["instanceId"][];
  try {
    const computed = computeView(state);
    legalTargets = computed.legalAttackTargets[attacker.card.instanceId] ?? [];
  } catch {
    return illegalAction(
      state,
      "declareAttack is unsupported for current combat metadata.",
    );
  }
  if (!legalTargets.includes(target.card.instanceId)) {
    return illegalAction(
      state,
      "declareAttack target is not legal for attacker.",
    );
  }

  const nextPlayer = state.players[attacker.playerId];
  if (nextPlayer === undefined) {
    return illegalAction(
      state,
      "declareAttack attacker player does not exist.",
    );
  }
  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    players: {
      ...state.players,
      [attacker.playerId]: {
        ...nextPlayer,
        leader: attacker.isLeader
          ? { ...nextPlayer.leader, state: "rested" }
          : nextPlayer.leader,
        characters: nextPlayer.characters.map((character) =>
          !attacker.isLeader &&
          character.instanceId === attacker.card.instanceId
            ? { ...character, state: "rested" }
            : character,
        ),
      },
    },
    battle: {
      attacker: toCardRef(attacker.card, attacker.playerId),
      originalTarget: toCardRef(target.card, target.playerId),
      currentTarget: toCardRef(target.card, target.playerId),
      step: "attack",
      damageCount: 1,
    },
  };

  const events: EngineEvent[] = [
    createEvent(
      state,
      1,
      "attackDeclared",
      {
        attacker: toCardRef(attacker.card, attacker.playerId),
        target: toCardRef(target.card, target.playerId),
      },
      { type: "public" },
    ),
  ];
  appendRuleProcessingChecked(state, events, "main");
  nextState.eventJournal = [...state.eventJournal, ...events];
  assertGameStateInvariants(nextState);
  const declaredResult = toEngineResult(nextState, events);
  if (declaredResult.errors !== undefined) {
    return declaredResult;
  }
  const resolved = resolveSupportedVanillaBattle(declaredResult.state);
  if (resolved.errors !== undefined) {
    const firstError = resolved.errors[0];
    return firstError === undefined
      ? illegalAction(state, "Battle resolution failed.")
      : toEngineResult(state, [], [firstError]);
  }
  const resolutionEvents = rebaseEvents(
    state,
    resolved.events,
    events.length + 1,
  );
  const finalState: GameState = {
    ...resolved.state,
    seq: nextState.seq,
    actionSeq: nextState.actionSeq,
    eventJournal: [...state.eventJournal, ...events, ...resolutionEvents],
  };
  return toEngineResult(finalState, [...events, ...resolutionEvents]);
};

const unsupportedBattleResolution = (
  state: GameState,
  reason: string,
): EngineResult => illegalAction(state, reason);

const reindexZoneCards = (
  cards: CardInstance[],
  zone: CardInstance["zone"]["zone"],
  playerId: PlayerId,
  slot: NonNullable<CardInstance["zone"]["slot"]>,
): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone, playerId, slot, index },
  }));

const hasUnsupportedCounterWindow = (
  state: GameState,
  defenderId: PlayerId,
): boolean => {
  const defender = state.players[defenderId];
  if (defender === undefined) {
    return true;
  }
  return defender.hand.some((card) => {
    const metadata = state.cardManifest.cards[card.cardId];
    return (
      metadata === undefined ||
      (metadata.counter !== undefined && metadata.counter > 0)
    );
  });
};

export const resolveSupportedVanillaBattle = (
  state: GameState,
): EngineResult => {
  if (state.battle === undefined) {
    return illegalAction(state, "No active battle to resolve.");
  }
  if (
    state.battle.blocker !== undefined ||
    state.battle.damageCount !== 1 ||
    state.battle.step !== "attack"
  ) {
    return unsupportedBattleResolution(
      state,
      "Battle requires unsupported blocker, step, or multi-damage behavior.",
    );
  }
  if (
    state.effectQueue.length > 0 ||
    state.deferredTriggers.length > 0 ||
    state.replacementState.length > 0
  ) {
    return unsupportedBattleResolution(
      state,
      "Battle requires unsupported trigger or replacement processing.",
    );
  }

  const attacker = reifyCardRef(state, state.battle.attacker);
  const target = reifyCardRef(state, state.battle.currentTarget);
  if (attacker === null || target === null) {
    return illegalAction(state, "Battle participants are stale or invalid.");
  }
  if (hasUnsupportedCounterWindow(state, target.playerId)) {
    return unsupportedBattleResolution(
      state,
      "Battle requires unsupported counter window handling.",
    );
  }

  let view: ReturnType<typeof computeView>;
  try {
    view = computeView(state);
  } catch {
    return unsupportedBattleResolution(
      state,
      "Battle requires unsupported combat metadata.",
    );
  }
  if (Object.keys(view.restrictions).length > 0) {
    return unsupportedBattleResolution(
      state,
      "Battle requires unsupported restriction handling.",
    );
  }

  const attackerView = view.cards[attacker.card.instanceId];
  const targetView = view.cards[target.card.instanceId];
  if (
    attackerView?.currentPower === undefined ||
    targetView?.currentPower === undefined
  ) {
    return unsupportedBattleResolution(
      state,
      "Battle requires unsupported derived power metadata.",
    );
  }
  if (
    attackerView.keywords.includes("banish") ||
    attackerView.keywords.includes("doubleAttack") ||
    targetView.protectedFrom.length > 0
  ) {
    return unsupportedBattleResolution(
      state,
      "Battle requires unsupported keyword or protection handling.",
    );
  }

  const events: EngineEvent[] = [];
  let nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
  };
  delete nextState.battle;

  if (attackerView.currentPower >= targetView.currentPower) {
    if (target.isLeader) {
      const damaged = nextState.players[target.playerId];
      const topLife = damaged?.life[0];
      if (damaged === undefined || topLife === undefined) {
        return illegalAction(
          state,
          "Leader damage at 0 life is unsupported before terminal defeat handling.",
        );
      }
      const lifeMeta = nextState.cardManifest.cards[topLife.card.cardId];
      if (
        lifeMeta?.triggerText !== undefined &&
        lifeMeta.triggerText.length > 0
      ) {
        return unsupportedBattleResolution(
          state,
          "Life trigger reveal decisions are unsupported in this battle path.",
        );
      }
      const movedLifeCard: CardInstance = {
        ...topLife.card,
        zone: {
          zone: "hand",
          playerId: target.playerId,
          slot: "hand",
          index: 0,
        },
      };
      const nextHand = reindexZoneCards(
        [movedLifeCard, ...damaged.hand],
        "hand",
        target.playerId,
        "hand",
      );
      const nextLife = damaged.life.slice(1).map((lifeCard, index) => ({
        ...lifeCard,
        card: {
          ...lifeCard.card,
          zone: {
            zone: "life",
            playerId: target.playerId,
            slot: "life",
            index,
          },
        },
      }));
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [target.playerId]: { ...damaged, hand: nextHand, life: nextLife },
        },
      };
      appendEvent(state, events, "damageDealt", {
        attacker: attacker.card.instanceId,
        target: target.card.instanceId,
        amount: 1,
      });
      appendEvent(state, events, "lifeTaken", {
        damagedPlayerId: target.playerId,
        amount: 1,
      });
      appendEvent(
        state,
        events,
        "cardMoved",
        {
          from: {
            zone: "life",
            playerId: target.playerId,
            slot: "life",
            index: 0,
          },
          to: {
            zone: "hand",
            playerId: target.playerId,
            slot: "hand",
            index: 0,
          },
          reason: "battleDamage",
        },
        { type: "public" },
      );
      appendEvent(
        state,
        events,
        "cardMoved",
        {
          instanceId: movedLifeCard.instanceId,
          cardId: movedLifeCard.cardId,
          from: {
            zone: "life",
            playerId: target.playerId,
            slot: "life",
            index: 0,
          },
          to: movedLifeCard.zone,
          reason: "battleDamage",
        },
        { type: "private", playerId: target.playerId },
      );
    } else {
      const defender = nextState.players[target.playerId];
      if (defender === undefined) {
        return illegalAction(state, "Battle target player does not exist.");
      }
      const koIndex = defender.characters.findIndex(
        (character) => character.instanceId === target.card.instanceId,
      );
      if (koIndex < 0 || target.card.state !== "rested") {
        return unsupportedBattleResolution(
          state,
          "Battle target is no longer a supported rested character target.",
        );
      }
      const koCard = defender.characters[koIndex];
      if (koCard === undefined) {
        return illegalAction(state, "K.O. target not found.");
      }
      const nextCharacters = reindexZoneCards(
        defender.characters.filter((_, index) => index !== koIndex),
        "characterArea",
        target.playerId,
        "character",
      );
      const trashedCard: CardInstance = {
        ...koCard,
        attachedDon: [],
        zone: {
          zone: "trash",
          playerId: target.playerId,
          slot: "trash",
          index: 0,
        },
      };
      const nextTrash = reindexZoneCards(
        [trashedCard, ...defender.trash],
        "trash",
        target.playerId,
        "trash",
      );
      const attachedDonIds = new Set(koCard.attachedDon);
      const nextCostArea = defender.costArea.map((card) =>
        attachedDonIds.has(card.instanceId)
          ? { ...card, state: "rested" }
          : card,
      );
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [target.playerId]: {
            ...defender,
            characters: nextCharacters,
            trash: nextTrash,
            costArea: nextCostArea,
          },
        },
      };
      appendEvent(state, events, "damageDealt", {
        attacker: attacker.card.instanceId,
        target: target.card.instanceId,
        amount: 1,
      });
      appendEvent(state, events, "cardKOd", {
        playerId: target.playerId,
        instanceId: target.card.instanceId,
      });
      appendEvent(state, events, "cardMoved", {
        from: target.card.zone,
        to: trashedCard.zone,
        reason: "ko",
      });
      for (const donId of koCard.attachedDon) {
        appendEvent(
          state,
          events,
          "donReturned",
          { playerId: target.playerId, donInstanceId: donId, state: "rested" },
          { type: "replayOnly" },
        );
      }
    }
  }

  events.push(
    createEvent(
      state,
      events.length + 1,
      "effectResolved",
      { systemStep: "endBattle", battleCleared: true },
      { type: "replayOnly" },
    ),
  );
  appendRuleProcessingChecked(state, events, "main");
  nextState.eventJournal = [...state.eventJournal, ...events];
  assertGameStateInvariants(nextState);
  return toEngineResult(nextState, events);
};

export const applyAction = (state: GameState, action: Action): EngineResult => {
  if (action.type === "concede") {
    return applyConcede(state, action);
  }
  if (state.pendingDecision !== undefined) {
    return illegalAction(
      state,
      "Phase actions are illegal while a decision is pending.",
    );
  }
  if (action.type === "endMainPhase") {
    return applyEndMainPhase(state);
  }
  if (action.type === "attachDon") {
    return applyAttachDon(state, action);
  }
  if (action.type === "declareAttack") {
    return applyDeclareAttack(state, action);
  }
  return illegalAction(state, `Unsupported action type: ${action.type}`);
};
