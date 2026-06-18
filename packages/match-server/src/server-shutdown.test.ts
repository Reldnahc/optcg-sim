import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import { installMatchServerShutdownHandlers } from "./server-shutdown.js";

class FakeProcess {
  public exitCode: number | undefined;
  public readonly exitCalls: (string | number | null | undefined)[] = [];
  public stderrOutput = "";
  private readonly handlers = new Map<string, () => void>();

  public once(signal: string, handler: () => void): this {
    this.handlers.set(signal, handler);
    return this;
  }

  public exit(code?: string | number | null): void {
    this.exitCalls.push(code);
  }

  public readonly stderr = {
    write: (message: string): void => {
      this.stderrOutput += message;
    },
  };

  public emit(signal: string): void {
    this.handlers.get(signal)?.();
  }
}

const controlledPromise = (): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
} => {
  let resolvePromise: () => void = () => undefined;
  let rejectPromise: (error: Error) => void = () => undefined;
  return {
    promise: new Promise<void>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    }),
    resolve: resolvePromise,
    reject: rejectPromise,
  };
};

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe("match server shutdown handlers", () => {
  test("drains the server once for repeated shutdown signals", async () => {
    const close = controlledPromise();
    const fakeProcess = new FakeProcess();
    let closeCalls = 0;
    installMatchServerShutdownHandlers({
      server: {
        close: () => {
          closeCalls += 1;
          return close.promise;
        },
      },
      process: fakeProcess,
    });

    fakeProcess.emit("SIGTERM");
    fakeProcess.emit("SIGINT");

    assert.equal(closeCalls, 1);
    assert.equal(fakeProcess.exitCode, undefined);
    assert.deepEqual(fakeProcess.exitCalls, []);
    close.resolve();
    await close.promise;
    await delay(0);

    assert.equal(fakeProcess.exitCode, 0);
    assert.deepEqual(fakeProcess.exitCalls, [0]);
  });

  test("marks shutdown failed when graceful close rejects", async () => {
    const close = controlledPromise();
    const fakeProcess = new FakeProcess();
    installMatchServerShutdownHandlers({
      server: {
        close: () => close.promise,
      },
      process: fakeProcess,
    });

    fakeProcess.emit("SIGTERM");
    close.reject(new Error("close failed"));
    await close.promise.catch(() => undefined);
    await delay(0);

    assert.equal(fakeProcess.exitCode, 1);
    assert.deepEqual(fakeProcess.exitCalls, [1]);
    assert.match(fakeProcess.stderrOutput, /close failed/u);
  });

  test("exits failed when graceful close times out", async () => {
    const close = controlledPromise();
    const fakeProcess = new FakeProcess();
    let closeCalls = 0;
    installMatchServerShutdownHandlers({
      server: {
        close: () => {
          closeCalls += 1;
          return close.promise;
        },
      },
      process: fakeProcess,
      gracefulShutdownTimeoutMs: 1,
    });

    fakeProcess.emit("SIGTERM");
    await delay(5);

    assert.equal(closeCalls, 1);
    assert.equal(fakeProcess.exitCode, 1);
    assert.deepEqual(fakeProcess.exitCalls, [1]);
    assert.match(fakeProcess.stderrOutput, /Timed out/u);
  });
});
