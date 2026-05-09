import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import type * as PacketLifecycle from "./agent-packet-lifecycle.js";
import type * as Metadata from "./post-merge-cleanup/metadata.js";
import type * as Validator from "./post-merge-cleanup/validator.js";
import type {
  CleanupEvidenceInput,
  CleanupMetadata,
} from "./post-merge-cleanup/types.js";

const { findRepoRoot, resolveCliPath, sha256 }: typeof PacketLifecycle =
  createRequire(import.meta.url)(
    "./agent-packet-lifecycle.ts",
  ) as typeof PacketLifecycle;
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
    const evidence = await parseEvidenceInput(args);
    const metadataInput = await parseMetadataInput(args, evidence);
    const trustedMainSha = readTrustedHeadSha(repoRoot);
    const plan = await buildCleanupDryRunPlan({
      evidence,
      metadata: metadataInput.metadata,
      metadataSourceRef: metadataInput.metadataSourceRef,
      repoRoot,
      trustedMainSha,
    });

    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

async function parseMetadataInput(
  args: string[],
  evidence: CleanupEvidenceInput,
): Promise<{ metadata: CleanupMetadata; metadataSourceRef: string }> {
  let prBody: string | null = null;
  let prBodyFile: string | null = null;
  let metadataSource: string | null = null;
  let metadataSourceFile: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === undefined) {
      throw new Error("Unexpected missing CLI token.");
    }

    if (token === "--") {
      continue;
    }

    if (token === "--evidence-json" || token === "--evidence-json-file") {
      index += 1;
      continue;
    }

    if (token === "--mode" || token === "--story" || token === "--branch") {
      throw new Error(
        "Cleanup metadata must be read from a reviewed PR body or durable handoff comment source.",
      );
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

    if (token === "--metadata-source") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --metadata-source.");
      }
      metadataSource = value;
      index += 1;
      continue;
    }

    if (token === "--metadata-source-file") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --metadata-source-file.");
      }
      metadataSourceFile = resolveCliPath(value, process.cwd());
      index += 1;
      continue;
    }

    throw new Error(`Unexpected argument: ${token}`);
  }

  const inlineSources = [prBody, metadataSource].filter(
    (source) => source !== null,
  );
  const fileSources = [prBodyFile, metadataSourceFile].filter(
    (source) => source !== null,
  );

  if (inlineSources.length + fileSources.length !== 1) {
    throw new Error(
      "Missing or ambiguous cleanup metadata source: provide exactly one reviewed PR body or durable handoff comment source.",
    );
  }

  const sourceFile = prBodyFile ?? metadataSourceFile;
  const source =
    sourceFile !== null
      ? await readFile(sourceFile, "utf8")
      : (prBody ?? metadataSource ?? "");
  const sourceSha256 = sha256(source);
  if (sourceSha256 !== evidence.metadataSource.contentSha256) {
    throw new Error(
      "Cleanup metadata source content does not match reviewed PR evidence.",
    );
  }
  return {
    metadata: parseCleanupMetadataBlock(source),
    metadataSourceRef: buildSourceRef(evidence),
  };
}

async function parseEvidenceInput(
  args: string[],
): Promise<CleanupEvidenceInput> {
  let evidenceJson: string | null = null;
  let evidenceJsonFile: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === "--evidence-json") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --evidence-json.");
      }
      evidenceJson = value;
      index += 1;
      continue;
    }

    if (token === "--evidence-json-file") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --evidence-json-file.");
      }
      evidenceJsonFile = resolveCliPath(value, process.cwd());
      index += 1;
      continue;
    }
  }

  if (evidenceJson !== null && evidenceJsonFile !== null) {
    throw new Error(
      "Ambiguous evidence input: provide only one of --evidence-json or --evidence-json-file.",
    );
  }

  if (evidenceJson === null && evidenceJsonFile === null) {
    throw new Error(
      "Missing required PR evidence input: provide --evidence-json or --evidence-json-file.",
    );
  }

  const source =
    evidenceJsonFile !== null
      ? await readFile(evidenceJsonFile, "utf8")
      : (evidenceJson ?? "");

  try {
    return JSON.parse(source) as CleanupEvidenceInput;
  } catch (error) {
    throw new Error(
      `Malformed evidence JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function buildSourceRef(evidence: CleanupEvidenceInput) {
  return `${evidence.metadataSource.kind}:${evidence.metadataSource.sourceId}:${evidence.metadataSource.contentSha256}`;
}

function readTrustedHeadSha(repoRoot: string) {
  return execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
}

await main();
