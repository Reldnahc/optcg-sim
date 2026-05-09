import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import type * as PacketLifecycle from "./agent-packet-lifecycle.js";
import type * as Metadata from "./post-merge-cleanup/metadata.js";
import type * as Validator from "./post-merge-cleanup/validator.js";
import type { CleanupMetadata } from "./post-merge-cleanup/types.js";

const { findRepoRoot, resolveCliPath }: typeof PacketLifecycle = createRequire(
  import.meta.url,
)("./agent-packet-lifecycle.ts") as typeof PacketLifecycle;
const { parseCleanupMetadataBlock }: typeof Metadata = createRequire(
  import.meta.url,
)("./post-merge-cleanup/metadata.ts") as typeof Metadata;
const { buildCleanupDryRunPlan }: typeof Validator = createRequire(
  import.meta.url,
)("./post-merge-cleanup/validator.ts") as typeof Validator;

async function main() {
  const args = process.argv.slice(2);

  try {
    const repoRoot = findRepoRoot();
    const metadata = await parseMetadataInput(args);
    const plan = await buildCleanupDryRunPlan({
      metadata,
      repoRoot,
    });

    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

async function parseMetadataInput(args: string[]): Promise<CleanupMetadata> {
  let mode: CleanupMetadata["mode"] | null = null;
  const stories: string[] = [];
  const branches: string[] = [];
  let prBody: string | null = null;
  let prBodyFile: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === undefined) {
      throw new Error("Unexpected missing CLI token.");
    }

    if (token === "--") {
      continue;
    }

    if (token === "--mode") {
      const value = args[index + 1];
      if (value !== "single" && value !== "parent") {
        throw new Error("Expected --mode single|parent.");
      }
      mode = value;
      index += 1;
      continue;
    }

    if (token === "--story") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --story.");
      }
      stories.push(value);
      index += 1;
      continue;
    }

    if (token === "--branch") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --branch.");
      }
      branches.push(value);
      index += 1;
      continue;
    }

    if (token === "--pr-body") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --pr-body.");
      }
      prBody = value;
      index += 1;
      continue;
    }

    if (token === "--pr-body-file") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --pr-body-file.");
      }
      prBodyFile = resolveCliPath(value, process.cwd());
      index += 1;
      continue;
    }

    throw new Error(`Unexpected argument: ${token}`);
  }

  const hasCliMetadata =
    mode !== null || stories.length > 0 || branches.length > 0;
  const hasPrMetadata = prBody !== null || prBodyFile !== null;

  if (hasCliMetadata && hasPrMetadata) {
    throw new Error(
      "Ambiguous cleanup input: provide either PR metadata (--pr-body/--pr-body-file) or explicit CLI metadata (--mode/--story/--branch).",
    );
  }

  if (prBody !== null && prBodyFile !== null) {
    throw new Error(
      "Ambiguous cleanup input: provide only one PR body source.",
    );
  }

  if (prBodyFile !== null) {
    const source = await readFile(prBodyFile, "utf8");
    return parseCleanupMetadataBlock(source);
  }

  if (prBody !== null) {
    return parseCleanupMetadataBlock(prBody);
  }

  if (mode === null) {
    throw new Error("Missing cleanup input: provide --mode or PR metadata.");
  }

  return {
    branches,
    mode,
    stories,
  };
}

await main();
