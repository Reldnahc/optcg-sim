import process from "node:process";

type ShutdownSignal = "SIGTERM" | "SIGINT";
type ShutdownResult =
  | "closed"
  | "timedOut"
  | { readonly type: "failed"; readonly error: unknown };

const defaultGracefulShutdownTimeoutMs = 25_000;

interface MatchServerShutdownTarget {
  readonly close: () => Promise<void>;
}

interface ShutdownProcess {
  exitCode?: string | number | null | undefined;
  exit?: (code?: string | number | null) => never | void;
  once: (signal: ShutdownSignal, handler: () => void) => unknown;
  stderr?: {
    write: (message: string) => unknown;
  };
}

export const installMatchServerShutdownHandlers = ({
  server,
  process: processLike = process,
  gracefulShutdownTimeoutMs = defaultGracefulShutdownTimeoutMs,
}: {
  readonly server: MatchServerShutdownTarget;
  readonly process?: ShutdownProcess;
  readonly gracefulShutdownTimeoutMs?: number;
}): void => {
  let shutdownPromise: Promise<void> | undefined;
  const exitProcess = (code: 0 | 1): void => {
    processLike.exitCode = code;
    processLike.exit?.(code);
  };
  const closeWithTimeout = async (): Promise<ShutdownResult> => {
    const closeAttempt = (async (): Promise<ShutdownResult> => {
      try {
        await server.close();
        return "closed";
      } catch (error: unknown) {
        return { type: "failed", error };
      }
    })();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutAttempt = new Promise<ShutdownResult>((resolve) => {
      timeout = setTimeout(() => {
        resolve("timedOut");
      }, gracefulShutdownTimeoutMs);
    });
    const result = await Promise.race([closeAttempt, timeoutAttempt]);
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    return result;
  };
  const shutdown = (signal: ShutdownSignal): void => {
    shutdownPromise ??= (async () => {
      const result = await closeWithTimeout();
      if (result === "closed") {
        exitProcess(0);
        return;
      }
      if (result === "timedOut") {
        processLike.stderr?.write(
          `Timed out closing match server after ${signal}.\n`,
        );
        exitProcess(1);
        return;
      }
      processLike.stderr?.write(
        `Failed to close match server after ${signal}: ${
          result.error instanceof Error
            ? result.error.message
            : String(result.error)
        }\n`,
      );
      exitProcess(1);
    })();
  };

  processLike.once("SIGTERM", () => {
    shutdown("SIGTERM");
  });
  processLike.once("SIGINT", () => {
    shutdown("SIGINT");
  });
};
