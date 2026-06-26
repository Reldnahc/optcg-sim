import { readFile } from "node:fs/promises";
import { strict as assert } from "node:assert";
import { test } from "vitest";

test("lobby deck selection is hosted inside the control rail", async () => {
  const [controlRailSource, matchAppSource, boardSurfaceSource] =
    await Promise.all([
      readFile(new URL("ControlRail.tsx", import.meta.url), "utf8"),
      readFile(new URL("MatchApp.tsx", import.meta.url), "utf8"),
      readFile(new URL("MatchBoardSurface.tsx", import.meta.url), "utf8"),
    ]);

  assert.match(controlRailSource, /pregameControl\?: ReactNode/u);
  assert.match(controlRailSource, /control-pregame-slot/u);
  assert.match(matchAppSource, /pregameControl=\{/u);
  assert.match(matchAppSource, /<LobbyDeckPanel/u);
  assert.doesNotMatch(matchAppSource, /lobby-deck-modal/u);
  assert.doesNotMatch(boardSurfaceSource, /lobbyDeckPanel|pregameControl/u);
  assert.match(boardSurfaceSource, /isLobbyClientState\(clientState\)/u);
  assert.match(
    boardSurfaceSource,
    /if \(board === undefined && isLobbyClientState\(clientState\)\) \{\s*return null;/u,
  );
});
