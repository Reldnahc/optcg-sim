import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import { DashboardPageView } from "./DashboardPage.js";

test("private lobby creation can disable the match timer", () => {
  const html = renderToStaticMarkup(
    createElement(DashboardPageView, {
      mode: "privateLobby",
      formats: [],
      formatsStatus: "ready",
      selectedFormatName: "Anything Goes",
      loadouts: [],
      loadoutsStatus: "idle",
      selectedLoadoutId: "",
      privateLobbyTimerDisabled: true,
      onSelectMode: () => undefined,
      onSelectFormat: () => undefined,
      onSelectLoadout: () => undefined,
      onRefreshLoadouts: () => undefined,
      onSetPrivateLobbyTimerDisabled: () => undefined,
    }),
  );

  assert.match(html, /type="checkbox"[^>]*checked=""/u);
  assert.equal(html.includes("Disable timer"), true);
  assert.match(
    html,
    /href="\/match\?lobbyFormat=sandbox-open&amp;timerDisabled=1"/u,
  );
});
