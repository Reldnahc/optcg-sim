import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

const shellFiles = [
  "AppRoot.tsx",
  "AppShell.tsx",
  "DashboardPage.tsx",
  "PlayPage.tsx",
  "LobbiesPage.tsx",
  "DecksPage.tsx",
  "ProfilePage.tsx",
  "NotFoundPage.tsx",
  "ShellPageCard.tsx",
  "app-route.ts",
] as const;

describe("client app shell boundaries", () => {
  test("shell files do not import server or engine modules", async () => {
    for (const file of shellFiles) {
      const source = await readFile(join(sourceDirectory, file), "utf8");

      assert.doesNotMatch(source, /@optcg\/engine-core/u, file);
      assert.doesNotMatch(source, /@optcg\/match-server/u, file);
      assert.doesNotMatch(source, /\.\.\/\.\.\/match-server/u, file);
      assert.doesNotMatch(source, /\.\.\/\.\.\/engine-core/u, file);
    }
  });

  test("only AppRoot imports the match board surface", async () => {
    for (const file of shellFiles.filter(
      (candidate) => candidate !== "AppRoot.tsx",
    )) {
      const source = await readFile(join(sourceDirectory, file), "utf8");

      assert.doesNotMatch(source, /MatchApp/u, file);
    }
  });
});
