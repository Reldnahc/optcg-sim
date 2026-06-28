import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const clientRoot = join(sourceDirectory, "..");

describe("client Vite dev proxy", () => {
  test("supports a local tunnel base path for client dev assets", async () => {
    const config = await readFile(join(clientRoot, "vite.config.mjs"), "utf8");

    assert.equal(config.includes("OPTCG_CLIENT_BASE"), true);
    assert.equal(config.includes('command === "serve"'), true);
    assert.equal(config.includes('"/sim-runtime/"'), true);
    assert.match(config, /base:\s*clientBase/u);
  });

  test("proxies match API websocket upgrades in dev", async () => {
    const config = await readFile(join(clientRoot, "vite.config.mjs"), "utf8");

    assert.equal(config.includes('"/api"'), true);
    assert.equal(config.includes("ws: true"), true);
  });

  test("suppresses expected aborted websocket proxy writes only", async () => {
    const config = await readFile(join(clientRoot, "vite.config.mjs"), "utf8");

    assert.match(config, /configure:\s*\(proxy\)\s*=>/u);
    assert.equal(config.includes('"ECONNABORTED"'), true);
    assert.equal(config.includes('"ECONNRESET"'), true);
    assert.match(config, /throw error/u);
  });
});
