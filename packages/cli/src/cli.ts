import { bootFixtureMatch } from "./boot.js";
import { dispatchCliCommand } from "./commands.js";

export interface CliIo {
  stdin: AsyncIterable<string | Uint8Array>;
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
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

const writeOutput = (io: CliIo, output: string): void => {
  io.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
};

const dispatchCommands = (
  commands: readonly string[],
  io: CliIo,
  printInitialState: boolean,
): number => {
  let state = bootFixtureMatch().state;

  if (printInitialState) {
    writeOutput(io, dispatchCliCommand(state, "show").output);
  }

  for (const command of commands) {
    if (isExitCommand(command)) {
      return 0;
    }

    const result = dispatchCliCommand(state, command);
    state = result.state;
    writeOutput(io, result.output);

    if (isMatchComplete(state.status)) {
      return 0;
    }
  }

  return 0;
};

const readCommands = async (
  input: AsyncIterable<string | Uint8Array>,
): Promise<string[]> => {
  const chunks: string[] = [];
  for await (const chunk of input) {
    chunks.push(String(chunk));
  }
  return chunks
    .join("")
    .split(/\r?\n/u)
    .map((command) => command.trim())
    .filter((command) => command.length > 0);
};

export const runCli = async (
  args: readonly string[],
  io: CliIo = defaultIo(),
): Promise<number> => {
  if (
    args.length === 0 ||
    (args.length === 1 && args[0] === "--boot-summary")
  ) {
    io.stdout.write(`${JSON.stringify(bootFixtureMatch().summary)}\n`);
    return 0;
  }

  if (args.length >= 1 && args[0] === "--command-script") {
    const script = args[1];
    if (args.length !== 2 || script === undefined) {
      io.stderr.write("--command-script requires a command sequence.\n");
      return 1;
    }

    const commands = script
      .split(scriptCommandSeparatorPattern)
      .map((command) => command.trim())
      .filter((command) => command.length > 0);
    return dispatchCommands(commands, io, false);
  }

  if (args.length === 1 && args[0] === "--interactive") {
    const commands = await readCommands(io.stdin);
    return dispatchCommands(commands, io, true);
  }

  io.stderr.write(`Unsupported CLI argument: ${args.join(" ")}\n`);
  return 1;
};

const entrypoint = process.argv[1];

if (
  entrypoint !== undefined &&
  (entrypoint.endsWith("cli.js") || entrypoint.endsWith("cli.ts"))
) {
  process.exitCode = await runCli(process.argv.slice(2));
}
