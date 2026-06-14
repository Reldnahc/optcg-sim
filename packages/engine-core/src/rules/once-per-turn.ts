import type {
  EffectDefinition,
  EffectQueueEntry,
  GameState,
  OncePerTurnRecord,
} from "@optcg/types";

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

export interface OncePerTurnGateInput {
  readonly sourceInstanceId: OncePerTurnRecord["cardInstanceId"];
  readonly effectId: OncePerTurnRecord["effectId"];
  readonly turnNumber: OncePerTurnRecord["turnNumber"];
  readonly oncePerTurn: boolean;
}

export interface OncePerTurnGate {
  readonly key?: OncePerTurnKey;
  readonly canUse: (state: GameState) => boolean;
  readonly consume: (state: GameState) => GameState;
}

export const createOncePerTurnGate = (
  input: OncePerTurnGateInput,
): OncePerTurnGate => {
  if (!input.oncePerTurn) {
    return {
      canUse: () => true,
      consume: (state) => state,
    };
  }

  const key = toOncePerTurnKey({
    cardInstanceId: input.sourceInstanceId,
    effectId: input.effectId,
    turnNumber: input.turnNumber,
  });
  return {
    key,
    canUse: (state) => !isOncePerTurnUsed(state, key),
    consume: (state) => consumeOncePerTurn(state, key),
  };
};

export const createOncePerTurnGateForQueueEntry = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: Pick<EffectDefinition["effects"][number], "oncePerTurn">,
): OncePerTurnGate =>
  createOncePerTurnGate({
    sourceInstanceId: entry.source.instanceId,
    effectId: entry.effectBlockId,
    turnNumber: state.turn.globalTurn,
    oncePerTurn: effect.oncePerTurn === true,
  });

export const canAdmitOncePerTurnEffect = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: Pick<EffectDefinition["effects"][number], "oncePerTurn">,
): boolean =>
  createOncePerTurnGateForQueueEntry(state, entry, effect).canUse(state);

export const consumeOncePerTurnForQueueEntry = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: Pick<EffectDefinition["effects"][number], "oncePerTurn">,
): GameState =>
  createOncePerTurnGateForQueueEntry(state, entry, effect).consume(state);

export const consumeOncePerTurnForKey = (
  state: GameState,
  key: OncePerTurnKey,
): GameState =>
  createOncePerTurnGate({
    sourceInstanceId: key.cardInstanceId,
    effectId: key.effectId,
    turnNumber: key.turnNumber,
    oncePerTurn: true,
  }).consume(state);
