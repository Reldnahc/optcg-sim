import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import { AppShell } from "./AppShell.js";
import { DashboardPage } from "./DashboardPage.js";
import { LobbiesPage } from "./LobbiesPage.js";
import { NotFoundPage } from "./NotFoundPage.js";
import { PlayPage } from "./PlayPage.js";

describe("client app shell pages", () => {
  test("dashboard exposes the primary navigation entries", () => {
    const html = renderToStaticMarkup(
      createElement(AppShell, {
        children: createElement(DashboardPage),
      }),
    );

    assert.doesNotMatch(html, /Poneglyph Sim/u);
    assert.doesNotMatch(html, /aria-label="Primary"/u);
    assert.match(html, /Play/u);
    assert.match(html, /Custom Lobbies/u);
    assert.match(html, /Deck editor/u);
    assert.match(
      html,
      /<a class="shell-card-action" href="https:\/\/poneglyph\.one\/decks" target="_blank" rel="noreferrer">Open Deck Editor<\/a>/u,
    );
    assert.doesNotMatch(html, /Profile/u);
  });

  test("play page keeps future-service queue states separate from dev play", () => {
    const html = renderToStaticMarkup(
      createElement(AppShell, {
        children: createElement(PlayPage),
      }),
    );

    assert.match(html, /Ranked Queue/u);
    assert.match(html, /Unranked Queue/u);
    assert.match(html, /Dev Match/u);
  });

  test("lobbies page exposes current custom lobby entry", () => {
    const html = renderToStaticMarkup(
      createElement(AppShell, {
        children: createElement(LobbiesPage),
      }),
    );

    assert.match(html, /Create Custom Lobby/u);
    assert.match(html, /Join Custom Lobby/u);
    assert.match(html, /server assigns seats/u);
    assert.doesNotMatch(html, /seat query/u);
  });

  test("not-found page links back to the dashboard", () => {
    const html = renderToStaticMarkup(
      createElement(AppShell, {
        children: createElement(NotFoundPage, { path: "/missing" }),
      }),
    );

    assert.match(html, /Page not found/u);
    assert.match(html, /href="\//u);
  });
});
