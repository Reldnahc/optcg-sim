import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "pgsql-ast-parser";

const requiredTables = [
  "users",
  "auth_accounts",
  "sessions",
  "player_settings",
  "decks",
  "deck_cards",
  "deck_don_cards",
  "loadouts",
  "matches",
  "match_replays",
  "match_rollbacks",
  "ratings",
  "rating_history",
  "disconnect_discipline_events",
  "friendships",
  "reports",
  "bans",
] as const;

type ParsedStatement = ReturnType<typeof parse>[number];

function assertRequiredTables(statements: ParsedStatement[]): void {
  const createTableNames = new Set(
    statements
      .filter((statement) => statement.type === "create table")
      .map((statement) => statement.name.name.toLowerCase()),
  );

  for (const tableName of requiredTables) {
    if (!createTableNames.has(tableName)) {
      throw new Error(`missing required table definition: ${tableName}`);
    }
  }
}

function assertNoColumnReferencesMultiColumnTargets(
  statements: ParsedStatement[],
): void {
  for (const statement of statements) {
    if (statement.type !== "create table") {
      continue;
    }

    for (const entry of statement.columns) {
      if (entry.kind !== "column") {
        continue;
      }

      for (const constraint of entry.constraints ?? []) {
        if (
          constraint.type === "reference" &&
          constraint.foreignColumns.length > 1
        ) {
          throw new Error(
            `column ${entry.name.name} references multiple columns; use a table-level FOREIGN KEY for composite references`,
          );
        }
      }
    }
  }
}

export async function validateDatabaseSchemaFile(
  schemaPath: string,
): Promise<void> {
  const schemaSql = await readFile(schemaPath, "utf8");
  const statements = parse(schemaSql);
  assertRequiredTables(statements);
  assertNoColumnReferencesMultiColumnTargets(statements);
}

function parseSchemaPathFromCliArgs(repoRoot: string): string {
  const schemaFlagIndex = process.argv.findIndex((arg) => arg === "--schema");
  if (schemaFlagIndex >= 0) {
    const value = process.argv[schemaFlagIndex + 1];
    if (!value) {
      throw new Error("missing value for --schema");
    }

    return path.resolve(value);
  }

  return path.join(repoRoot, "contracts", "database-schema-v6.sql");
}

async function runCli(): Promise<void> {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, "..");
  const schemaPath = parseSchemaPathFromCliArgs(repoRoot);
  await validateDatabaseSchemaFile(schemaPath);
  process.stdout.write(
    `database schema validated: ${path.relative(repoRoot, schemaPath)}\n`,
  );
}

const isEntrypoint = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isEntrypoint) {
  runCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`database schema validation failed:\n${message}\n`);
    process.exitCode = 1;
  });
}
