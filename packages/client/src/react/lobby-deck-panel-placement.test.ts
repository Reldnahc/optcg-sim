import { readFile } from "node:fs/promises";
import { strict as assert } from "node:assert";
import { test } from "vitest";

test("lobby deck selection is hosted as a modal instead of the control rail or board surface", async () => {
  const [controlRailSource, matchAppSource, boardSurfaceSource] =
    await Promise.all([
      readFile(new URL("ControlRail.tsx", import.meta.url), "utf8"),
      readFile(new URL("MatchApp.tsx", import.meta.url), "utf8"),
      readFile(new URL("MatchBoardSurface.tsx", import.meta.url), "utf8"),
    ]);

  assert.doesNotMatch(controlRailSource, /LobbyDeckPanel/u);
  assert.doesNotMatch(matchAppSource, /lobbyDeckPanel=/u);
  assert.doesNotMatch(boardSurfaceSource, /lobbyDeckPanel/u);
  assert.match(matchAppSource, /<LobbyDeckPanel/u);
  assert.match(boardSurfaceSource, /isLobbyClientState\(clientState\)/u);
  assert.match(boardSurfaceSource, /PregameBoardFootprint/u);
  assert.match(boardSurfaceSource, /className="tabletop-board"/u);
  assert.doesNotMatch(boardSurfaceSource, /return null;/u);
});
