import { readFile } from "node:fs/promises";
import { strict as assert } from "node:assert";
import { test } from "vitest";

test("lobby deck selection is hosted by the center match surface instead of the control rail", async () => {
  const [controlRailSource, matchAppSource] = await Promise.all([
    readFile(new URL("ControlRail.tsx", import.meta.url), "utf8"),
    readFile(new URL("MatchApp.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(controlRailSource, /LobbyDeckPanel/u);
  assert.match(matchAppSource, /<MatchBoardSurface[\s\S]*lobbyDeckPanel=/u);
});
