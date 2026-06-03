import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import { AppRoot, AppRootContent } from "./AppRoot.js";

describe("client app root", () => {
  test("renders the dashboard at the root path", () => {
    const html = renderToStaticMarkup(
      createElement(AppRootContent, { path: "/" }),
    );

    assert.match(html, /Dashboard/u);
    assert.match(html, /Go to Play/u);
  });

  test("renders each shell route", () => {
    assert.match(
      renderToStaticMarkup(createElement(AppRootContent, { path: "/play" })),
      /Ranked Queue/u,
    );
    assert.match(
      renderToStaticMarkup(createElement(AppRootContent, { path: "/lobbies" })),
      /Create Custom Lobby/u,
    );
    assert.match(
      renderToStaticMarkup(createElement(AppRootContent, { path: "/decks" })),
      /Poneglyph deck builder/u,
    );
    assert.match(
      renderToStaticMarkup(createElement(AppRootContent, { path: "/profile" })),
      /Poneglyph account/u,
    );
  });

  test("renders not-found for unknown routes", () => {
    const html = renderToStaticMarkup(
      createElement(AppRootContent, { path: "/missing" }),
    );

    assert.match(html, /Page not found/u);
    assert.match(html, /\/missing/u);
  });

  test("delegates the match route without rendering shell dashboard", () => {
    const html = renderToStaticMarkup(
      createElement(AppRootContent, {
        matchSurface: createElement("div", { "data-testid": "match-surface" }),
        path: "/match?matchId=abc&seat=p1",
      }),
    );

    assert.match(html, /data-app-route="match"/u);
    assert.match(html, /data-testid="match-surface"/u);
    assert.doesNotMatch(html, /Dashboard/u);
  });

  test("delegates concrete lobby routes to the match surface", () => {
    const html = renderToStaticMarkup(
      createElement(AppRootContent, {
        matchSurface: createElement("div", { "data-testid": "lobby-surface" }),
        path: "/lobbies/dev-local-lobby-1",
      }),
    );

    assert.match(html, /data-app-route="match"/u);
    assert.match(html, /data-testid="lobby-surface"/u);
    assert.doesNotMatch(html, /Create Custom Lobby/u);
  });

  test("gates the routed app while account session is unresolved", () => {
    const html = renderToStaticMarkup(createElement(AppRoot, { path: "/" }));

    assert.match(html, /Checking session/u);
    assert.doesNotMatch(html, /Dashboard/u);
  });
});
