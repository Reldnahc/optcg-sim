import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const require = createRequire(import.meta.url);
const tscEntry = require.resolve("typescript/bin/tsc");

test("canonical contract compiles with contracts tsconfig", () => {
  const result = spawnSync(
    process.execPath,
    [tscEntry, "-p", "contracts/tsconfig.json", "--noEmit"],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  assert.equal(
    result.status,
    0,
    `expected contracts compile to pass\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`,
  );
});
