import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import { AppShell } from "./AppShell.js";
import { DashboardPage } from "./DashboardPage.js";
import { NotFoundPage } from "./NotFoundPage.js";

describe("client app shell pages", () => {
  test("dashboard exposes the current primary actions", () => {
    const html = renderToStaticMarkup(
      createElement(AppShell, {
        children: createElement(DashboardPage),
      }),
    );

    assert.match(html, /Poneglyph Sim/u);
    assert.doesNotMatch(html, /aria-label="Primary"/u);
    assert.match(html, /Make Lobby/u);
    assert.match(html, /Deck editor/u);
    assert.match(
      html,
      /<a class="shell-card-action" href="https:\/\/poneglyph\.one\/decks" target="_blank" rel="noreferrer">Open Deck Editor<\/a>/u,
    );
    assert.doesNotMatch(html, /Ranked Queue/u);
    assert.doesNotMatch(html, /Unranked Queue/u);
    assert.doesNotMatch(html, /Profile/u);
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
