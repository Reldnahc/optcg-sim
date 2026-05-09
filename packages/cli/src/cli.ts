import type { GameState } from "@optcg/types";

import { bootFixtureMatch, bootLocalManifestFixtureMatch } from "./boot.js";
import type { BootFixtureMatchResult } from "./boot.js";
import {
  advanceCliCommandResultToActionPoint,
  dispatchCliCommand,
} from "./commands.js";
import type { DispatchCliCommandResult } from "./commands.js";

export interface CliIo {
  stdin: AsyncIterable<string | Uint8Array>;
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
}

export interface RunCliOptions {
  commandScriptInitialState?: GameState;
  onCommandScriptResult?: (entry: {
    command: string;
    result: DispatchCliCommandResult;
  }) => void;
}

interface ParsedManifestFixtureOption {
  manifestPath?: string;
  error?: string;
}

const defaultIo = (): CliIo => ({
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
});

const scriptCommandSeparatorPattern = /[\r\n;]+/u;

const isExitCommand = (input: string): boolean => {
  const command = input.trim();
  return command === "quit" || command === "exit";
};

const isMatchComplete = (
  status: ReturnType<typeof bootFixtureMatch>["state"]["status"],
): boolean => status.type === "completed" || status.type === "gameOver";

const parseManifestFixtureOption = (
  args: readonly string[],
): ParsedManifestFixtureOption => {
  const optionIndex = args.indexOf("--manifest-fixture");
  if (optionIndex === -1) {
    return {};
  }
  const manifestPath = args[optionIndex + 1];
  if (manifestPath === undefined || manifestPath.startsWith("--")) {
    return { error: "--manifest-fixture requires a path.\n" };
  }
  if (args.indexOf("--manifest-fixture", optionIndex + 1) !== -1) {
    return { error: "--manifest-fixture may only be provided once.\n" };
  }
  return { manifestPath };
};

const bootMatch = (manifestPath: string | undefined): BootFixtureMatchResult =>
  manifestPath === undefined
    ? bootFixtureMatch()
    : bootLocalManifestFixtureMatch({ manifestPath });

const writeOutput = (io: CliIo, output: string): void => {
  io.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
};

const dispatchCommands = (
  commands: readonly string[],
  io: CliIo,
  printInitialState: boolean,
  options: RunCliOptions,
  strict: boolean,
  manifestPath: string | undefined,
): number => {
  let state =
    options.commandScriptInitialState ?? bootMatch(manifestPath).state;

  if (printInitialState) {
    writeOutput(io, dispatchCliCommand(state, "show").output);
  }

  for (const command of commands) {
    if (isExitCommand(command)) {
      return 0;
    }

    const result = advanceCliCommandResultToActionPoint(
      dispatchCliCommand(state, command),
    );
    state = result.state;
    writeOutput(io, result.output);
    options.onCommandScriptResult?.({ command, result });

    if (strict && result.errors.length > 0) {
      io.stderr.write(
        [
          "Strict command-script failure:",
          `  command: ${command}`,
          ...result.errors.map((error) => `  error: ${error}`),
          "",
        ].join("\n"),
      );
      return 1;
    }

    if (isMatchComplete(state.status)) {
      return 0;
    }
  }

  return 0;
};

const dispatchInteractiveCommand = (
  state: ReturnType<typeof bootFixtureMatch>["state"],
  command: string,
  io: CliIo,
): { readonly done: boolean; readonly state: typeof state } => {
  const normalizedCommand = command.trim();
  if (normalizedCommand.length === 0) {
    return { done: false, state };
  }

  if (isExitCommand(normalizedCommand)) {
    return { done: true, state };
  }

  const result = advanceCliCommandResultToActionPoint(
    dispatchCliCommand(state, normalizedCommand),
  );
  writeOutput(io, result.output);

  return { done: isMatchComplete(result.state.status), state: result.state };
};

const dispatchInteractiveCommands = async (
  input: AsyncIterable<string | Uint8Array>,
  io: CliIo,
): Promise<number> => {
  let state = bootFixtureMatch().state;
  let pendingInput = "";
  const decoder = new TextDecoder();

  const decodeChunk = (chunk: string | Uint8Array): string => {
    if (typeof chunk === "string") {
      return `${decoder.decode()}${chunk}`;
    }

    return decoder.decode(chunk, { stream: true });
  };

  writeOutput(io, dispatchCliCommand(state, "show").output);

  for await (const chunk of input) {
    pendingInput += decodeChunk(chunk);

    let lineEnding = /\r?\n/u.exec(pendingInput);
    while (lineEnding !== null) {
      const line = pendingInput.slice(0, lineEnding.index);
      pendingInput = pendingInput.slice(
        lineEnding.index + lineEnding[0].length,
      );

      const result = dispatchInteractiveCommand(state, line, io);
      state = result.state;
      if (result.done) {
        return 0;
      }

      lineEnding = /\r?\n/u.exec(pendingInput);
    }
  }

  pendingInput += decoder.decode();
  dispatchInteractiveCommand(state, pendingInput, io);
  return 0;
};

export const runCli = async (
  args: readonly string[],
  io: CliIo = defaultIo(),
  options: RunCliOptions = {},
): Promise<number> => {
  const manifestFixture = parseManifestFixtureOption(args);
  if (manifestFixture.error !== undefined) {
    io.stderr.write(manifestFixture.error);
    return 1;
  }

  const argsWithoutManifestFixture =
    manifestFixture.manifestPath === undefined
      ? args
      : args.filter(
          (_arg, index) =>
            index !== args.indexOf("--manifest-fixture") &&
            index !== args.indexOf("--manifest-fixture") + 1,
        );

  if (
    argsWithoutManifestFixture.length === 0 ||
    (argsWithoutManifestFixture.length === 1 &&
      argsWithoutManifestFixture[0] === "--boot-summary")
  ) {
    try {
      io.stdout.write(
        `${JSON.stringify(bootMatch(manifestFixture.manifestPath).summary)}\n`,
      );
      return 0;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      io.stderr.write(`${message}\n`);
      return 1;
    }
  }

  if (
    argsWithoutManifestFixture.length >= 1 &&
    argsWithoutManifestFixture[0] === "--command-script"
  ) {
    const script = argsWithoutManifestFixture[1];
    const strict =
      argsWithoutManifestFixture.length === 3 &&
      argsWithoutManifestFixture[2] === "--strict";
    if (
      (argsWithoutManifestFixture.length !== 2 && !strict) ||
      script === undefined ||
      script === "--strict"
    ) {
      io.stderr.write("--command-script requires a command sequence.\n");
      return 1;
    }

    const commands = script
      .split(scriptCommandSeparatorPattern)
      .map((command) => command.trim())
      .filter((command) => command.length > 0);
    try {
      return dispatchCommands(
        commands,
        io,
        false,
        options,
        strict,
        manifestFixture.manifestPath,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      io.stderr.write(`${message}\n`);
      return 1;
    }
  }

  if (
    argsWithoutManifestFixture.length === 1 &&
    argsWithoutManifestFixture[0] === "--interactive"
  ) {
    return dispatchInteractiveCommands(io.stdin, io);
  }

  io.stderr.write(
    `Unsupported CLI argument: ${argsWithoutManifestFixture.join(" ")}\n`,
  );
  return 1;
};

const entrypoint = process.argv[1];

if (
  entrypoint !== undefined &&
  (entrypoint.endsWith("cli.js") || entrypoint.endsWith("cli.ts"))
) {
  process.exitCode = await runCli(process.argv.slice(2));
}
