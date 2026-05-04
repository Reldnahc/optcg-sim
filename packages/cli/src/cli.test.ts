import assert from "node:assert/strict";
import { test } from "vitest";

import { spawnSync } from "node:child_process";

test("boot summary command exits without entering an interactive loop", () => {
  const command =
    process.platform === "win32"
      ? (process.env["ComSpec"] ?? "cmd.exe")
      : "corepack";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "corepack pnpm --filter @optcg/cli boot:summary"]
      : ["pnpm", "--filter", "@optcg/cli", "boot:summary"];
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");

  const lines = result.stdout
    .trim()
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("{"));
  const summaryLine = lines.at(-1);
  assert.notEqual(summaryLine, undefined);
  if (summaryLine === undefined) {
    throw new TypeError("Missing CLI boot summary output.");
  }

  const parsed = JSON.parse(summaryLine) as {
    stateSeq?: unknown;
    phase?: unknown;
    status?: unknown;
    hasPendingDecision?: unknown;
    stateHash?: unknown;
  };
  assert.equal(parsed.stateSeq, 1);
  assert.equal(parsed.phase, "refresh");
  assert.equal(parsed.status, "setup");
  assert.equal(parsed.hasPendingDecision, true);
  assert.equal(typeof parsed.stateHash, "string");
});

test("runCli boot summary entry point returns without interactive input", async () => {
  const { runCli } = await import("./cli.js");
  let stdout = "";
  let stderr = "";

  const status = runCli(["--boot-summary"], {
    stdout: {
      write: (chunk: string | Uint8Array): boolean => {
        stdout += String(chunk);
        return true;
      },
    },
    stderr: {
      write: (chunk: string | Uint8Array): boolean => {
        stderr += String(chunk);
        return true;
      },
    },
  });

  assert.equal(status, 0);
  assert.equal(stderr, "");

  const parsed = JSON.parse(stdout.trim()) as {
    stateSeq?: unknown;
    phase?: unknown;
    status?: unknown;
    hasPendingDecision?: unknown;
    stateHash?: unknown;
  };
  assert.equal(parsed.stateSeq, 1);
  assert.equal(parsed.phase, "refresh");
  assert.equal(parsed.status, "setup");
  assert.equal(parsed.hasPendingDecision, true);
  assert.equal(typeof parsed.stateHash, "string");
});
