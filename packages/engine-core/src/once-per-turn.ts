import type { GameState, OncePerTurnRecord } from "@optcg/types";

export interface OncePerTurnKey {
  cardInstanceId: OncePerTurnRecord["cardInstanceId"];
  effectId: OncePerTurnRecord["effectId"];
  turnNumber: OncePerTurnRecord["turnNumber"];
}

export const toOncePerTurnKey = (key: OncePerTurnKey): OncePerTurnKey => key;

const isMatchingRecord = (
  record: OncePerTurnRecord,
  key: OncePerTurnKey,
): boolean =>
  record.cardInstanceId === key.cardInstanceId &&
  record.effectId === key.effectId &&
  record.turnNumber === key.turnNumber;

export const isOncePerTurnUsed = (
  state: GameState,
  key: OncePerTurnKey,
): boolean => state.oncePerTurn.some((record) => isMatchingRecord(record, key));

export const consumeOncePerTurn = (
  state: GameState,
  key: OncePerTurnKey,
): GameState => {
  if (isOncePerTurnUsed(state, key)) {
    return state;
  }

  const record: OncePerTurnRecord = {
    cardInstanceId: key.cardInstanceId,
    effectId: key.effectId,
    turnNumber: key.turnNumber,
    usedAtStateSeq: state.seq,
  };

  return {
    ...state,
    oncePerTurn: [...state.oncePerTurn, record],
  };
};
