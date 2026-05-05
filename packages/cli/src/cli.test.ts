import assert from "node:assert/strict";
import { test } from "vitest";

import { spawnSync } from "node:child_process";
import { PassThrough, Readable } from "node:stream";
import {
  advanceDonPhase,
  advanceDrawPhase,
  advanceRefreshPhase,
  enterMainPhase,
  respondToMulliganDecision,
} from "@optcg/engine-core";
import type { GameState } from "@optcg/types";

import type { DispatchCliCommandResult } from "./commands.js";

const must = <T>(value: T | undefined, label: string): T => {
  assert.notEqual(value, undefined, `missing ${label}`);
  if (value === undefined) {
    throw new TypeError(`Missing ${label}.`);
  }
  return value;
};

const bootActiveFixtureMatch = async (): Promise<GameState> => {
  const { bootFixtureMatch } = await import("./boot.js");
  let state = bootFixtureMatch().state;
  for (const expectedPlayerId of ["p1", "p2"] as const) {
    const decision = state.pendingDecision;
    assert.equal(decision?.type, "mulligan");
    assert.equal(decision.playerId, expectedPlayerId);
    const result = respondToMulliganDecision(state, {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "mulligan", keep: true },
    });
    assert.equal(result.errors, undefined);
    state = result.state;
  }
  return state;
};

const bootMainPhaseFixtureMatch = async (): Promise<GameState> => {
  const active = await bootActiveFixtureMatch();
  const refresh = advanceRefreshPhase(active);
  assert.equal(refresh.errors, undefined);
  const draw = advanceDrawPhase(refresh.state);
  assert.equal(draw.errors, undefined);
  const don = advanceDonPhase(draw.state);
  assert.equal(don.errors, undefined);
  const main = enterMainPhase(don.state);
  assert.equal(main.errors, undefined);
  return main.state;
};

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
  assert.match(stdout.output(), /State seq: 7/u);
  assert.match(stdout.output(), /Status: active/u);
  assert.match(stdout.output(), /Phase: main/u);
  assert.match(stdout.output(), /Pending decision: none/u);
  assert.match(stdout.output(), /Legal actions for p1:/u);
  assert.match(stdout.output(), /State hash: [a-f0-9]+/u);
});

test("command-script mode advances completed mulligans to main phase action priority", async () => {
  const { runCli } = await import("./cli.js");
  const stdout = createWriter();
  const stderr = createWriter();
  const results: DispatchCliCommandResult[] = [];

  const status = await runCli(
    ["--command-script", "respond keep;respond keep"],
    {
      stdin: Readable.from([]),
      stdout: stdout.writer,
      stderr: stderr.writer,
    },
    {
      onCommandScriptResult: ({ result }) => {
        results.push(result);
      },
    },
  );

  assert.equal(status, 0);
  assert.equal(stderr.output(), "");
  assert.equal(results.length, 2);
  const final = must(results.at(-1), "final command result");
  assert.equal(final.state.status.type, "active");
  assert.equal(final.state.pendingDecision, undefined);
  assert.equal(final.state.turn.phase, "main");
  assert.equal(final.state.turn.turnPlayerId, "p1");
  assert.match(stdout.output(), /Phase: main/u);
  assert.match(stdout.output(), /Legal actions for p1:/u);
  assert.match(stdout.output(), /end-main-phase/u);
});

test("command-script pass advances to the next turn player's main phase action priority", async () => {
  const { runCli } = await import("./cli.js");
  const stdout = createWriter();
  const stderr = createWriter();
  const initialState = await bootMainPhaseFixtureMatch();
  const results: DispatchCliCommandResult[] = [];

  const status = await runCli(
    ["--command-script", "pass"],
    {
      stdin: Readable.from([]),
      stdout: stdout.writer,
      stderr: stderr.writer,
    },
    {
      commandScriptInitialState: initialState,
      onCommandScriptResult: ({ result }) => {
        results.push(result);
      },
    },
  );

  assert.equal(status, 0);
  assert.equal(stderr.output(), "");
  assert.equal(results.length, 1);
  const final = must(results[0], "pass command result");
  assert.equal(final.errors.length, 0);
  assert.equal(final.state.status.type, "active");
  assert.equal(final.state.pendingDecision, undefined);
  assert.equal(final.state.turn.turnPlayerId, "p2");
  assert.equal(final.state.turn.phase, "main");
  assert.match(stdout.output(), /Phase: main/u);
  assert.match(stdout.output(), /Legal actions for p2:/u);
  assert.match(stdout.output(), /end-main-phase/u);
});

test("command-script advancement stops at pending decisions without consuming later commands", async () => {
  const { runCli } = await import("./cli.js");
  const stdout = createWriter();
  const stderr = createWriter();
  const results: DispatchCliCommandResult[] = [];

  const status = await runCli(
    ["--command-script", "respond keep;hash"],
    {
      stdin: Readable.from([]),
      stdout: stdout.writer,
      stderr: stderr.writer,
    },
    {
      onCommandScriptResult: ({ result }) => {
        results.push(result);
      },
    },
  );

  assert.equal(status, 0);
  assert.equal(stderr.output(), "");
  assert.equal(results.length, 2);
  const first = must(results[0], "first command result");
  const second = must(results[1], "second command result");
  const decision = first.state.pendingDecision;
  assert.equal(decision?.type, "mulligan");
  assert.equal(decision.playerId, "p2");
  assert.equal(first.state.turn.phase, "refresh");
  assert.equal(second.state, first.state);
});

test("command-script mode stops dispatching commands after terminal status", async () => {
  const { runCli } = await import("./cli.js");
  const stdout = createWriter();
  const stderr = createWriter();
  const commands: string[] = [];

  const status = await runCli(
    ["--command-script", "concede;hash"],
    {
      stdin: Readable.from([]),
      stdout: stdout.writer,
      stderr: stderr.writer,
    },
    {
      onCommandScriptResult: ({ command }) => {
        commands.push(command);
      },
    },
  );

  assert.equal(status, 0);
  assert.equal(stderr.output(), "");
  assert.deepEqual(commands, ["concede"]);
  assert.match(stdout.output(), /Status: completed winner=p2/u);
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
  assert.match(stdout.output(), /State seq: 7/u);
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
