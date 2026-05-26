import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const clientRoot = join(sourceDirectory, "..");

describe("client Vite dev proxy", () => {
  test("proxies match API websocket upgrades in dev", async () => {
    const config = await readFile(join(clientRoot, "vite.config.mjs"), "utf8");

    assert.equal(config.includes('"/api"'), true);
    assert.equal(config.includes("ws: true"), true);
  });
});
