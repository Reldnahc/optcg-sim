import { strict as assert } from "node:assert";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

const collectSourceFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(path)));
    } else if (
      entry.isFile() &&
      !path.endsWith(".test.ts") &&
      (path.endsWith(".ts") || path.endsWith(".tsx"))
    ) {
      files.push(path);
    }
  }
  return files;
};

describe("React client skin boundary", () => {
  test("render components do not own protocol or browser session storage", async () => {
    const files = await collectSourceFiles(sourceDirectory);

    for (const file of files) {
      const localPath = relative(sourceDirectory, file).replaceAll("\\", "/");
      if (
        localPath === "useMatchClient.ts" ||
        localPath === "browser-storage.ts"
      ) {
        continue;
      }
      const source = await readFile(file, "utf8");
      assert.equal(
        source.includes("fetch("),
        false,
        `${localPath} must not fetch`,
      );
      assert.equal(
        source.includes("sessionStorage") || source.includes("localStorage"),
        false,
        `${localPath} must not own browser storage`,
      );
      assert.equal(
        source.includes("createDevHttpMatchTransport"),
        false,
        `${localPath} must not construct transport`,
      );
    }
  });
});
