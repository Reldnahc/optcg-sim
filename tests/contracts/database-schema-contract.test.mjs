import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const schemaPath = path.join(repoRoot, "contracts", "database-schema-v6.sql");
const canonicalTableNames = [
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
];

function minimalRequiredTable(name, columns) {
  return `CREATE TABLE ${name} (${columns});`;
}

function buildSchemaWithUsers(usersColumns) {
  return [
    minimalRequiredTable("users", usersColumns),
    minimalRequiredTable("auth_accounts", "id UUID PRIMARY KEY"),
    minimalRequiredTable("sessions", "id UUID PRIMARY KEY"),
    minimalRequiredTable("player_settings", "id UUID PRIMARY KEY"),
    minimalRequiredTable("decks", "id UUID PRIMARY KEY"),
    minimalRequiredTable("deck_cards", "id UUID PRIMARY KEY"),
    minimalRequiredTable("deck_don_cards", "id UUID PRIMARY KEY"),
    minimalRequiredTable("loadouts", "id UUID PRIMARY KEY"),
    minimalRequiredTable("matches", "id UUID PRIMARY KEY"),
    minimalRequiredTable("match_replays", "id UUID PRIMARY KEY"),
    minimalRequiredTable("match_rollbacks", "id UUID PRIMARY KEY"),
    minimalRequiredTable("ratings", "id UUID PRIMARY KEY"),
    minimalRequiredTable("rating_history", "id UUID PRIMARY KEY"),
    minimalRequiredTable("disconnect_discipline_events", "id UUID PRIMARY KEY"),
    minimalRequiredTable("friendships", "id UUID PRIMARY KEY"),
    minimalRequiredTable("reports", "id UUID PRIMARY KEY"),
    minimalRequiredTable("bans", "id UUID PRIMARY KEY"),
  ].join("\n");
}

function buildSchemaWithAuthAccounts(authAccountsColumns) {
  return [
    minimalRequiredTable("users", "id UUID PRIMARY KEY"),
    minimalRequiredTable("auth_accounts", authAccountsColumns),
    minimalRequiredTable("sessions", "id UUID PRIMARY KEY"),
    minimalRequiredTable("player_settings", "id UUID PRIMARY KEY"),
    minimalRequiredTable("decks", "id UUID PRIMARY KEY"),
    minimalRequiredTable("deck_cards", "id UUID PRIMARY KEY"),
    minimalRequiredTable("deck_don_cards", "id UUID PRIMARY KEY"),
    minimalRequiredTable("loadouts", "id UUID PRIMARY KEY"),
    minimalRequiredTable("matches", "id UUID PRIMARY KEY"),
    minimalRequiredTable("match_replays", "id UUID PRIMARY KEY"),
    minimalRequiredTable("match_rollbacks", "id UUID PRIMARY KEY"),
    minimalRequiredTable("ratings", "id UUID PRIMARY KEY"),
    minimalRequiredTable("rating_history", "id UUID PRIMARY KEY"),
    minimalRequiredTable("disconnect_discipline_events", "id UUID PRIMARY KEY"),
    minimalRequiredTable("friendships", "id UUID PRIMARY KEY"),
    minimalRequiredTable("reports", "id UUID PRIMARY KEY"),
    minimalRequiredTable("bans", "id UUID PRIMARY KEY"),
  ].join("\n");
}

function buildSchemaWithExtraStatement(extraStatement) {
  return `${buildSchemaWithUsers("id UUID PRIMARY KEY")}\n${extraStatement}`;
}

function runSchemaValidator(schemaFilePath) {
  return spawnSync(
    "node",
    [
      "--experimental-strip-types",
      "tools/validate-database-schema.ts",
      "--schema",
      schemaFilePath,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );
}

test("contracts:validate-db-schema passes for committed schema", () => {
  const command = process.platform === "win32" ? "cmd.exe" : "corepack";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "corepack pnpm run contracts:validate-db-schema"]
      : ["pnpm", "run", "contracts:validate-db-schema"];

  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.equal(
    result.status,
    0,
    `expected contracts:validate-db-schema to pass\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}\nerror:\n${result.error?.message ?? ""}`,
  );
});

test("database schema includes v6 DDL correction contracts", async () => {
  const schemaSql = await readFile(schemaPath, "utf8");

  assert.match(schemaSql, /token_hash\s+VARCHAR\(255\)\s+NOT\s+NULL\s+UNIQUE/i);
  assert.match(
    schemaSql,
    /variant_index\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+0/i,
  );
  assert.match(schemaSql, /variant_key\s+VARCHAR\(80\)\s+GENERATED\s+ALWAYS/i);
  assert.match(schemaSql, /UNIQUE\(deck_id,\s*card_id,\s*variant_key\)/i);
  assert.match(
    schemaSql,
    /CHECK\s*\(\s*initial_snapshot\s+IS\s+NOT\s+NULL\s+OR\s*\(\s*rng_seed_revealed\s+IS\s+NOT\s+NULL\s+AND\s+initial_deck_orders\s+IS\s+NOT\s+NULL\s*\)\s*\)/i,
  );
  assert.match(schemaSql, /deterministic_entries\s+JSONB\s+NOT\s+NULL/i);
  assert.match(
    schemaSql,
    /audit_entries\s+JSONB\s+NOT\s+NULL\s+DEFAULT\s+'\[\]'::jsonb/i,
  );
  assert.match(
    schemaSql,
    /CHECK\s*\(\s*jsonb_typeof\s*\(\s*deterministic_entries\s*\)\s*=\s*'array'\s*\)/i,
  );
  assert.match(
    schemaSql,
    /CHECK\s*\(\s*jsonb_typeof\s*\(\s*audit_entries\s*\)\s*=\s*'array'\s*\)/i,
  );
  assert.match(
    schemaSql,
    /CHECK\s*\(\s*jsonb_typeof\s*\(\s*checkpoints\s*\)\s*=\s*'array'\s*\)/i,
  );
  assert.match(schemaSql, /replay_display_artifact\s+JSONB/i);
  assert.doesNotMatch(
    schemaSql,
    /replay_display_artifact\s+JSONB\s+NOT\s+NULL/i,
  );
  assert.match(
    schemaSql,
    /CHECK\s*\(\s*replay_display_artifact\s+IS\s+NULL\s+OR\s+jsonb_typeof\s*\(\s*replay_display_artifact\s*\)\s*=\s*'object'\s*\)/i,
  );
  assert.doesNotMatch(schemaSql, /final_state\s+JSONB\s+NOT\s+NULL/i);
  assert.doesNotMatch(schemaSql, /WHERE\s+expires_at\s*>\s*now\(\)/i);
});

test("database schema includes every canonical table definition", async () => {
  const schemaSql = await readFile(schemaPath, "utf8");

  for (const tableName of canonicalTableNames) {
    assert.match(
      schemaSql,
      new RegExp(`\\bCREATE\\s+TABLE\\s+${tableName}\\b`, "i"),
      `expected canonical table ${tableName}`,
    );
  }
});

test("db schema validator fails on malformed SQL", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "optcg-schema-test-"));
  const brokenSchemaPath = path.join(tempDir, "broken-schema.sql");
  await writeFile(
    brokenSchemaPath,
    "CREATE TABLE users (id UUID PRIMARY KEY;\n",
    "utf8",
  );

  const result = runSchemaValidator(brokenSchemaPath);

  assert.notEqual(
    result.status,
    0,
    `expected malformed schema validation to fail\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`,
  );
});

test("db schema validator fails on balanced but invalid column constraint grammar", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "optcg-schema-test-"));
  const brokenSchemaPath = path.join(tempDir, "broken-balanced-schema.sql");
  await writeFile(
    brokenSchemaPath,
    buildSchemaWithUsers(
      "id UUID PRIMARY KEY display_name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()",
    ),
    "utf8",
  );

  const result = runSchemaValidator(brokenSchemaPath);

  assert.notEqual(
    result.status,
    0,
    `expected balanced invalid schema validation to fail\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`,
  );
});

test("db schema validator fails on bare DEFAULT expression", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "optcg-schema-test-"));
  const brokenSchemaPath = path.join(tempDir, "broken-default-schema.sql");
  await writeFile(
    brokenSchemaPath,
    buildSchemaWithUsers(
      "id UUID DEFAULT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()",
    ),
    "utf8",
  );

  const result = runSchemaValidator(brokenSchemaPath);

  assert.notEqual(
    result.status,
    0,
    `expected bare DEFAULT schema validation to fail\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`,
  );
});

test("db schema validator fails on bare REFERENCES target", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "optcg-schema-test-"));
  const brokenSchemaPath = path.join(tempDir, "broken-references-schema.sql");
  await writeFile(
    brokenSchemaPath,
    buildSchemaWithAuthAccounts(
      "id UUID PRIMARY KEY, user_id UUID REFERENCES, created_at TIMESTAMPTZ NOT NULL DEFAULT now()",
    ),
    "utf8",
  );

  const result = runSchemaValidator(brokenSchemaPath);

  assert.notEqual(
    result.status,
    0,
    `expected bare REFERENCES schema validation to fail\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`,
  );
});

test("db schema validator fails on malformed CREATE INDEX", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "optcg-schema-test-"));
  const brokenSchemaPath = path.join(tempDir, "broken-index-schema.sql");
  await writeFile(
    brokenSchemaPath,
    buildSchemaWithExtraStatement("CREATE INDEX idx_bad ON;"),
    "utf8",
  );

  const result = runSchemaValidator(brokenSchemaPath);

  assert.notEqual(
    result.status,
    0,
    `expected malformed CREATE INDEX validation to fail\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`,
  );
});

test("db schema validator fails on malformed table constraint", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "optcg-schema-test-"));
  const brokenSchemaPath = path.join(tempDir, "broken-constraint-schema.sql");
  await writeFile(
    brokenSchemaPath,
    buildSchemaWithUsers("id UUID PRIMARY KEY, CONSTRAINT bogus BOGUS"),
    "utf8",
  );

  const result = runSchemaValidator(brokenSchemaPath);

  assert.notEqual(
    result.status,
    0,
    `expected malformed table constraint validation to fail\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`,
  );
});

test("db schema validator fails on multi-column column REFERENCES target", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "optcg-schema-test-"));
  const brokenSchemaPath = path.join(
    tempDir,
    "broken-reference-columns-schema.sql",
  );
  await writeFile(
    brokenSchemaPath,
    buildSchemaWithAuthAccounts(
      "id UUID PRIMARY KEY, user_id UUID REFERENCES users(id, other)",
    ),
    "utf8",
  );

  const result = runSchemaValidator(brokenSchemaPath);

  assert.notEqual(
    result.status,
    0,
    `expected multi-column column REFERENCES validation to fail\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`,
  );
});
