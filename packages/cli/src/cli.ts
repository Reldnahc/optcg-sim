import { bootFixtureMatch } from "./boot.js";

export interface CliIo {
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
}

export const runCli = (
  args: readonly string[],
  io: CliIo = { stdout: process.stdout, stderr: process.stderr },
): number => {
  if (
    args.length === 0 ||
    (args.length === 1 && args[0] === "--boot-summary")
  ) {
    io.stdout.write(`${JSON.stringify(bootFixtureMatch().summary)}\n`);
    return 0;
  }

  io.stderr.write(`Unsupported CLI-001A argument: ${args.join(" ")}\n`);
  return 1;
};

if (process.argv[1]?.endsWith("cli.js") ?? false) {
  process.exitCode = runCli(process.argv.slice(2));
}
