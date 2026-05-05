import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  advanceDonPhase,
  advanceDrawPhase,
  advanceRefreshPhase,
  enterMainPhase,
  hashCanonicalStateValue,
} from "@optcg/engine-core";
import type { EngineResult, GameState, PlayerId } from "@optcg/types";
import type { CardId, CardInstance, ResolvedCard } from "@optcg/types";

import { bootFixtureMatch } from "./boot.js";
import { dispatchCliCommand } from "./commands.js";
import type { DispatchCliCommandResult } from "./commands.js";
import { runCli } from "./cli.js";

export interface CliSmokeManifestStats {
  manifestHash: string;
  cardDataVersion: string;
  cardCount: number;
}

export type CliSmokeSetupStep =
  | {
      type: "advance-to-main-phase";
      turnPlayerId: PlayerId;
      globalTurn: number;
    }
  | { type: "set-leader-life-count"; playerId: PlayerId; lifeCount: number }
  | { type: "set-deck-empty"; playerId: PlayerId }
  | { type: "set-active-don-count"; playerId: PlayerId; count: number }
  | {
      type: "set-hand-card-metadata";
      playerId: PlayerId;
      handIndex: number;
      category: "character" | "stage";
      cost: number;
      power?: number;
    }
  | { type: "set-stage-from-hand"; playerId: PlayerId; handIndex: number }
  | { type: "fill-character-area-from-hand"; playerId: PlayerId };

export interface CliSmokeScenarioExpected {
  checkpointHashes: readonly string[];
  finalHash: string;
  finalStatus: CliSmokeStatusSnapshot;
}

export interface CliSmokeScenario {
  id: string;
  bootCommands: readonly string[];
  setupScript: readonly CliSmokeSetupStep[];
  actionCommands: readonly string[];
  expected: CliSmokeScenarioExpected;
}

export interface CliSmokeFixture {
  fixtureType: "cliCommandScriptSmokeLocalV1";
  description: string;
  manifestStats: CliSmokeManifestStats;
  scenarios: readonly CliSmokeScenario[];
}

export type CliSmokeStatusSnapshot =
  | { type: "setup" | "active" }
  | { type: "frozen"; reason?: string }
  | { type: "completed" | "gameOver"; winner: string }
  | { type: "errored"; reason: string };

export interface CliSmokeCommandCheckpoint {
  command: string;
  stateSeq: number;
  phase: GameState["turn"]["phase"];
  status: CliSmokeStatusSnapshot;
  pendingDecision: string;
  legalActionsHeader: string;
  stateHash: string;
  output: string;
}

export interface CliSmokeScenarioResult {
  scenarioId: string;
  finalStateHash: string;
  finalStatus: CliSmokeStatusSnapshot;
  checkpoints: readonly CliSmokeCommandCheckpoint[];
}

type JsonRecord = Record<string, unknown>;

const toPlayerId = (value: string): PlayerId => value as PlayerId;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readRecord = (record: JsonRecord, key: string): JsonRecord => {
  const value = record[key];
  if (!isRecord(value)) {
    throw new Error(`CLI smoke fixture ${key} must be an object.`);
  }
  return value;
};

const readString = (record: JsonRecord, key: string): string => {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`CLI smoke fixture ${key} must be a string.`);
  }
  return value;
};

const readNumber = (record: JsonRecord, key: string): number => {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`CLI smoke fixture ${key} must be an integer.`);
  }
  return value;
};

const readRecordArray = (record: JsonRecord, key: string): JsonRecord[] => {
  const value = record[key];
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw new Error(`CLI smoke fixture ${key} must be an object array.`);
  }
  return value;
};

const readStringArray = (record: JsonRecord, key: string): string[] => {
  const value = record[key];
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    throw new Error(`CLI smoke fixture ${key} must be a string array.`);
  }
  return value;
};

const parseManifestStats = (record: JsonRecord): CliSmokeManifestStats => ({
  manifestHash: readString(record, "manifestHash"),
  cardDataVersion: readString(record, "cardDataVersion"),
  cardCount: readNumber(record, "cardCount"),
});

const parseStatusSnapshot = (record: JsonRecord): CliSmokeStatusSnapshot => {
  const type = readString(record, "type");
  if (type === "setup" || type === "active") {
    return { type };
  }
  if (type === "frozen") {
    const reason = record["reason"];
    if (reason === undefined) {
      return { type };
    }
    if (typeof reason !== "string") {
      throw new Error("CLI smoke fixture finalStatus.reason must be a string.");
    }
    return { type, reason };
  }
  if (type === "completed" || type === "gameOver") {
    return { type, winner: readString(record, "winner") };
  }
  if (type === "errored") {
    return { type, reason: readString(record, "reason") };
  }
  throw new Error(`Unsupported CLI smoke fixture finalStatus.type ${type}.`);
};

const parseSetupStep = (record: JsonRecord): CliSmokeSetupStep => {
  const type = readString(record, "type");
  if (type === "advance-to-main-phase") {
    return {
      type,
      turnPlayerId: toPlayerId(readString(record, "turnPlayerId")),
      globalTurn: readNumber(record, "globalTurn"),
    };
  }
  if (type === "set-leader-life-count") {
    return {
      type,
      playerId: toPlayerId(readString(record, "playerId")),
      lifeCount: readNumber(record, "lifeCount"),
    };
  }
  if (type === "set-deck-empty") {
    return {
      type,
      playerId: toPlayerId(readString(record, "playerId")),
    };
  }
  if (type === "set-active-don-count") {
    return {
      type,
      playerId: toPlayerId(readString(record, "playerId")),
      count: readNumber(record, "count"),
    };
  }
  if (type === "set-hand-card-metadata") {
    const power = record["power"];
    if (power !== undefined && typeof power !== "number") {
      throw new Error("CLI smoke fixture power must be an integer.");
    }
    const category = readString(record, "category");
    if (category !== "character" && category !== "stage") {
      throw new Error("CLI smoke fixture category must be character or stage.");
    }
    return {
      type,
      playerId: toPlayerId(readString(record, "playerId")),
      handIndex: readNumber(record, "handIndex"),
      category,
      cost: readNumber(record, "cost"),
      ...(power !== undefined ? { power } : {}),
    };
  }
  if (type === "set-stage-from-hand") {
    return {
      type,
      playerId: toPlayerId(readString(record, "playerId")),
      handIndex: readNumber(record, "handIndex"),
    };
  }
  if (type === "fill-character-area-from-hand") {
    return {
      type,
      playerId: toPlayerId(readString(record, "playerId")),
    };
  }
  throw new Error(`Unsupported CLI smoke fixture setup step ${type}.`);
};

const parseScenario = (record: JsonRecord): CliSmokeScenario => {
  const expected = readRecord(record, "expected");
  return {
    id: readString(record, "id"),
    bootCommands: readStringArray(record, "bootCommands"),
    setupScript: readRecordArray(record, "setupScript").map(parseSetupStep),
    actionCommands: readStringArray(record, "actionCommands"),
    expected: {
      checkpointHashes: readStringArray(expected, "checkpointHashes"),
      finalHash: readString(expected, "finalHash"),
      finalStatus: parseStatusSnapshot(readRecord(expected, "finalStatus")),
    },
  };
};

export const parseCliSmokeFixture = (value: unknown): CliSmokeFixture => {
  if (!isRecord(value)) {
    throw new Error("CLI smoke fixture root must be an object.");
  }
  const fixtureType = readString(value, "fixtureType");
  if (fixtureType !== "cliCommandScriptSmokeLocalV1") {
    throw new Error(`Unsupported CLI smoke fixture type ${fixtureType}.`);
  }
  return {
    fixtureType,
    description: readString(value, "description"),
    manifestStats: parseManifestStats(readRecord(value, "manifestStats")),
    scenarios: readRecordArray(value, "scenarios").map(parseScenario),
  };
};

export const loadCliSmokeFixtureFromFile = (
  fixturePath: string,
): CliSmokeFixture =>
  parseCliSmokeFixture(JSON.parse(readFileSync(fixturePath, "utf8")));

const assertSuccessfulEngineResult = (
  label: string,
  result: EngineResult,
): GameState => {
  if (result.errors !== undefined && result.errors.length > 0) {
    const firstError = result.errors[0];
    const errorType =
      firstError === undefined ? "unknown engine error" : firstError.type;
    throw new Error(`${label} failed with ${errorType}.`);
  }
  return result.state;
};

const assertManifestStats = (
  fixture: CliSmokeFixture,
  state: GameState,
): void => {
  assert.equal(
    state.cardManifest.manifestHash,
    fixture.manifestStats.manifestHash,
    "manifest manifestHash drift",
  );
  assert.equal(
    state.cardManifest.cardDataVersion,
    fixture.manifestStats.cardDataVersion,
    "manifest cardDataVersion drift",
  );
  assert.equal(
    Object.keys(state.cardManifest.cards).length,
    fixture.manifestStats.cardCount,
    "manifest cardCount drift",
  );
};

const mustPlayer = (state: GameState, playerId: PlayerId) => {
  const player = state.players[playerId];
  if (player === undefined) {
    throw new Error(`Missing CLI smoke player ${String(playerId)}.`);
  }
  return player;
};

const advanceToMainPhase = (
  state: GameState,
  turnPlayerId: PlayerId,
  globalTurn: number,
): GameState => {
  const refresh = assertSuccessfulEngineResult(
    "advanceRefreshPhase",
    advanceRefreshPhase(state),
  );
  const draw = assertSuccessfulEngineResult(
    "advanceDrawPhase",
    advanceDrawPhase(refresh),
  );
  const don = assertSuccessfulEngineResult(
    "advanceDonPhase",
    advanceDonPhase(draw),
  );
  const main = assertSuccessfulEngineResult(
    "enterMainPhase",
    enterMainPhase(don),
  );
  main.turn.turnPlayerId = turnPlayerId;
  main.turn.globalTurn = globalTurn;
  main.turn.playerTurnCounts[turnPlayerId] = 2;
  for (const playerId of Object.keys(main.players) as PlayerId[]) {
    mustPlayer(main, playerId).leader.state = "active";
  }
  return main;
};

const setLeaderLifeCount = (
  state: GameState,
  playerId: PlayerId,
  lifeCount: number,
): void => {
  const player = mustPlayer(state, playerId);
  player.life = player.life.slice(0, lifeCount).map((life, index) => ({
    ...life,
    card: {
      ...life.card,
      zone: { zone: "life", playerId, slot: "life", index },
    },
  }));
};

const resolvedSmokeCard = (params: {
  cardId: CardId;
  category: "character" | "stage";
  cost: number;
  power?: number;
}): ResolvedCard => ({
  cardId: params.cardId,
  language: "en",
  name: String(params.cardId),
  category: params.category,
  set: "CLI",
  setName: "CLI Fixtures",
  released: true,
  colors: ["red"],
  attributes: [],
  types: [],
  printedKeywords: [],
  variants: [],
  legality: {},
  officialFaq: [],
  errata: [],
  sourceTextHash: `source:${String(params.cardId)}`,
  behaviorHash: `behavior:${String(params.cardId)}`,
  support: {
    cardId: params.cardId,
    status: "vanilla-confirmed",
    tested: true,
    rulesVersion: "r1",
    cardDataVersion: "cli-fixture",
    sourceTextHash: `source:${String(params.cardId)}`,
    behaviorHash: `behavior:${String(params.cardId)}`,
  },
  cost: params.cost,
  ...(params.power !== undefined ? { power: params.power } : {}),
});

const setActiveDonCount = (
  state: GameState,
  playerId: PlayerId,
  count: number,
): void => {
  const player = mustPlayer(state, playerId);
  const available = [...player.costArea, ...player.donDeck];
  if (count < 0 || count > available.length) {
    throw new Error(
      `Cannot set ${String(playerId)} active DON!! to ${String(count)}.`,
    );
  }
  const nextCostArea: CardInstance[] = available.slice(0, count).map(
    (card, index): CardInstance => ({
      ...card,
      zone: { zone: "costArea", playerId, slot: "cost", index },
      state: "active",
    }),
  );
  const activeIds = new Set(nextCostArea.map((card) => card.instanceId));
  player.costArea = nextCostArea;
  player.donDeck = available
    .filter((card) => !activeIds.has(card.instanceId))
    .map(
      (card, index): CardInstance => ({
        ...card,
        zone: { zone: "donDeck", playerId, slot: "donDeck", index },
      }),
    );
};

const setHandCardMetadata = (
  state: GameState,
  step: Extract<CliSmokeSetupStep, { type: "set-hand-card-metadata" }>,
): void => {
  const player = mustPlayer(state, step.playerId);
  const card = player.hand[step.handIndex];
  if (card === undefined) {
    throw new Error(
      `Missing ${String(step.playerId)} hand card ${String(step.handIndex)}.`,
    );
  }
  state.cardManifest.cards[card.cardId] = resolvedSmokeCard({
    cardId: card.cardId,
    category: step.category,
    cost: step.cost,
    ...(step.power !== undefined ? { power: step.power } : {}),
  });
};

const setStageFromHand = (
  state: GameState,
  playerId: PlayerId,
  handIndex: number,
): void => {
  const player = mustPlayer(state, playerId);
  const source = player.hand[handIndex];
  if (source === undefined) {
    throw new Error(
      `Missing ${String(playerId)} stage source ${String(handIndex)}.`,
    );
  }
  const stage: CardInstance = {
    ...source,
    instanceId:
      `${String(source.instanceId)}:cli-smoke-existing-stage` as CardInstance["instanceId"],
    zone: { zone: "stageArea", playerId, slot: "stage", index: 0 },
    state: "active",
    attachedDon: [],
    turnPlayed: 1,
  };
  player.stage = stage;
  state.cardManifest.cards[stage.cardId] = resolvedSmokeCard({
    cardId: stage.cardId,
    category: "stage",
    cost: 0,
  });
};

const fillCharacterAreaFromHand = (
  state: GameState,
  playerId: PlayerId,
): void => {
  const player = mustPlayer(state, playerId);
  player.characters = Array.from({ length: 5 }, (_, index) => {
    const handIndex = (index % 4) + 1;
    const source = player.hand[handIndex];
    if (source === undefined) {
      throw new Error(
        `Missing ${String(playerId)} character source ${String(handIndex)}.`,
      );
    }
    const character: CardInstance = {
      ...source,
      instanceId:
        `${String(source.instanceId)}:cli-smoke-existing-character:${String(
          index,
        )}` as CardInstance["instanceId"],
      zone: { zone: "characterArea", playerId, slot: "character", index },
      state: "active",
      attachedDon: [],
      turnPlayed: 1,
    };
    state.cardManifest.cards[character.cardId] = resolvedSmokeCard({
      cardId: character.cardId,
      category: "character",
      cost: 0,
      power: 2000,
    });
    return character;
  });
};

const applySetupScript = (
  state: GameState,
  steps: readonly CliSmokeSetupStep[],
): GameState => {
  let current = state;
  for (const step of steps) {
    switch (step.type) {
      case "advance-to-main-phase":
        current = advanceToMainPhase(
          current,
          step.turnPlayerId,
          step.globalTurn,
        );
        break;
      case "set-leader-life-count":
        setLeaderLifeCount(current, step.playerId, step.lifeCount);
        break;
      case "set-deck-empty":
        mustPlayer(current, step.playerId).deck = [];
        break;
      case "set-active-don-count":
        setActiveDonCount(current, step.playerId, step.count);
        break;
      case "set-hand-card-metadata":
        setHandCardMetadata(current, step);
        break;
      case "set-stage-from-hand":
        setStageFromHand(current, step.playerId, step.handIndex);
        break;
      case "fill-character-area-from-hand":
        fillCharacterAreaFromHand(current, step.playerId);
        break;
    }
  }
  return current;
};

const statusSnapshot = (
  status: GameState["status"],
): CliSmokeStatusSnapshot => {
  switch (status.type) {
    case "setup":
    case "active":
      return { type: status.type };
    case "frozen":
      return status.reason === undefined
        ? { type: "frozen" }
        : { type: "frozen", reason: status.reason };
    case "completed":
    case "gameOver":
      return { type: status.type, winner: String(status.winner) };
    case "errored":
      return { type: "errored", reason: status.reason };
  }
};

const pendingDecisionSummary = (state: GameState): string => {
  const decision = state.pendingDecision;
  if (decision === undefined) {
    return "none";
  }
  return `${decision.type}:${String(decision.id)}:${String(decision.playerId)}`;
};

const legalActionsHeader = (output: string): string => {
  const header = output
    .split("\n")
    .find((line) => line.startsWith("Legal actions for "));
  if (header === undefined) {
    throw new Error("CLI smoke output is missing legal actions.");
  }
  return header;
};

const assertCliCommandAccepted = (
  result: DispatchCliCommandResult,
  command: string,
): void => {
  if (result.errors.length > 0) {
    throw new Error(
      `CLI smoke command "${command}" failed: ${result.errors.join("; ")}`,
    );
  }
};

const commandCheckpoint = (
  command: string,
  result: DispatchCliCommandResult,
): CliSmokeCommandCheckpoint => ({
  command,
  stateSeq: Number(result.state.seq),
  phase: result.state.turn.phase,
  status: statusSnapshot(result.state.status),
  pendingDecision: pendingDecisionSummary(result.state),
  legalActionsHeader: legalActionsHeader(result.output),
  stateHash: result.stateHash,
  output: result.output,
});

const findScenario = (
  fixture: CliSmokeFixture,
  scenarioId: string,
): CliSmokeScenario => {
  const scenario = fixture.scenarios.find(
    (candidate) => candidate.id === scenarioId,
  );
  if (scenario === undefined) {
    throw new Error(`Missing CLI smoke scenario ${scenarioId}.`);
  }
  return scenario;
};

export const runCliSmokeScenario = (
  fixture: CliSmokeFixture,
  scenarioId: string,
): CliSmokeScenarioResult => {
  const scenario = findScenario(fixture, scenarioId);
  let state = bootFixtureMatch().state;
  assertManifestStats(fixture, state);
  const checkpoints: CliSmokeCommandCheckpoint[] = [];

  for (const command of scenario.bootCommands) {
    const result = dispatchCliCommand(state, command);
    assertCliCommandAccepted(result, command);
    state = result.state;
    checkpoints.push(commandCheckpoint(command, result));
  }

  state = applySetupScript(state, scenario.setupScript);

  for (const command of scenario.actionCommands) {
    const result = dispatchCliCommand(state, command);
    assertCliCommandAccepted(result, command);
    state = result.state;
    checkpoints.push(commandCheckpoint(command, result));
  }

  return {
    scenarioId,
    finalStateHash: hashCanonicalStateValue(state),
    finalStatus: statusSnapshot(state.status),
    checkpoints,
  };
};

const createStringWriter = (): {
  readonly output: () => string;
  readonly writer: { write: (chunk: string | Uint8Array) => boolean };
} => {
  let value = "";
  return {
    output: () => value,
    writer: {
      write: (chunk: string | Uint8Array): boolean => {
        value += String(chunk);
        return true;
      },
    },
  };
};

const emptyInput = (): AsyncIterable<string | Uint8Array> => ({
  [Symbol.asyncIterator](): AsyncIterator<string | Uint8Array> {
    return {
      next: () => Promise.resolve({ done: true, value: undefined }),
    };
  },
});

export const runCliSmokeScenarioThroughCommandScript = async (
  fixture: CliSmokeFixture,
  scenarioId: string,
): Promise<CliSmokeScenarioResult> => {
  const scenario = findScenario(fixture, scenarioId);
  let state = bootFixtureMatch().state;
  assertManifestStats(fixture, state);
  const checkpoints: CliSmokeCommandCheckpoint[] = [];

  for (const command of scenario.bootCommands) {
    const result = dispatchCliCommand(state, command);
    assertCliCommandAccepted(result, command);
    state = result.state;
    checkpoints.push(commandCheckpoint(command, result));
  }

  state = applySetupScript(state, scenario.setupScript);

  const stdout = createStringWriter();
  const stderr = createStringWriter();
  const scriptExitCode = await runCli(
    ["--command-script", scenario.actionCommands.join(";")],
    {
      stdin: emptyInput(),
      stdout: stdout.writer,
      stderr: stderr.writer,
    },
    {
      commandScriptInitialState: state,
      onCommandScriptResult: ({ command, result }) => {
        assertCliCommandAccepted(result, command);
        state = result.state;
        checkpoints.push(commandCheckpoint(command, result));
      },
    },
  );

  if (scriptExitCode !== 0) {
    throw new Error(
      `CLI smoke command script exited ${String(scriptExitCode)}: ${stderr.output()}`,
    );
  }
  if (stderr.output().length > 0) {
    throw new Error(
      `CLI smoke command script wrote stderr: ${stderr.output()}`,
    );
  }

  return {
    scenarioId,
    finalStateHash: hashCanonicalStateValue(state),
    finalStatus: statusSnapshot(state.status),
    checkpoints,
  };
};

export const runCliSmokeScenarioFromNormalBootThroughCommandScript = async (
  fixture: CliSmokeFixture,
  scenarioId: string,
): Promise<CliSmokeScenarioResult> => {
  const scenario = findScenario(fixture, scenarioId);
  if (scenario.setupScript.length > 0) {
    throw new Error(
      `${scenario.id} cannot use post-boot setup mutation shortcuts.`,
    );
  }

  let state = bootFixtureMatch().state;
  assertManifestStats(fixture, state);
  const checkpoints: CliSmokeCommandCheckpoint[] = [];
  const stdout = createStringWriter();
  const stderr = createStringWriter();
  const commands = [...scenario.bootCommands, ...scenario.actionCommands];
  const scriptExitCode = await runCli(
    ["--command-script", commands.join(";")],
    {
      stdin: emptyInput(),
      stdout: stdout.writer,
      stderr: stderr.writer,
    },
    {
      onCommandScriptResult: ({ command, result }) => {
        assertCliCommandAccepted(result, command);
        state = result.state;
        checkpoints.push(commandCheckpoint(command, result));
      },
    },
  );

  if (scriptExitCode !== 0) {
    throw new Error(
      `CLI smoke command script exited ${String(scriptExitCode)}: ${stderr.output()}`,
    );
  }
  if (stderr.output().length > 0) {
    throw new Error(
      `CLI smoke command script wrote stderr: ${stderr.output()}`,
    );
  }

  return {
    scenarioId,
    finalStateHash: hashCanonicalStateValue(state),
    finalStatus: statusSnapshot(state.status),
    checkpoints,
  };
};

export const assertCliSmokeScenarioResultMatchesFixture = (
  fixture: CliSmokeFixture,
  result: CliSmokeScenarioResult,
): void => {
  const scenario = findScenario(fixture, result.scenarioId);
  assert.deepEqual(
    result.checkpoints.map((checkpoint) => checkpoint.stateHash),
    scenario.expected.checkpointHashes,
    `${scenario.id} checkpoint hash drift`,
  );
  assert.equal(
    result.finalStateHash,
    scenario.expected.finalHash,
    `${scenario.id} final hash drift`,
  );
  assert.deepEqual(
    result.finalStatus,
    scenario.expected.finalStatus,
    `${scenario.id} final status drift`,
  );
};

export const assertCliSmokePostActionOutputFields = (
  result: CliSmokeScenarioResult,
): void => {
  for (const checkpoint of result.checkpoints) {
    assert.match(checkpoint.output, /State seq: \d+/u);
    assert.match(checkpoint.output, /Status: /u);
    assert.match(checkpoint.output, /Phase: /u);
    assert.match(checkpoint.output, /Pending decision: /u);
    assert.match(checkpoint.output, /Legal actions for /u);
    assert.match(checkpoint.output, /State hash: [a-f0-9]{64}/u);
  }
};
