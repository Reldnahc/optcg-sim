import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import { AppRoot } from "./AppRoot.js";

describe("client app root", () => {
  test("renders the dashboard at the root path", () => {
    const html = renderToStaticMarkup(createElement(AppRoot, { path: "/" }));

    assert.match(html, /Dashboard/u);
    assert.match(html, /Go to Play/u);
  });

  test("renders each shell route", () => {
    assert.match(
      renderToStaticMarkup(createElement(AppRoot, { path: "/play" })),
      /Ranked Queue/u,
    );
    assert.match(
      renderToStaticMarkup(createElement(AppRoot, { path: "/lobbies" })),
      /Create Custom Lobby/u,
    );
    assert.match(
      renderToStaticMarkup(createElement(AppRoot, { path: "/decks" })),
      /Poneglyph deck builder/u,
    );
    assert.match(
      renderToStaticMarkup(createElement(AppRoot, { path: "/profile" })),
      /Poneglyph account/u,
    );
  });

  test("renders not-found for unknown routes", () => {
    const html = renderToStaticMarkup(
      createElement(AppRoot, { path: "/missing" }),
    );

    assert.match(html, /Page not found/u);
    assert.match(html, /\/missing/u);
  });

  test("delegates the match route without rendering shell dashboard", () => {
    const html = renderToStaticMarkup(
      createElement(AppRoot, {
        matchSurface: createElement("div", { "data-testid": "match-surface" }),
        path: "/match?matchId=abc&seat=p1",
      }),
    );

    assert.match(html, /data-app-route="match"/u);
    assert.match(html, /data-testid="match-surface"/u);
    assert.doesNotMatch(html, /Dashboard/u);
  });
});
