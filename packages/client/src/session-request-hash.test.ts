import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import { requestHash } from "./session-request-hash.js";

describe("browser session request hashing", () => {
  test("hashes requests without WebCrypto subtle support", async () => {
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {},
    });
    try {
      assert.equal(
        await requestHash({
          type: "submitAction",
          playerId: "p1",
          actionIndex: 3,
          expectedStateSeq: 8,
        }),
        "c72a1f5177a395b2b2af698256e5763a5f634751ed1906c00b846a89634dbd15",
      );
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: originalCrypto,
      });
    }
  });
});
