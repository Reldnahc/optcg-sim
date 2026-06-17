import type {
  Action,
  CardRef,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  PlayerId,
} from "@optcg/types";

import {
  assertGameStateInvariantsIfEnabled,
  createEvent,
  type EngineResultOptions,
  illegalAction,
  toEngineResult,
  toStateSeq,
} from "../action-results.js";
import { applyRuleProcessingCheckpoint } from "../rules/rule-processing.js";
import { applyDonAttachment } from "../runtime/primitives/don-attachment.js";
import { isMatchActive, targetMatchesCard, toCardRef } from "./state.js";

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

const profileAttachDonSpan = <T>(
  options: EngineResultOptions,
  name: string,
  fn: () => T,
): T => options.profileSpan?.(name, fn) ?? fn();

export const getAttachDonLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  if (
    !isMatchActive(state) ||
    state.pendingDecision !== undefined ||
    state.turn.phase !== "main" ||
    state.turn.turnPlayerId !== playerId ||
    state.battle !== undefined
  ) {
    return [];
  }
  const player = state.players[playerId];
  if (player === undefined) {
    return [];
  }
  const actions: LegalAction[] = [];
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
  return actions;
};

export const applyAttachDon = (
  state: GameState,
  action: Extract<Action, { type: "attachDon" }>,
  options: EngineResultOptions = {},
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

  const selectedDonInstanceIds =
    action.selectedDonInstanceIds ??
    (action.donInstanceId === undefined ? [] : [action.donInstanceId]);
  if (selectedDonInstanceIds.length === 0) {
    return illegalAction(
      state,
      "attachDon requires an active DON!! in turn player's cost area.",
    );
  }
  const activeDonIds = new Set(
    player.costArea
      .filter(
        (card) =>
          card.state === "active" &&
          card.owner === turnPlayerId &&
          card.controller === turnPlayerId,
      )
      .map((card) => card.instanceId),
  );
  if (selectedDonInstanceIds.some((donId) => !activeDonIds.has(donId))) {
    return illegalAction(
      state,
      "attachDon requires an active DON!! in turn player's cost area.",
    );
  }

  const isLeaderTarget =
    player.leader.instanceId === action.target.instanceId &&
    targetMatchesCard(action.target, player.leader);
  const targetCharacterIndex = player.characters.findIndex(
    (character) =>
      character.instanceId === action.target.instanceId &&
      targetMatchesCard(action.target, character),
  );
  const targetCharacter =
    targetCharacterIndex >= 0
      ? player.characters[targetCharacterIndex]
      : undefined;
  let exactTarget: CardRef;
  if (isLeaderTarget) {
    exactTarget = toCardRef(player.leader, turnPlayerId);
  } else if (targetCharacter !== undefined) {
    exactTarget = toCardRef(targetCharacter, turnPlayerId);
  } else {
    return illegalAction(
      state,
      "attachDon target must be turn player's leader or character.",
    );
  }
  const attached = profileAttachDonSpan(
    options,
    "engine:attachDon:applyDonAttachment",
    () =>
      applyDonAttachment({
        selectedDonInstanceIds,
        sourcePlayerId: turnPlayerId,
        sourceState: "active",
        state,
        target: exactTarget,
      }),
  );
  if (!attached.ok) {
    return illegalAction(state, attached.reason);
  }

  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    players: attached.players,
  };
  const events: EngineEvent[] = [...attached.events];
  const nextWithRules = profileAttachDonSpan(
    options,
    "engine:attachDon:ruleProcessing",
    () =>
      applyRuleProcessingCheckpoint({
        state: nextState,
        events,
        phase: "main",
        createEvent: (seqOffset, type, payload, visibility) =>
          createEvent(state, seqOffset, type, payload, visibility),
      }),
  );
  profileAttachDonSpan(options, "engine:attachDon:appendEventJournal", () => {
    nextWithRules.eventJournal = [...state.eventJournal, ...events];
  });
  assertGameStateInvariantsIfEnabled(nextWithRules, options);
  return toEngineResult(nextWithRules, events, undefined, options);
};
