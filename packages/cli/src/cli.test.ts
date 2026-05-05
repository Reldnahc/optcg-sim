import assert from "node:assert/strict";
import { test } from "vitest";

import { spawnSync } from "node:child_process";
import { PassThrough, Readable } from "node:stream";

const createWriter = (): {
  readonly output: () => string;
  readonly writer: { write: (chunk: string | Uint8Array) => boolean };
} => {
  let value = "";
  return {
    output: () => value,
    writer: {
      write: (chunk: string | Uint8Array): boolean => {
        value += String(chunk);
        return true;
      },
    },
  };
};

const waitForOutput = async (
  output: () => string,
  pattern: RegExp,
  timeoutMs = 250,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pattern.test(output())) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
  }
  assert.match(output(), pattern);
};

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
  const stdout = createWriter();
  const stderr = createWriter();

  const status = await runCli(["--boot-summary"], {
    stdin: Readable.from([]),
    stdout: stdout.writer,
    stderr: stderr.writer,
  });

  assert.equal(status, 0);
  assert.equal(stderr.output(), "");

  const parsed = JSON.parse(stdout.output().trim()) as {
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

test("command-script mode dispatches a deterministic command sequence", async () => {
  const { runCli } = await import("./cli.js");
  const stdout = createWriter();
  const stderr = createWriter();

  const status = await runCli(
    ["--command-script", "respond keep;respond keep;hash"],
    {
      stdin: Readable.from([]),
      stdout: stdout.writer,
      stderr: stderr.writer,
    },
  );

  assert.equal(status, 0);
  assert.equal(stderr.output(), "");
  assert.match(stdout.output(), /State seq: 2/u);
  assert.match(stdout.output(), /State seq: 3/u);
  assert.match(stdout.output(), /Status: active/u);
  assert.match(stdout.output(), /Phase: refresh/u);
  assert.match(stdout.output(), /Pending decision: none/u);
  assert.match(stdout.output(), /Legal actions for p1:/u);
  assert.match(stdout.output(), /State hash: [a-f0-9]+/u);
});

test("interactive mode accepts injected input and exits cleanly on EOF", async () => {
  const { runCli } = await import("./cli.js");
  const stdout = createWriter();
  const stderr = createWriter();

  const status = await runCli(["--interactive"], {
    stdin: Readable.from(["respond keep\n", "respond keep\n"]),
    stdout: stdout.writer,
    stderr: stderr.writer,
  });

  assert.equal(status, 0);
  assert.equal(stderr.output(), "");
  assert.match(stdout.output(), /State seq: 1/u);
  assert.match(stdout.output(), /State seq: 2/u);
  assert.match(stdout.output(), /State seq: 3/u);
  assert.match(stdout.output(), /State hash: [a-f0-9]+/u);
});

test("interactive mode decodes injected byte input before dispatching", async () => {
  const { runCli } = await import("./cli.js");
  const stdout = createWriter();
  const stderr = createWriter();

  const status = await runCli(["--interactive"], {
    stdin: Readable.from([new TextEncoder().encode("respond keep\nexit\n")]),
    stdout: stdout.writer,
    stderr: stderr.writer,
  });

  assert.equal(status, 0);
  assert.equal(stderr.output(), "");
  assert.match(stdout.output(), /State seq: 2/u);
});

test("interactive mode dispatches a complete line before EOF", async () => {
  const { runCli } = await import("./cli.js");
  const stdin = new PassThrough();
  const stdout = createWriter();
  const stderr = createWriter();

  const statusPromise = runCli(["--interactive"], {
    stdin,
    stdout: stdout.writer,
    stderr: stderr.writer,
  });

  stdin.write("respond keep\n");
  await waitForOutput(stdout.output, /State seq: 2/u);

  stdin.end("exit\n");

  assert.equal(await statusPromise, 0);
  assert.equal(stderr.output(), "");
});

test("unsupported CLI argument exits nonzero with a deterministic error", async () => {
  const { runCli } = await import("./cli.js");
  const stdout = createWriter();
  const stderr = createWriter();

  const status = await runCli(["--mystery"], {
    stdin: Readable.from([]),
    stdout: stdout.writer,
    stderr: stderr.writer,
  });

  assert.equal(status, 1);
  assert.equal(stdout.output(), "");
  assert.equal(stderr.output(), "Unsupported CLI argument: --mystery\n");
});
