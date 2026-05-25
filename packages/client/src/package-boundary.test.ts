import { strict as assert } from "node:assert";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

const forbiddenProductionImports = [
  "@optcg/engine-core",
  "@optcg/match-server",
  "@optcg/cards",
  "redis",
  "pg",
] as const;

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

const collectTypeScriptFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(path)));
    } else if (
      entry.isFile() &&
      path.endsWith(".ts") &&
      !path.endsWith(".test.ts")
    ) {
      files.push(path);
    }
  }
  return files;
};

describe("client package boundary", () => {
  test("production client code stays free of server-only package imports", async () => {
    const files = await collectTypeScriptFiles(sourceDirectory);

    for (const file of files) {
      const source = await readFile(file, "utf8");
      for (const forbiddenImport of forbiddenProductionImports) {
        assert.equal(
          source.includes(`"${forbiddenImport}"`) ||
            source.includes(`'${forbiddenImport}'`),
          false,
          `${file} must not import ${forbiddenImport}`,
        );
      }
    }
  });
});
