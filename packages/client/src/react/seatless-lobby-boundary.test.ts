import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

const reactSourceDirectory = dirname(fileURLToPath(import.meta.url));
const clientSourceDirectory = join(reactSourceDirectory, "..");

describe("seatless custom lobby boundaries", () => {
  test("react lobby helpers do not use URL seat parameters for lobby joins", async () => {
    const files = [
      "useMatchClient-support.ts",
      "useMatchClient.ts",
      "use-match-session-actions.ts",
      "use-match-live-connections.ts",
    ] as const;

    for (const file of files) {
      const source = await readFile(join(reactSourceDirectory, file), "utf8");

      assert.doesNotMatch(source, /setLobbyLocation\([^)]*,/u, file);
      assert.doesNotMatch(source, /joinLocalLobby\(\{[^}]*playerId/u, file);
      assert.doesNotMatch(source, /lobbyIdFromUrl/u, file);
      assert.doesNotMatch(source, /searchParams\.get\("lobbyId"\)/u, file);
    }
  });

  test("client transport does not expose a lobby seat claim API", async () => {
    const transport = await readFile(
      join(clientSourceDirectory, "transport.ts"),
      "utf8",
    );
    const http = await readFile(
      join(clientSourceDirectory, "transport-http.ts"),
      "utf8",
    );

    assert.doesNotMatch(transport, /claimLobbySeat/u);
    assert.doesNotMatch(http, /\/api\/lobbies\/.*\/seats\//u);
  });
});
