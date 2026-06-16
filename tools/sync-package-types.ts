import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Mode = "check" | "write";

interface SyncTarget {
  canonicalRelativePath: string;
  packageRelativePath: string;
}

const CONTRACTS_TYPES_DIR = path.join("contracts", "types");
const CANONICAL_INDEX_PATH = path.join("contracts", "canonical-types.ts");
const PACKAGE_TYPES_DIR = path.join("packages", "types", "src");
const PACKAGE_INDEX_PATH = path.join("packages", "types", "src", "index.ts");
const CANONICAL_PROJECTION_FILE_NAMES = [
  "primitives.ts",
  "card-metadata.ts",
  "events.ts",
  "view.ts",
  "game-state.ts",
  "effects.ts",
  "effect-continuous.ts",
  "effect-costs.ts",
  "effect-definition.ts",
  "effect-policies.ts",
  "effect-protection.ts",
  "effect-triggers.ts",
  "decisions.ts",
  "runtime.ts",
  "effect-presentation.ts",
  "support-certification.ts",
] as const;

async function main(): Promise<void> {
  const { mode, repoRoot } = parseArgs(process.argv.slice(2));
  const targets = buildTargets();
  const stalePaths: string[] = [];

  for (const target of targets) {
    const expected = await renderExpectedContent(repoRoot, target);
    const packageAbsolutePath = path.join(repoRoot, target.packageRelativePath);
    const actual = await readFile(packageAbsolutePath, "utf8").catch(
      (error: unknown) => {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOENT") {
          return null;
        }
        throw error;
      },
    );

    if (actual === expected) {
      continue;
    }

    stalePaths.push(toPosix(target.packageRelativePath));

    if (mode === "write") {
      await writeFile(packageAbsolutePath, expected, "utf8");
    }
  }

  if (mode === "check" && stalePaths.length > 0) {
    stalePaths.sort((left, right) => left.localeCompare(right));
    console.error("Detected stale package type outputs:");
    for (const stalePath of stalePaths) {
      console.error(stalePath);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `${mode === "write" ? "Synchronized" : "Checked"} ${String(targets.length)} package type files.`,
  );
}

function parseArgs(argv: string[]): { mode: Mode; repoRoot: string } {
  const modeArg = argv[0];
  if (modeArg !== "write" && modeArg !== "check") {
    throw new Error(
      'Expected mode argument "write" or "check". Example: sync-package-types.ts write --repo-root <path>',
    );
  }

  let repoRoot = process.cwd();
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) {
      throw new Error(`Missing argument at position ${String(index)}.`);
    }
    if (arg === "--repo-root") {
      const rootArg = argv[index + 1];
      if (!rootArg) {
        throw new Error("Missing value for --repo-root.");
      }
      repoRoot = path.resolve(rootArg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { mode: modeArg, repoRoot };
}

function buildTargets(): SyncTarget[] {
  const mappedFiles = CANONICAL_PROJECTION_FILE_NAMES.map((fileName) => ({
    canonicalRelativePath: path.join(CONTRACTS_TYPES_DIR, fileName),
    packageRelativePath: path.join(PACKAGE_TYPES_DIR, fileName),
  }));

  mappedFiles.push({
    canonicalRelativePath: CANONICAL_INDEX_PATH,
    packageRelativePath: PACKAGE_INDEX_PATH,
  });

  return mappedFiles;
}

async function renderExpectedContent(
  repoRoot: string,
  target: SyncTarget,
): Promise<string> {
  const source = await readFile(
    path.join(repoRoot, target.canonicalRelativePath),
    "utf8",
  );

  if (target.canonicalRelativePath === CANONICAL_INDEX_PATH) {
    return source.replaceAll(/"\.\/types\/([^"]+\.js)"/g, '"./$1"');
  }
  return source;
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
