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

    assert.match(html, /Poneglyph Sim/u);
    assert.match(html, /Make Lobby/u);
    assert.match(html, /Private Lobby/u);
    assert.doesNotMatch(html, /Go to Play/u);
  });

  test("does not expose removed play and lobby shell routes", () => {
    assert.match(
      renderToStaticMarkup(createElement(AppRootContent, { path: "/play" })),
      /Page not found/u,
    );
    assert.match(
      renderToStaticMarkup(createElement(AppRootContent, { path: "/lobbies" })),
      /Page not found/u,
    );
  });

  test("does not expose removed temporary shell pages", () => {
    assert.match(
      renderToStaticMarkup(createElement(AppRootContent, { path: "/decks" })),
      /Page not found/u,
    );
    assert.match(
      renderToStaticMarkup(createElement(AppRootContent, { path: "/profile" })),
      /Page not found/u,
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
        path: "/lobbies/lobby-1",
      }),
    );

    assert.match(html, /data-app-route="match"/u);
    assert.match(html, /data-testid="lobby-surface"/u);
    assert.doesNotMatch(html, /Make Lobby/u);
  });

  test("delegates room code routes to the match surface", () => {
    const html = renderToStaticMarkup(
      createElement(AppRootContent, {
        matchSurface: createElement("div", { "data-testid": "room-surface" }),
        path: "/r/ab12",
      }),
    );

    assert.match(html, /data-app-route="match"/u);
    assert.match(html, /data-testid="room-surface"/u);
    assert.doesNotMatch(html, /Page not found/u);
  });

  test("delegates replay routes to the replay surface", () => {
    const html = renderToStaticMarkup(
      createElement(AppRootContent, { path: "/replays/match-1" }),
    );

    assert.match(html, /data-app-route="replay"/u);
    assert.match(html, /Replay Viewer/u);
    assert.doesNotMatch(html, /Make Lobby/u);
  });

  test("gates the routed app while account session is unresolved", () => {
    const html = renderToStaticMarkup(createElement(AppRoot, { path: "/" }));

    assert.match(html, /Checking session/u);
    assert.doesNotMatch(html, /Dashboard/u);
  });
});
