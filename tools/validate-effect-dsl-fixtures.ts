import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";

type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
interface JsonObject {
  [key: string]: JsonValue;
}

export type ValidationSummary = {
  schemaPath: string;
  validCount: number;
  invalidCount: number;
};

export async function loadJsonFile(filePath: string): Promise<JsonValue> {
  const source = await readFile(filePath, "utf8");
  return JSON.parse(source) as JsonValue;
}

export async function loadJsonObject(filePath: string): Promise<JsonObject> {
  const value = await loadJsonFile(filePath);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`expected ${filePath} to contain a JSON object`);
  }

  return value;
}

export async function listJsonFilesRecursive(
  rootDir: string,
): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listJsonFilesRecursive(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".json")) {
      results.push(entryPath);
    }
  }

  return results.sort();
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? [])
    .map((error) => {
      const location = error.instancePath.length > 0 ? error.instancePath : "/";
      return `${location} ${error.message ?? "failed schema validation"}`;
    })
    .join("\n- ");
}

export async function validateEffectDslFixtures(
  repoRoot: string,
): Promise<ValidationSummary> {
  const schemaPath = path.join(repoRoot, "contracts", "effect-dsl.schema.json");
  const validDir = path.join(repoRoot, "fixtures", "effect-dsl", "valid");
  const invalidDir = path.join(repoRoot, "fixtures", "effect-dsl", "invalid");

  const schema = await loadJsonObject(schemaPath);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  const validFixtures = await listJsonFilesRecursive(validDir);
  const invalidFixtures = await listJsonFilesRecursive(invalidDir);

  if (validFixtures.length === 0) {
    throw new Error(`no valid fixtures found under ${validDir}`);
  }

  if (invalidFixtures.length === 0) {
    throw new Error(`no invalid fixtures found under ${invalidDir}`);
  }

  const failures: string[] = [];

  for (const fixturePath of validFixtures) {
    const fixture = await loadJsonFile(fixturePath);
    const isValid = validate(fixture);
    if (!isValid) {
      failures.push(
        `expected valid fixture ${path.relative(repoRoot, fixturePath)} to pass, but got:\n- ${formatAjvErrors(validate.errors)}`,
      );
    }
  }

  for (const fixturePath of invalidFixtures) {
    const fixture = await loadJsonFile(fixturePath);
    const isValid = validate(fixture);
    if (isValid) {
      failures.push(
        `expected invalid fixture ${path.relative(repoRoot, fixturePath)} to fail, but it passed`,
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(failures.join("\n\n"));
  }

  return {
    schemaPath,
    validCount: validFixtures.length,
    invalidCount: invalidFixtures.length,
  };
}

async function runCli(): Promise<void> {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, "..");
  const summary = await validateEffectDslFixtures(repoRoot);
  process.stdout.write(
    `effect DSL fixtures validated (${String(summary.validCount)} valid, ${String(summary.invalidCount)} invalid) using ${path.relative(
      repoRoot,
      summary.schemaPath,
    )}\n`,
  );
}

const isEntrypoint = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isEntrypoint) {
  runCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`effect DSL fixture validation failed:\n${message}\n`);
    process.exitCode = 1;
  });
}
