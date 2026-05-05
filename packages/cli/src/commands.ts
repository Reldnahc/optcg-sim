import {
  applyAction,
  advanceDonPhase,
  advanceDrawPhase,
  advanceRefreshPhase,
  enterMainPhase,
  hashCanonicalStateValue,
  respondToMulliganDecision,
} from "@optcg/engine-core";
import type {
  CardInstance,
  CardRef,
  EngineError,
  EngineResult,
  GameState,
  InstanceId,
  PlayerId,
} from "@optcg/types";

import {
  renderDeveloperHand,
  renderLegalActions,
  renderShow,
} from "./render.js";

export type CliCommand =
  | { type: "show" }
  | { type: "hand" }
  | { type: "play"; handIndex: number }
  | { type: "attach-don"; donIndex: number; target: string }
  | { type: "attack"; attacker: string; target: string }
  | { type: "counter"; handIndex: number }
  | { type: "pass" }
  | { type: "respond"; choice: string }
  | { type: "concede" }
  | { type: "hash" };

export type ParseCliCommandResult =
  | { ok: true; command: CliCommand }
  | { ok: false; error: string };

export interface DispatchCliCommandOptions {
  playerId?: PlayerId;
}

export interface DispatchCliCommandResult {
  state: GameState;
  stateHash: string;
  output: string;
  errors: string[];
  events: EngineResult["events"];
}

const nonNegativeIntegerPattern = /^(0|[1-9]\d*)$/u;

const parseNonNegativeInteger = (value: string | undefined): number | null => {
  if (value === undefined || !nonNegativeIntegerPattern.test(value)) {
    return null;
  }
  return Number(value);
};

export const parseCliCommand = (input: string): ParseCliCommandResult => {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "No command provided." };
  }

  const parts = trimmed.split(/\s+/u);
  const verb = parts[0];
  if (verb === undefined) {
    return { ok: false, error: "No command provided." };
  }
  const args = parts.slice(1);
  switch (verb) {
    case "show":
    case "hand":
    case "pass":
    case "concede":
    case "hash":
      if (args.length > 0) {
        return { ok: false, error: `${verb} does not accept arguments.` };
      }
      return { ok: true, command: { type: verb } };

    case "play": {
      if (args.length !== 1) {
        return { ok: false, error: "play requires <handIndex>." };
      }
      const handIndex = parseNonNegativeInteger(args[0]);
      if (handIndex === null) {
        return {
          ok: false,
          error: "play requires a non-negative integer handIndex.",
        };
      }
      return { ok: true, command: { type: "play", handIndex } };
    }

    case "attach-don": {
      if (args.length !== 2) {
        return {
          ok: false,
          error: "attach-don requires <donIndex> and <target>.",
        };
      }
      const donIndex = parseNonNegativeInteger(args[0]);
      if (donIndex === null) {
        return {
          ok: false,
          error: "attach-don requires a non-negative integer donIndex.",
        };
      }
      const target = args[1];
      if (target === undefined) {
        return {
          ok: false,
          error: "attach-don requires <donIndex> and <target>.",
        };
      }
      return { ok: true, command: { type: "attach-don", donIndex, target } };
    }

    case "attack": {
      if (args.length !== 2) {
        return {
          ok: false,
          error: "attack requires <attacker> and <target>.",
        };
      }
      const attacker = args[0];
      const target = args[1];
      if (attacker === undefined || target === undefined) {
        return {
          ok: false,
          error: "attack requires <attacker> and <target>.",
        };
      }
      return { ok: true, command: { type: "attack", attacker, target } };
    }

    case "counter": {
      if (args.length !== 1) {
        return { ok: false, error: "counter requires <handIndex>." };
      }
      const handIndex = parseNonNegativeInteger(args[0]);
      if (handIndex === null) {
        return {
          ok: false,
          error: "counter requires a non-negative integer handIndex.",
        };
      }
      return { ok: true, command: { type: "counter", handIndex } };
    }

    case "respond": {
      if (args.length !== 1) {
        return { ok: false, error: "respond requires <choice>." };
      }
      const choice = args[0];
      if (choice === undefined) {
        return { ok: false, error: "respond requires <choice>." };
      }
      return { ok: true, command: { type: "respond", choice } };
    }

    default:
      return { ok: false, error: `Unsupported command: ${verb}.` };
  }
};

const renderStatus = (status: GameState["status"]): string => {
  switch (status.type) {
    case "setup":
    case "active":
      return status.type;
    case "frozen":
      return status.reason === undefined
        ? "frozen"
        : `frozen (${status.reason})`;
    case "completed":
    case "gameOver":
      return `${status.type} winner=${String(status.winner)}`;
    case "errored":
      return `errored (${status.reason})`;
  }
};

const renderPendingDecisionSummary = (state: GameState): string => {
  const decision = state.pendingDecision;
  if (decision === undefined) {
    return "Pending decision: none";
  }
  return `Pending decision: ${decision.type} ${String(decision.id)} for ${String(
    decision.playerId,
  )}`;
};

const summaryPlayerId = (state: GameState): PlayerId =>
  state.pendingDecision?.playerId ?? state.turn.turnPlayerId;

const renderStateSummary = (state: GameState): string => {
  const playerId = summaryPlayerId(state);
  return [
    `State seq: ${String(state.seq)}`,
    `Status: ${renderStatus(state.status)}`,
    `Phase: ${state.turn.phase}`,
    renderPendingDecisionSummary(state),
    renderLegalActions(state, playerId),
    `State hash: ${hashCanonicalStateValue(state)}`,
  ].join("\n");
};

const describeEngineError = (error: EngineError): string => {
  switch (error.type) {
    case "illegalAction":
    case "invalidDecisionResponse":
      return `${error.type}: ${error.reason}`;
    case "invariantViolation":
      return `${error.type}: ${error.invariant}`;
    case "unsupportedCard":
      return `${error.type}: ${String(error.cardId)}`;
    case "effectRuntimeError":
      return `${error.type}: ${error.effectId}`;
    case "loopDetected":
      return `${error.type}: ${JSON.stringify(error.signature)}`;
  }
};

const resultFromState = (
  state: GameState,
  errors: string[] = [],
  leadingOutput?: string,
): DispatchCliCommandResult => {
  const stateHash = hashCanonicalStateValue(state);
  const summary = renderStateSummary(state);
  const errorOutput =
    errors.length === 0
      ? undefined
      : `CLI errors:\n${errors.map((error) => `  ${error}`).join("\n")}`;
  const prefix = leadingOutput ?? errorOutput;
  const outputParts =
    prefix === undefined || prefix.length === 0 ? [summary] : [prefix, summary];
  return {
    state,
    stateHash,
    output: outputParts.join("\n"),
    errors,
    events: [],
  };
};

const resultFromAdvancedState = (
  state: GameState,
  events: EngineResult["events"],
  errors: string[],
): DispatchCliCommandResult => {
  const stateHash = hashCanonicalStateValue(state);
  const errorOutput =
    errors.length === 0
      ? undefined
      : `Engine errors:\n${errors.map((error) => `  ${error}`).join("\n")}`;
  return {
    state,
    stateHash,
    output:
      errorOutput === undefined
        ? renderStateSummary(state)
        : `${errorOutput}\n${renderStateSummary(state)}`,
    errors,
    events,
  };
};

const resultFromEngine = (result: EngineResult): DispatchCliCommandResult => {
  const engineErrors = result.errors?.map(describeEngineError) ?? [];
  const errorOutput =
    engineErrors.length === 0
      ? undefined
      : `Engine errors:\n${engineErrors.map((error) => `  ${error}`).join("\n")}`;
  return {
    state: result.state,
    stateHash: result.stateHash,
    output:
      errorOutput === undefined
        ? renderStateSummary(result.state)
        : `${errorOutput}\n${renderStateSummary(result.state)}`,
    errors: engineErrors,
    events: result.events,
  };
};

const shouldStopCliPhaseAdvancement = (state: GameState): boolean =>
  state.status.type !== "active" ||
  state.pendingDecision !== undefined ||
  state.turn.phase === "main";

const engineResultErrors = (result: EngineResult): string[] =>
  result.errors?.map(describeEngineError) ?? [];

const appendEngineResult = (
  current: {
    state: GameState;
    events: EngineResult["events"];
    errors: string[];
  },
  result: EngineResult,
): typeof current => ({
  state: result.state,
  events: [...current.events, ...result.events],
  errors: [...current.errors, ...engineResultErrors(result)],
});

const advanceOneCliPhase = (
  state: GameState,
): {
  state: GameState;
  events: EngineResult["events"];
  errors: string[];
} | null => {
  switch (state.turn.phase) {
    case "refresh":
      return appendEngineResult(
        { state, events: [], errors: [] },
        advanceRefreshPhase(state),
      );
    case "draw":
      return appendEngineResult(
        { state, events: [], errors: [] },
        advanceDrawPhase(state),
      );
    case "don": {
      const don = appendEngineResult(
        { state, events: [], errors: [] },
        advanceDonPhase(state),
      );
      if (don.errors.length > 0 || shouldStopCliPhaseAdvancement(don.state)) {
        return don;
      }
      return appendEngineResult(don, enterMainPhase(don.state));
    }
    case "end":
    case "main":
      return null;
  }
};

export const advanceCliCommandResultToActionPoint = (
  result: DispatchCliCommandResult,
): DispatchCliCommandResult => {
  if (result.errors.length > 0 || shouldStopCliPhaseAdvancement(result.state)) {
    return result;
  }

  let advanced = false;
  let current = {
    state: result.state,
    events: result.events,
    errors: result.errors,
  };
  while (!shouldStopCliPhaseAdvancement(current.state)) {
    const next = advanceOneCliPhase(current.state);
    if (next === null) {
      break;
    }

    advanced = true;
    current = {
      state: next.state,
      events: [...current.events, ...next.events],
      errors: [...current.errors, ...next.errors],
    };
    if (next.errors.length > 0) {
      break;
    }
  }

  return advanced
    ? resultFromAdvancedState(current.state, current.events, current.errors)
    : result;
};

const commandActor = (
  state: GameState,
  options: DispatchCliCommandOptions,
): PlayerId =>
  options.playerId ??
  state.pendingDecision?.playerId ??
  state.turn.turnPlayerId;

const opponentOf = (state: GameState, playerId: PlayerId): PlayerId | null => {
  const playerIds = Object.keys(state.players) as PlayerId[];
  return playerIds.find((candidate) => candidate !== playerId) ?? null;
};

const cardRefFromCard = (card: CardInstance, playerId: PlayerId): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

const getPlayerCardRef = (
  state: GameState,
  playerId: PlayerId,
  ref: string,
): CardRef | null => {
  const player = state.players[playerId];
  if (player === undefined) {
    return null;
  }

  if (ref === "leader") {
    return cardRefFromCard(player.leader, playerId);
  }

  const characterMatch = /^character:(0|[1-9]\d*)$/u.exec(ref);
  if (characterMatch !== null) {
    const index = Number(characterMatch[1]);
    const character = player.characters[index];
    return character === undefined
      ? null
      : cardRefFromCard(character, playerId);
  }

  return null;
};

const resolveCardReference = (
  state: GameState,
  token: string,
  actor: PlayerId,
): CardRef | null => {
  if (token.startsWith("opponent-")) {
    const opponent = opponentOf(state, actor);
    return opponent === null
      ? null
      : getPlayerCardRef(state, opponent, token.slice("opponent-".length));
  }

  if (token.startsWith("self-")) {
    return getPlayerCardRef(state, actor, token.slice("self-".length));
  }

  const explicitMatch =
    /^([A-Za-z0-9_-]+)\.(leader|character:(?:0|[1-9]\d*))$/u.exec(token);
  if (explicitMatch !== null) {
    const playerId = explicitMatch[1] as PlayerId;
    const ref = explicitMatch[2];
    if (ref === undefined || state.players[playerId] === undefined) {
      return null;
    }
    return getPlayerCardRef(state, playerId, ref);
  }

  return getPlayerCardRef(state, actor, token);
};

const dispatchRespond = (
  state: GameState,
  choice: string,
): DispatchCliCommandResult => {
  if (choice.startsWith("pay:")) {
    return dispatchPayCostResponse(state, choice);
  }

  if (choice.startsWith("cards:")) {
    return dispatchCardsResponse(state, choice);
  }

  if (choice !== "keep" && choice !== "mulligan") {
    return resultFromState(state, [`Unsupported respond choice: ${choice}.`]);
  }

  const decision = state.pendingDecision;
  if (decision === undefined || decision.type !== "mulligan") {
    return resultFromState(state, [
      `No supported pending decision for respond ${choice}.`,
    ]);
  }

  return resultFromEngine(
    respondToMulliganDecision(state, {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "mulligan", keep: choice === "keep" },
    }),
  );
};

const parseCommaSeparatedPayload = (
  choice: string,
  prefix: "pay:" | "cards:",
): string[] | null => {
  const payload = choice.slice(prefix.length);
  if (payload.length === 0) {
    return null;
  }
  const parts = payload.split(",");
  return parts.some((part) => part.length === 0) ? null : parts;
};

const hasDuplicates = (values: readonly string[]): boolean =>
  new Set(values).size !== values.length;

const dispatchPayCostResponse = (
  state: GameState,
  choice: string,
): DispatchCliCommandResult => {
  const decision = state.pendingDecision;
  if (decision === undefined || decision.type !== "payCost") {
    return resultFromState(state, [
      `No supported pending decision for respond ${choice}.`,
    ]);
  }

  const indexParts = parseCommaSeparatedPayload(choice, "pay:");
  if (indexParts === null) {
    return resultFromState(state, [`Malformed respond choice: ${choice}.`]);
  }
  if (hasDuplicates(indexParts)) {
    return resultFromState(state, [
      `Duplicate DON!! selection in respond ${choice}.`,
    ]);
  }

  const player = state.players[decision.playerId];
  if (player === undefined) {
    return resultFromState(state, [
      `No supported pending decision for respond ${choice}.`,
    ]);
  }

  const selectedDonInstanceIds: InstanceId[] = [];
  for (const indexPart of indexParts) {
    const index = parseNonNegativeInteger(indexPart);
    if (index === null) {
      return resultFromState(state, [`Malformed respond choice: ${choice}.`]);
    }
    const don = player.costArea[index];
    if (don === undefined) {
      return resultFromState(state, [
        `Stale DON!! cost area reference in respond ${choice}.`,
      ]);
    }
    selectedDonInstanceIds.push(don.instanceId);
  }

  return resultFromEngine(
    applyAction(state, {
      type: "respondToDecision",
      decisionId: decision.id,
      response: {
        type: "payment",
        optionId: "restDon",
        selectedDonInstanceIds,
      },
    }),
  );
};

const dispatchCardsResponse = (
  state: GameState,
  choice: string,
): DispatchCliCommandResult => {
  const decision = state.pendingDecision;
  if (decision === undefined || decision.type !== "selectCards") {
    return resultFromState(state, [
      `No supported pending decision for respond ${choice}.`,
    ]);
  }

  const cardRefParts = parseCommaSeparatedPayload(choice, "cards:");
  if (cardRefParts === null) {
    return resultFromState(state, [`Malformed respond choice: ${choice}.`]);
  }

  const cards: CardRef[] = [];
  for (const cardRefPart of cardRefParts) {
    const card = resolveCardReference(state, cardRefPart, decision.playerId);
    if (card === null) {
      return resultFromState(state, [
        `Unsupported or stale card reference in respond ${choice}.`,
      ]);
    }
    if (card.playerId !== decision.playerId) {
      return resultFromState(state, [
        `Unsupported or stale card reference in respond ${choice}.`,
      ]);
    }
    if (
      !decision.candidates.some(
        (candidate) => candidate.card.instanceId === card.instanceId,
      )
    ) {
      return resultFromState(state, [
        `Unsupported or stale card reference in respond ${choice}.`,
      ]);
    }
    cards.push(card);
  }

  if (hasDuplicates(cards.map((card) => String(card.instanceId)))) {
    return resultFromState(state, [
      `Duplicate card selection in respond ${choice}.`,
    ]);
  }

  return resultFromEngine(
    applyAction(state, {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "cards", cards },
    }),
  );
};

const dispatchAttachDon = (
  state: GameState,
  command: Extract<CliCommand, { type: "attach-don" }>,
): DispatchCliCommandResult => {
  const actor = state.turn.turnPlayerId;
  const player = state.players[actor];
  const don = player?.costArea[command.donIndex];
  if (player === undefined || don === undefined) {
    return resultFromState(state, [
      `No DON!! at cost area index ${String(command.donIndex)} for ${String(
        actor,
      )}.`,
    ]);
  }

  const target = resolveCardReference(state, command.target, actor);
  if (target === null) {
    return resultFromState(state, [
      `Unsupported or stale card reference: ${command.target}.`,
    ]);
  }

  return resultFromEngine(
    applyAction(state, {
      type: "attachDon",
      donInstanceId: don.instanceId,
      target,
    }),
  );
};

const dispatchAttack = (
  state: GameState,
  command: Extract<CliCommand, { type: "attack" }>,
): DispatchCliCommandResult => {
  const actor = state.turn.turnPlayerId;
  const attacker = resolveCardReference(state, command.attacker, actor);
  if (attacker === null) {
    return resultFromState(state, [
      `Unsupported or stale attacker reference: ${command.attacker}.`,
    ]);
  }

  const target = resolveCardReference(state, command.target, actor);
  if (target === null) {
    return resultFromState(state, [
      `Unsupported or stale target reference: ${command.target}.`,
    ]);
  }

  return resultFromEngine(
    applyAction(state, {
      type: "declareAttack",
      attacker,
      target,
    }),
  );
};

const playActor = (state: GameState): PlayerId =>
  state.pendingDecision?.playerId ?? state.turn.turnPlayerId;

const dispatchPlay = (
  state: GameState,
  command: Extract<CliCommand, { type: "play" }>,
): DispatchCliCommandResult => {
  const actor = playActor(state);
  const player = state.players[actor];
  const card = player?.hand[command.handIndex];
  if (player === undefined || card === undefined) {
    return resultFromState(state, [
      `No hand card at index ${String(command.handIndex)} for ${String(actor)}.`,
    ]);
  }

  return resultFromEngine(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: card.instanceId,
    }),
  );
};

export const dispatchCliCommand = (
  state: GameState,
  input: string,
  options: DispatchCliCommandOptions = {},
): DispatchCliCommandResult => {
  const parsed = parseCliCommand(input);
  if (!parsed.ok) {
    return resultFromState(state, [parsed.error], parsed.error);
  }

  switch (parsed.command.type) {
    case "show": {
      const stateHash = hashCanonicalStateValue(state);
      return {
        state,
        stateHash,
        output: renderShow(state),
        errors: [],
        events: [],
      };
    }
    case "hand": {
      const stateHash = hashCanonicalStateValue(state);
      return {
        state,
        stateHash,
        output: renderDeveloperHand(state, commandActor(state, options)),
        errors: [],
        events: [],
      };
    }
    case "hash": {
      const stateHash = hashCanonicalStateValue(state);
      return {
        state,
        stateHash,
        output: `State hash: ${stateHash}`,
        errors: [],
        events: [],
      };
    }
    case "play":
      return dispatchPlay(state, parsed.command);
    case "counter":
      return resultFromState(state, [
        `counter ${String(parsed.command.handIndex)} is unsupported by the current CLI story.`,
      ]);
    case "respond":
      return dispatchRespond(state, parsed.command.choice);
    case "pass":
      return resultFromEngine(applyAction(state, { type: "endMainPhase" }));
    case "attach-don":
      return dispatchAttachDon(state, parsed.command);
    case "attack":
      return dispatchAttack(state, parsed.command);
    case "concede":
      return resultFromEngine(
        applyAction(state, {
          type: "concede",
          playerId: commandActor(state, options),
        }),
      );
  }
};
