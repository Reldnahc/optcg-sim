import { spawn, type ChildProcess } from "node:child_process";

interface DevProcess {
  name: string;
  args: readonly string[];
  env?: NodeJS.ProcessEnv;
}

const devProcesses: readonly DevProcess[] = [
  {
    name: "match-server",
    args: ["pnpm", "--filter", "@optcg/match-server", "dev"],
  },
  {
    name: "client",
    args: ["pnpm", "--filter", "@optcg/client", "dev"],
    env: {
      OPTCG_CLIENT_BASE: process.env["OPTCG_CLIENT_BASE"] ?? "/sim-runtime/",
    },
  },
];

const spawned: ChildProcess[] = [];
let shuttingDown = false;

const stopAll = (): void => {
  shuttingDown = true;
  for (const child of spawned) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
    }
  }
};

const startProcess = (processConfig: DevProcess): void => {
  const child = spawn("corepack", processConfig.args, {
    cwd: process.cwd(),
    env: { ...process.env, ...processConfig.env },
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  spawned.push(child);

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }
    const suffix =
      signal === null
        ? `with code ${String(code ?? 0)}`
        : `from signal ${signal}`;
    process.stderr.write(`${processConfig.name} exited ${suffix}\n`);
    stopAll();
    process.exitCode = code ?? 1;
  });

  child.on("error", (error) => {
    if (shuttingDown) {
      return;
    }
    process.stderr.write(
      `${processConfig.name} failed to start: ${error.message}\n`,
    );
    stopAll();
    process.exitCode = 1;
  });
};

for (const processConfig of devProcesses) {
  startProcess(processConfig);
}

process.once("SIGINT", () => {
  stopAll();
});

process.once("SIGTERM", () => {
  stopAll();
});
