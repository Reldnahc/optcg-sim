import { createRequire } from "node:module";
import path from "node:path";

import type * as PacketLifecycle from "./agent-packet-lifecycle.js";
import type * as PacketParser from "./agent-packet-parser.js";

type PacketLifecycleModule = typeof PacketLifecycle;
type PacketParserModule = typeof PacketParser;

const {
  findRepoRoot,
  resolveCliPath,
  runBuild,
  runComplete,
  runCompleteMany,
  runVerifyActive,
}: PacketLifecycleModule = createRequire(import.meta.url)(
  "./agent-packet-lifecycle.ts",
) as PacketLifecycleModule;

const { parseOptionMap, requireOption }: PacketParserModule = createRequire(
  import.meta.url,
)("./agent-packet-parser.ts") as PacketParserModule;

type BuildOptions = PacketLifecycle.BuildOptions;
type VerifyOptions = PacketLifecycle.VerifyOptions;
type CompleteOptions = PacketLifecycle.CompleteOptions;
type CompleteManyOptions = PacketLifecycle.CompleteManyOptions;

async function main() {
  const [command, ...args] = process.argv.slice(2);

  try {
    if (command === "generate" || command === "build") {
      await runBuild(parseBuildOptions(args));
      return;
    }

    if (command === "verify-active") {
      await runVerifyActive(parseVerifyOptions(args));
      return;
    }

    if (command === "complete") {
      await runComplete(parseCompleteOptions(args));
      return;
    }

    if (command === "complete-many") {
      await runCompleteMany(parseCompleteManyOptions(args));
      return;
    }

    throw new Error(
      "Usage:\n" +
        "  node --experimental-strip-types tools/build-agent-packet.ts generate --story <path> [--output <path>] [--manifest <path>] [--activate]\n" +
        "  node --experimental-strip-types tools/build-agent-packet.ts verify-active [--manifest <path>]\n" +
        "  node --experimental-strip-types tools/build-agent-packet.ts complete --story <path> [--manifest <path>]\n" +
        "  node --experimental-strip-types tools/build-agent-packet.ts complete-many --story <path> --story <path> [--manifest <path>]",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

function parseBuildOptions(args: string[]): BuildOptions {
  const repoRoot = findRepoRoot();
  const options = new Map<string, string>();
  let activate = false;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === undefined) {
      throw new Error("Unexpected missing CLI token.");
    }

    if (token === "--activate") {
      activate = true;
      continue;
    }

    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const value = args[index + 1];

    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${token}`);
    }

    options.set(token, value);
    index += 1;
  }

  const storyPath = resolveCliPath(
    requireOption(options, "--story"),
    process.cwd(),
  );
  const outputPath = resolveCliPath(
    options.get("--output") ?? path.join(repoRoot, "agent-packets", "AUTO.md"),
    process.cwd(),
  );
  const manifestPath = resolveCliPath(
    options.get("--manifest") ??
      path.join(repoRoot, "agent-packets", "active.json"),
    process.cwd(),
  );

  return {
    activate,
    manifestPath,
    outputPath,
    repoRoot,
    storyPath,
  };
}

function parseVerifyOptions(args: string[]): VerifyOptions {
  const repoRoot = findRepoRoot();
  const options = new Map<string, string>();

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === undefined) {
      throw new Error("Unexpected missing CLI token.");
    }

    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const value = args[index + 1];

    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${token}`);
    }

    options.set(token, value);
    index += 1;
  }

  return {
    manifestPath: resolveCliPath(
      options.get("--manifest") ??
        path.join(repoRoot, "agent-packets", "active.json"),
      process.cwd(),
    ),
    repoRoot,
  };
}

function parseCompleteOptions(args: string[]): CompleteOptions {
  const repoRoot = findRepoRoot();
  const options = parseOptionMap(args);

  return {
    manifestPath: resolveCliPath(
      options.get("--manifest") ??
        path.join(repoRoot, "agent-packets", "active.json"),
      process.cwd(),
    ),
    repoRoot,
    storyPath: resolveCliPath(requireOption(options, "--story"), process.cwd()),
  };
}

function parseCompleteManyOptions(args: string[]): CompleteManyOptions {
  const repoRoot = findRepoRoot();
  const storyPaths: string[] = [];
  let manifestPath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === undefined) {
      throw new Error("Unexpected missing CLI token.");
    }

    if (token === "--story") {
      const storyArg = args[index + 1];

      if (!storyArg || storyArg.startsWith("--")) {
        throw new Error("Missing value for --story");
      }

      storyPaths.push(resolveCliPath(storyArg, process.cwd()));
      index += 1;
      continue;
    }

    if (token === "--manifest") {
      const manifestArg = args[index + 1];

      if (!manifestArg || manifestArg.startsWith("--")) {
        throw new Error("Missing value for --manifest");
      }

      manifestPath = resolveCliPath(manifestArg, process.cwd());
      index += 1;
      continue;
    }

    if (token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    throw new Error(`Unexpected argument: ${token}`);
  }

  if (storyPaths.length === 0) {
    throw new Error("Missing required option --story");
  }

  return {
    manifestPath:
      manifestPath ?? path.join(repoRoot, "agent-packets", "active.json"),
    repoRoot,
    storyPaths,
  };
}

await main();
