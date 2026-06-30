import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

const publishablePackagePaths = [
  "packages/types/package.json",
  "packages/engine-core/package.json",
  "packages/cards/package.json",
  "packages/card-support/package.json",
] as const;

describe("published card support package chain metadata", () => {
  it.each(publishablePackagePaths)("%s publishes dist artifacts", async (path) => {
    const manifest = JSON.parse(
      await readFile(join(repoRoot, path), "utf8"),
    ) as {
      private?: boolean;
      version?: string;
      types?: string;
      files?: readonly string[];
      scripts?: Record<string, string>;
      exports?: Record<string, { types?: string; import?: string }>;
    };

    expect(manifest.private).not.toBe(true);
    expect(manifest.version).toMatch(/^0\.[1-9]\d*\.\d+$/u);
    expect(manifest.types).toBe("./dist/index.d.ts");
    expect(manifest.files).toEqual(["dist"]);
    expect(manifest.scripts?.["prepublishOnly"]).toBe(
      "corepack pnpm exec tsc -p tsconfig.json",
    );
    expect(manifest.exports?.["."]?.types).toBe("./dist/index.d.ts");
    expect(manifest.exports?.["."]?.import).toBe("./dist/index.js");
  });
});
