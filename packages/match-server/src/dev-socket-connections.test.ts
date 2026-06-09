import { strict as assert } from "node:assert";
import { PassThrough } from "node:stream";
import { test } from "vitest";

import {
  registerConnectionLifecycle,
  type DevSocketBaseConnection,
} from "./dev-socket-connections.js";

const waitForCloseCleanup = async (
  readCleanupCount: () => number,
): Promise<void> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (readCleanupCount() > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

test("connection lifecycle consumes socket errors and cleans up through close", async () => {
  const socket = new PassThrough();
  const connection: DevSocketBaseConnection = {
    socket,
    serverSeq: 0,
    heartbeat: setInterval(() => undefined, 1_000),
    idleTimeout: setTimeout(() => undefined, 1_000),
  };
  connection.heartbeat?.unref();
  connection.idleTimeout?.unref();
  let cleanupCount = 0;

  registerConnectionLifecycle(connection, () => {
    cleanupCount += 1;
  });

  assert.doesNotThrow(() => {
    socket.emit("error", new Error("write EPIPE"));
  });
  await waitForCloseCleanup(() => cleanupCount);

  assert.equal(socket.destroyed, true);
  assert.equal(cleanupCount, 1);
  assert.equal(connection.heartbeat, undefined);
  assert.equal(connection.idleTimeout, undefined);

  socket.emit("close");
  assert.equal(cleanupCount, 1);
});
