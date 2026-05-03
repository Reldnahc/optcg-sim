import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const require = createRequire(import.meta.url);

const readRepoFile = (relativePath) =>
  readFileSync(resolve(repoRoot, relativePath), "utf8");

describe("git hook smoke checks", () => {
  it("pre-commit targets staged files through lint-staged config mapping", () => {
    const preCommitHook = readRepoFile(".husky/pre-commit");
    const preCommitLines = preCommitHook
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    expect(preCommitLines).toEqual(["corepack pnpm exec lint-staged"]);

    const lintStagedConfig = require(
      resolve(repoRoot, "lint-staged.config.cjs"),
    );
    expect(lintStagedConfig).toEqual({
      "*.{js,mjs,cjs,ts,mts,cts}": [
        "corepack pnpm exec prettier --write",
        "corepack pnpm exec eslint --max-warnings=0",
      ],
      "*.{json,md,yml,yaml}": ["corepack pnpm exec prettier --write"],
    });
  });

  it("pre-push invokes the expected verification subset", () => {
    const prePushHook = readRepoFile(".husky/pre-push");
    const prePushLines = prePushHook
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    expect(prePushLines).toEqual([
      "corepack pnpm run lint",
      "corepack pnpm run typecheck",
      "corepack pnpm run test",
    ]);
  });
});
