import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import {
  appRouteFromPath,
  appRoutePath,
  appRoutes,
  isShellRoute,
} from "./app-route.js";

describe("client app routes", () => {
  test("maps public shell paths to route ids", () => {
    assert.equal(appRouteFromPath("/").id, "dashboard");
    assert.equal(appRouteFromPath("/play").id, "notFound");
    assert.equal(appRouteFromPath("/lobbies").id, "notFound");
    assert.equal(appRouteFromPath("/decks").id, "notFound");
    assert.equal(appRouteFromPath("/profile").id, "notFound");
    assert.equal(appRouteFromPath("/match").id, "match");
    assert.equal(appRouteFromPath("/replays").id, "replayList");
  });

  test("maps concrete lobby URLs to the lobbies route", () => {
    const route = appRouteFromPath("/lobbies/lobby-1");

    assert.equal(route.id, "lobbies");
    assert.equal(route.path, "/lobbies/lobby-1");
  });

  test("maps room code URLs to the lobbies route", () => {
    const route = appRouteFromPath("/r/ab12");

    assert.equal(route.id, "lobbies");
    assert.equal(route.path, "/r/ab12");
  });

  test("maps replay URLs to the replay route", () => {
    const route = appRouteFromPath("/replays/match-1");

    assert.equal(route.id, "replay");
    assert.equal(route.path, "/replays/match-1");
  });

  test("preserves query strings for the match route", () => {
    const route = appRouteFromPath("/match?matchId=abc&seat=p2");

    assert.equal(route.id, "match");
    assert.equal(route.search, "?matchId=abc&seat=p2");
  });

  test("maps configured base-prefixed routes to route ids", () => {
    const route = appRouteFromPath(
      "/sim-runtime/match?lobbyFormat=sandbox-open",
      "/sim-runtime/",
    );

    assert.equal(route.id, "match");
    assert.equal(route.path, "/match");
    assert.equal(route.search, "?lobbyFormat=sandbox-open");
  });

  test("preserves existing root match links with match query params only", () => {
    assert.equal(appRouteFromPath("/?matchId=abc&seat=p1").id, "match");
    assert.equal(appRouteFromPath("/?lobbyId=abc&seat=p2").id, "dashboard");
  });

  test("returns notFound for unknown paths", () => {
    const route = appRouteFromPath("/missing");

    assert.equal(route.id, "notFound");
    assert.equal(route.path, "/missing");
  });

  test("builds canonical app paths", () => {
    assert.equal(appRoutePath("dashboard"), "/");
    assert.equal(appRoutePath("match"), "/match");
    assert.equal(appRoutePath("replayList"), "/replays");
  });

  test("separates shell routes from the match-board route", () => {
    assert.equal(isShellRoute("dashboard"), true);
    assert.equal(isShellRoute("lobbies"), true);
    assert.equal(isShellRoute("notFound"), true);
    assert.equal(isShellRoute("match"), false);
    assert.equal(isShellRoute("replayList"), true);
    assert.equal(isShellRoute("replay"), false);
    assert.deepEqual(
      appRoutes.map((route) => route.id),
      ["dashboard", "match", "replayList"],
    );
  });
});
