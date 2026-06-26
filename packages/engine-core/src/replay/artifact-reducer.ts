import type {
  Action,
  CardRef,
  DecisionId,
  DecisionResponse,
  EngineResult,
  EffectId,
  GameState,
  InstanceId,
  LegalAction,
  PlayerId,
  Zone,
  ZoneRef,
} from "@optcg/types";

import { applyAction, getLegalActions } from "../actions.js";
import {
  advanceDonPhase,
  advanceDrawPhase,
  advanceRefreshPhase,
  enterMainPhase,
} from "../turn/phases.js";
import {
  respondToMulliganDecision,
  startMulliganFlow,
} from "../setup/mulligan.js";
import type { PreMulliganSetupGameState } from "../setup/initial-state.js";
import { hashCanonicalStateValue } from "../state/canonical-state.js";

export interface ReplayArtifactStateFrame {
  readonly index: number;
  readonly actionIndex: number | null;
  readonly label: string;
  readonly state: GameState;
  readonly stateHash: string;
}

export type ReplayArtifactReconstructionResult =
  | {
      readonly status: "ready";
      readonly frames: readonly ReplayArtifactStateFrame[];
    }
  | {
      readonly status: "failed";
      readonly reason: string;
      readonly actionIndex?: number | undefined;
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const numberValue = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

const booleanValue = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

const stringArray = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? [...value]
    : undefined;

const zones = new Set<Zone>([
  "hand",
  "deck",
  "trash",
  "life",
  "costArea",
  "characterArea",
  "stageArea",
  "leaderArea",
  "donDeck",
  "noZone",
]);

const zoneSlots = new Set<NonNullable<ZoneRef["slot"]>>([
  "leader",
  "stage",
  "character",
  "cost",
  "life",
  "hand",
  "deck",
  "trash",
  "donDeck",
  "temporary",
]);

const zoneRefFromValue = (value: unknown): ZoneRef | undefined => {
  if (!isRecord(value) || typeof value["zone"] !== "string") {
    return undefined;
  }
  const zone = value["zone"];
  if (!zones.has(zone as Zone)) {
    return undefined;
  }
  const playerId = stringValue(value["playerId"]);
  const index = numberValue(value["index"]);
  const slot = stringValue(value["slot"]);
  if (
    slot !== undefined &&
    !zoneSlots.has(slot as NonNullable<ZoneRef["slot"]>)
  ) {
    return undefined;
  }
  return {
    zone: zone as Zone,
    ...(playerId === undefined ? {} : { playerId: playerId as PlayerId }),
    ...(index === undefined ? {} : { index }),
    ...(slot === undefined
      ? {}
      : { slot: slot as NonNullable<ZoneRef["slot"]> }),
  };
};

const cardRefFromValue = (value: unknown): CardRef | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const instanceId = stringValue(value["instanceId"]);
  const cardId = stringValue(value["cardId"]);
  const playerId = stringValue(value["playerId"]);
  if (
    instanceId === undefined ||
    cardId === undefined ||
    playerId === undefined
  ) {
    return undefined;
  }
  const zone = zoneRefFromValue(value["zone"]);
  return {
    instanceId: instanceId as InstanceId,
    cardId: cardId as CardRef["cardId"],
    playerId: playerId as PlayerId,
    ...(zone === undefined ? {} : { zone }),
  };
};

const cardRefArray = (value: unknown): CardRef[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const cards = value.map(cardRefFromValue);
  return cards.every((card): card is CardRef => card !== undefined)
    ? cards
    : undefined;
};

const paymentSpecFromValue = (
  value: unknown,
): Extract<Action, { type: "playCard" | "activateEffect" }>["costPayment"] => {
  if (!isRecord(value)) {
    return undefined;
  }
  const optionId = stringValue(value["optionId"]);
  if (optionId === undefined) {
    return undefined;
  }
  const selectedCardInstanceIds = stringArray(value["selectedCardInstanceIds"]);
  const selectedDonInstanceIds = stringArray(value["selectedDonInstanceIds"]);
  return {
    optionId,
    ...(selectedCardInstanceIds === undefined
      ? {}
      : { selectedCardInstanceIds: selectedCardInstanceIds as InstanceId[] }),
    ...(selectedDonInstanceIds === undefined
      ? {}
      : { selectedDonInstanceIds: selectedDonInstanceIds as InstanceId[] }),
  };
};

const decisionResponseFromValue = (
  value: unknown,
): DecisionResponse | undefined => {
  if (!isRecord(value) || typeof value["type"] !== "string") {
    return undefined;
  }
  switch (value["type"]) {
    case "orderedIds": {
      const ids = stringArray(value["ids"]);
      return ids === undefined ? undefined : { type: "orderedIds", ids };
    }
    case "topBottomPlacement": {
      const topIds = stringArray(value["topIds"]);
      const bottomIds = stringArray(value["bottomIds"]);
      return topIds === undefined || bottomIds === undefined
        ? undefined
        : { type: "topBottomPlacement", topIds, bottomIds };
    }
    case "optionalActivation": {
      const choice = value["choice"];
      return choice === "activate" || choice === "decline"
        ? { type: "optionalActivation", choice }
        : undefined;
    }
    case "payment": {
      const optionId = stringValue(value["optionId"]);
      if (optionId === undefined) {
        return undefined;
      }
      const selectedCardInstanceIds = stringArray(
        value["selectedCardInstanceIds"],
      );
      const selectedDonInstanceIds = stringArray(
        value["selectedDonInstanceIds"],
      );
      return {
        type: "payment",
        optionId,
        ...(selectedCardInstanceIds === undefined
          ? {}
          : {
              selectedCardInstanceIds: selectedCardInstanceIds as InstanceId[],
            }),
        ...(selectedDonInstanceIds === undefined
          ? {}
          : { selectedDonInstanceIds: selectedDonInstanceIds as InstanceId[] }),
      };
    }
    case "paymentDeclined":
      return { type: "paymentDeclined" };
    case "targets": {
      const targets = cardRefArray(value["targets"]);
      return targets === undefined ? undefined : { type: "targets", targets };
    }
    case "cards": {
      const cards = cardRefArray(value["cards"]);
      return cards === undefined ? undefined : { type: "cards", cards };
    }
    case "effectOption": {
      const optionId = stringValue(value["optionId"]);
      return optionId === undefined
        ? undefined
        : { type: "effectOption", optionId };
    }
    case "effectOptionDeclined":
      return { type: "effectOptionDeclined" };
    case "lifeTrigger": {
      const choice = value["choice"];
      return choice === "activateTrigger" || choice === "addToHand"
        ? { type: "lifeTrigger", choice }
        : undefined;
    }
    case "replacement": {
      const replacementId = stringValue(value["replacementId"]);
      return replacementId === undefined
        ? { type: "replacement" }
        : { type: "replacement", replacementId };
    }
    case "mulligan": {
      const keep = booleanValue(value["keep"]);
      return keep === undefined ? undefined : { type: "mulligan", keep };
    }
    case "loopCount": {
      const count = numberValue(value["count"]);
      return count === undefined ? undefined : { type: "loopCount", count };
    }
    case "rollbackConsent": {
      const allow = booleanValue(value["allow"]);
      return allow === undefined
        ? undefined
        : { type: "rollbackConsent", allow };
    }
    case "chooseQuantity": {
      const quantity = numberValue(value["quantity"]);
      return quantity === undefined
        ? undefined
        : { type: "chooseQuantity", quantity };
    }
    default:
      return undefined;
  }
};

const actionFromValue = (value: unknown): Action | undefined => {
  if (!isRecord(value) || typeof value["type"] !== "string") {
    return undefined;
  }
  switch (value["type"]) {
    case "playCard": {
      const cardInstanceId = stringValue(value["cardInstanceId"]);
      if (cardInstanceId === undefined) {
        return undefined;
      }
      const costPayment = paymentSpecFromValue(value["costPayment"]);
      return {
        type: "playCard",
        cardInstanceId: cardInstanceId as InstanceId,
        ...(costPayment === undefined ? {} : { costPayment }),
      };
    }
    case "activateEffect": {
      const source = cardRefFromValue(value["source"]);
      const effectId = stringValue(value["effectId"]);
      if (source === undefined || effectId === undefined) {
        return undefined;
      }
      const costPayment = paymentSpecFromValue(value["costPayment"]);
      return {
        type: "activateEffect",
        source,
        effectId: effectId as EffectId,
        ...(costPayment === undefined ? {} : { costPayment }),
      };
    }
    case "attachDon": {
      const target = cardRefFromValue(value["target"]);
      if (target === undefined) {
        return undefined;
      }
      const donInstanceId = stringValue(value["donInstanceId"]);
      const selectedDonInstanceIds = stringArray(
        value["selectedDonInstanceIds"],
      );
      return {
        type: "attachDon",
        target,
        ...(donInstanceId === undefined
          ? {}
          : { donInstanceId: donInstanceId as InstanceId }),
        ...(selectedDonInstanceIds === undefined
          ? {}
          : { selectedDonInstanceIds: selectedDonInstanceIds as InstanceId[] }),
      };
    }
    case "declareAttack": {
      const attacker = cardRefFromValue(value["attacker"]);
      const target = cardRefFromValue(value["target"]);
      return attacker === undefined || target === undefined
        ? undefined
        : { type: "declareAttack", attacker, target };
    }
    case "activateBlocker": {
      const blocker = cardRefFromValue(value["blocker"]);
      return blocker === undefined
        ? undefined
        : { type: "activateBlocker", blocker };
    }
    case "useCounter": {
      const cardInstanceId = stringValue(value["cardInstanceId"]);
      const target = cardRefFromValue(value["target"]);
      return cardInstanceId === undefined || target === undefined
        ? undefined
        : {
            type: "useCounter",
            cardInstanceId: cardInstanceId as InstanceId,
            target,
          };
    }
    case "endMainPhase":
      return { type: "endMainPhase" };
    case "concede": {
      const playerId = stringValue(value["playerId"]);
      return playerId === undefined
        ? undefined
        : { type: "concede", playerId: playerId as PlayerId };
    }
    case "respondToDecision": {
      const decisionId = stringValue(value["decisionId"]);
      const response = decisionResponseFromValue(value["response"]);
      return decisionId === undefined || response === undefined
        ? undefined
        : {
            type: "respondToDecision",
            decisionId: decisionId as DecisionId,
            response,
          };
    }
    default:
      return undefined;
  }
};

const hasErrors = (
  result: EngineResult,
): result is EngineResult & {
  readonly errors: NonNullable<EngineResult["errors"]>;
} => result.errors !== undefined && result.errors.length > 0;

const combinedEngineResult = (
  result: EngineResult,
  events: EngineResult["events"],
): EngineResult => ({
  ...result,
  events,
});

const advanceToMainPhase = (state: GameState): EngineResult => {
  const events: EngineResult["events"] = [];
  let current = state;
  let currentHash = "";
  for (let stepCount = 0; stepCount < 4; stepCount += 1) {
    if (
      current.turn.phase === "main" ||
      current.status.type !== "active" ||
      current.pendingDecision !== undefined ||
      current.battle !== undefined
    ) {
      return combinedEngineResult(
        { state: current, events, stateHash: currentHash },
        events,
      );
    }
    if (current.turn.phase === "refresh") {
      const result = advanceRefreshPhase(current);
      events.push(...result.events);
      if (hasErrors(result)) {
        return combinedEngineResult(result, events);
      }
      current = result.state;
      currentHash = result.stateHash;
      continue;
    }
    if (current.turn.phase === "draw") {
      const result = advanceDrawPhase(current);
      events.push(...result.events);
      if (hasErrors(result)) {
        return combinedEngineResult(result, events);
      }
      current = result.state;
      currentHash = result.stateHash;
      continue;
    }
    if (current.turn.phase === "don") {
      const donResult = advanceDonPhase(current);
      events.push(...donResult.events);
      if (hasErrors(donResult)) {
        return combinedEngineResult(donResult, events);
      }
      current = donResult.state;
      currentHash = donResult.stateHash;
      if (current.pendingDecision !== undefined) {
        continue;
      }
      const mainResult = enterMainPhase(current);
      events.push(...mainResult.events);
      if (hasErrors(mainResult)) {
        return combinedEngineResult(mainResult, events);
      }
      current = mainResult.state;
      currentHash = mainResult.stateHash;
      continue;
    }
    return combinedEngineResult(
      { state: current, events, stateHash: currentHash },
      events,
    );
  }
  return combinedEngineResult(
    { state: current, events, stateHash: currentHash },
    events,
  );
};

const startMulliganAfterSetupIfReady = (result: EngineResult): EngineResult => {
  if (
    hasErrors(result) ||
    result.state.status.type !== "setup" ||
    result.state.pendingDecision !== undefined
  ) {
    return result;
  }
  const started = startMulliganFlow(result.state as PreMulliganSetupGameState);
  return combinedEngineResult(started, [...result.events, ...started.events]);
};

const autoAdvanceMandatoryTurnFlow = (result: EngineResult): EngineResult => {
  if (hasErrors(result)) {
    return result;
  }
  const advanced = advanceToMainPhase(result.state);
  return combinedEngineResult(advanced, [...result.events, ...advanced.events]);
};

const finalizeReplayResult = (result: EngineResult): EngineResult =>
  autoAdvanceMandatoryTurnFlow(startMulliganAfterSetupIfReady(result));

const applyReplayAction = (state: GameState, action: Action): EngineResult => {
  if (
    action.type === "respondToDecision" &&
    action.response.type === "mulligan" &&
    state.pendingDecision?.type === "mulligan"
  ) {
    return finalizeReplayResult(respondToMulliganDecision(state, action));
  }
  return finalizeReplayResult(applyAction(state, action));
};

const replayActionFromAuthority = (
  state: GameState,
  entry: unknown,
):
  | {
      readonly status: "ready";
      readonly result: EngineResult;
      readonly label: string;
      readonly expectedStateSeqAfter?: number | undefined;
      readonly expectedStateHashAfter?: string | undefined;
    }
  | { readonly status: "failed"; readonly reason: string }
  | undefined => {
  if (!isRecord(entry) || !isRecord(entry["replay"])) {
    return undefined;
  }
  const replay = entry["replay"];
  const stateSeqBefore = numberValue(replay["stateSeqBefore"]);
  if (stateSeqBefore !== undefined && stateSeqBefore !== state.seq) {
    return {
      status: "failed",
      reason: "Replay state sequence before entry does not match.",
    };
  }
  const stateHashBefore = stringValue(replay["stateHashBefore"]);
  if (
    stateHashBefore !== undefined &&
    stateHashBefore !== hashCanonicalStateValue(state)
  ) {
    return {
      status: "failed",
      reason: "Replay state hash before entry does not match.",
    };
  }
  const expectedStateSeqAfter = numberValue(replay["stateSeqAfter"]);
  const expectedStateHashAfter = stringValue(replay["stateHashAfter"]);
  if (replay["kind"] === "system") {
    return replay["systemAction"] === "advanceToMainPhase"
      ? {
          status: "ready",
          result: finalizeReplayResult(advanceToMainPhase(state)),
          label: "advanceToMainPhase",
          expectedStateSeqAfter,
          expectedStateHashAfter,
        }
      : { status: "failed", reason: "Unsupported replay system action." };
  }
  if (replay["kind"] !== "action") {
    return { status: "failed", reason: "Replay entry kind is unsupported." };
  }
  const action = actionFromValue(replay["action"]);
  if (action === undefined) {
    return { status: "failed", reason: "Replay entry action is malformed." };
  }
  return {
    status: "ready",
    result: applyReplayAction(state, action),
    label: action.type,
    expectedStateSeqAfter,
    expectedStateHashAfter,
  };
};

const actionWithSelectedDon = (
  action: LegalAction,
  selectedDonInstanceIds: readonly InstanceId[] | undefined,
): Action =>
  action.type === "attachDon" &&
  selectedDonInstanceIds !== undefined &&
  selectedDonInstanceIds.length > 0
    ? { ...action, selectedDonInstanceIds: [...selectedDonInstanceIds] }
    : action;

const replayActionFromEntry = (
  state: GameState,
  entry: unknown,
):
  | {
      readonly status: "ready";
      readonly result: EngineResult;
      readonly label: string;
      readonly expectedStateSeqAfter?: number | undefined;
      readonly expectedStateHashAfter?: string | undefined;
    }
  | { readonly status: "failed"; readonly reason: string } => {
  const authoritative = replayActionFromAuthority(state, entry);
  if (authoritative !== undefined) {
    return authoritative;
  }
  if (!isRecord(entry) || !isRecord(entry["envelope"])) {
    return { status: "failed", reason: "Replay entry is missing an envelope." };
  }
  const request = entry["envelope"]["request"];
  if (!isRecord(request) || typeof request["type"] !== "string") {
    return {
      status: "failed",
      reason: "Replay entry is missing a request type.",
    };
  }
  const type = request["type"];
  if (
    type === "submitAction" &&
    typeof request["playerId"] === "string" &&
    typeof request["actionIndex"] === "number"
  ) {
    const playerId = request["playerId"] as PlayerId;
    if (
      state.pendingDecision?.type === "mulligan" &&
      state.pendingDecision.playerId === playerId &&
      (request["actionIndex"] === 0 || request["actionIndex"] === 1)
    ) {
      const keep = request["actionIndex"] === 0;
      return {
        status: "ready",
        result: finalizeReplayResult(
          respondToMulliganDecision(state, {
            type: "respondToDecision",
            decisionId: state.pendingDecision.id,
            response: { type: "mulligan", keep },
          }),
        ),
        label: keep ? "keepMulliganHand" : "takeMulligan",
      };
    }
    if (
      state.status.type === "active" &&
      state.pendingDecision === undefined &&
      state.battle === undefined &&
      state.turn.turnPlayerId === playerId &&
      state.turn.phase !== "main" &&
      request["actionIndex"] === 0
    ) {
      return {
        status: "ready",
        result: finalizeReplayResult(advanceToMainPhase(state)),
        label: "advanceToMainPhase",
      };
    }
    const legalActions = getLegalActions(state, playerId);
    const action = legalActions[request["actionIndex"]];
    if (action === undefined) {
      return {
        status: "failed",
        reason: `Replay submitAction index ${String(request["actionIndex"])} is not legal.`,
      };
    }
    const selectedDonInstanceIds = Array.isArray(
      request["selectedDonInstanceIds"],
    )
      ? request["selectedDonInstanceIds"].flatMap((entry) =>
          typeof entry === "string" ? [entry as InstanceId] : [],
        )
      : undefined;
    return {
      status: "ready",
      result: finalizeReplayResult(
        applyAction(
          state,
          actionWithSelectedDon(action, selectedDonInstanceIds),
        ),
      ),
      label: action.type,
    };
  }
  if (type === "endMainPhase") {
    return {
      status: "ready",
      result: finalizeReplayResult(applyAction(state, { type })),
      label: type,
    };
  }
  if (type === "playCard" && typeof request["cardInstanceId"] === "string") {
    return {
      status: "ready",
      result: finalizeReplayResult(
        applyAction(state, {
          type,
          cardInstanceId: request["cardInstanceId"] as InstanceId,
        }),
      ),
      label: type,
    };
  }
  if (type === "concede" && typeof request["playerId"] === "string") {
    return {
      status: "ready",
      result: finalizeReplayResult(
        applyAction(state, {
          type,
          playerId: request["playerId"] as PlayerId,
        }),
      ),
      label: type,
    };
  }
  if (
    type === "respondToDecision" &&
    typeof request["decisionId"] === "string" &&
    isRecord(request["response"])
  ) {
    const action: Extract<Action, { type: "respondToDecision" }> = {
      type,
      decisionId: request["decisionId"] as DecisionId,
      response: request["response"] as unknown as DecisionResponse,
    };
    const result =
      action.response.type === "mulligan"
        ? respondToMulliganDecision(state, action)
        : applyAction(state, action);
    return {
      status: "ready",
      result: finalizeReplayResult(result),
      label: type,
    };
  }
  return { status: "failed", reason: `Unsupported replay action ${type}.` };
};

export const reconstructReplayArtifactStates = ({
  deterministicEntries,
  expectedFinalStateHash,
  initialState,
}: {
  readonly initialState: GameState;
  readonly deterministicEntries: readonly unknown[];
  readonly expectedFinalStateHash?: string | undefined;
}): ReplayArtifactReconstructionResult => {
  const stateHash = hashCanonicalStateValue(initialState);
  const frames: ReplayArtifactStateFrame[] = [
    {
      index: 0,
      actionIndex: null,
      label: "Initial state",
      state: structuredClone(initialState),
      stateHash,
    },
  ];
  let current = structuredClone(initialState);
  for (const [actionIndex, entry] of deterministicEntries.entries()) {
    const decoded = replayActionFromEntry(current, entry);
    if (decoded.status === "failed") {
      return { status: "failed", reason: decoded.reason, actionIndex };
    }
    const result = decoded.result;
    if (result.errors !== undefined) {
      return {
        status: "failed",
        reason: result.errors
          .map((error) => ("reason" in error ? error.reason : error.type))
          .join("; "),
        actionIndex,
      };
    }
    current = result.state;
    const currentHash = hashCanonicalStateValue(current);
    if (
      decoded.expectedStateSeqAfter !== undefined &&
      decoded.expectedStateSeqAfter !== current.seq
    ) {
      return {
        status: "failed",
        reason: "Replay state sequence after entry does not match.",
        actionIndex,
      };
    }
    if (
      decoded.expectedStateHashAfter !== undefined &&
      decoded.expectedStateHashAfter !== currentHash
    ) {
      return {
        status: "failed",
        reason: "Replay state hash after entry does not match.",
        actionIndex,
      };
    }
    frames.push({
      index: frames.length,
      actionIndex,
      label: decoded.label,
      state: structuredClone(current),
      stateHash: currentHash,
    });
  }
  const finalStateHash = frames.at(-1)?.stateHash ?? stateHash;
  if (
    expectedFinalStateHash !== undefined &&
    expectedFinalStateHash !== finalStateHash
  ) {
    return {
      status: "failed",
      reason: "Replay reconstruction final hash mismatch.",
    };
  }
  return { status: "ready", frames };
};
