import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

test("root contracts compile command validates canonical contract tsconfig", () => {
  const command = process.platform === "win32" ? "cmd.exe" : "corepack";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "corepack pnpm run contracts:compile"]
      : ["pnpm", "run", "contracts:compile"];
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.equal(
    result.status,
    0,
    `expected contracts compile command to pass\nerror:\n${result.error?.message ?? ""}\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`,
  );
});
