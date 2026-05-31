import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import { AppShell } from "./AppShell.js";
import { DashboardPage } from "./DashboardPage.js";
import { DecksPage } from "./DecksPage.js";
import { LobbiesPage } from "./LobbiesPage.js";
import { NotFoundPage } from "./NotFoundPage.js";
import { PlayPage } from "./PlayPage.js";
import { ProfilePage } from "./ProfilePage.js";

describe("client app shell pages", () => {
  test("dashboard exposes the primary navigation entries", () => {
    const html = renderToStaticMarkup(
      createElement(
        AppShell,
        { activeRouteId: "dashboard" },
        createElement(DashboardPage),
      ),
    );

    assert.match(html, /Play/u);
    assert.match(html, /Custom Lobbies/u);
    assert.match(html, /Decks/u);
    assert.match(html, /Profile/u);
  });

  test("play page keeps future-service queue states separate from dev play", () => {
    const html = renderToStaticMarkup(
      createElement(
        AppShell,
        { activeRouteId: "play" },
        createElement(PlayPage),
      ),
    );

    assert.match(html, /Ranked Queue/u);
    assert.match(html, /Unranked Queue/u);
    assert.match(html, /Dev Match/u);
  });

  test("lobbies page exposes current custom lobby entry", () => {
    const html = renderToStaticMarkup(
      createElement(
        AppShell,
        { activeRouteId: "lobbies" },
        createElement(LobbiesPage),
      ),
    );

    assert.match(html, /Create Custom Lobby/u);
    assert.match(html, /Join Custom Lobby/u);
  });

  test("deck and profile pages describe future integrations honestly", () => {
    const deckHtml = renderToStaticMarkup(
      createElement(
        AppShell,
        { activeRouteId: "decks" },
        createElement(DecksPage),
      ),
    );
    const profileHtml = renderToStaticMarkup(
      createElement(
        AppShell,
        { activeRouteId: "profile" },
        createElement(ProfilePage),
      ),
    );

    assert.match(deckHtml, /Poneglyph deck builder/u);
    assert.match(profileHtml, /Poneglyph account/u);
  });

  test("not-found page links back to the dashboard", () => {
    const html = renderToStaticMarkup(
      createElement(
        AppShell,
        { activeRouteId: "notFound" },
        createElement(NotFoundPage, { path: "/missing" }),
      ),
    );

    assert.match(html, /Page not found/u);
    assert.match(html, /href="\//u);
  });
});
