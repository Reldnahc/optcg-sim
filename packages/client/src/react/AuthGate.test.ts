import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import { AuthGate } from "./AuthGate.js";

describe("auth gate", () => {
  test("shows a loading boundary while the session is checked", () => {
    const html = renderToStaticMarkup(
      createElement(AuthGate, {
        sessionStatus: "loading",
        submitStatus: "idle",
        onLogin: () => Promise.resolve(),
        onRegister: () => Promise.resolve(),
        children: createElement("div", null, "match app"),
      }),
    );

    assert.match(html, /Checking session/u);
    assert.doesNotMatch(html, /match app/u);
  });

  test("shows login and register controls when the user is not authenticated", () => {
    const html = renderToStaticMarkup(
      createElement(AuthGate, {
        sessionStatus: "unauthenticated",
        submitStatus: "idle",
        onLogin: () => Promise.resolve(),
        onRegister: () => Promise.resolve(),
        children: createElement("div", null, "match app"),
      }),
    );

    assert.match(html, /Sign in/u);
    assert.match(html, /Create account/u);
    assert.match(html, /Username/u);
    assert.match(html, /Password/u);
    assert.doesNotMatch(html, /match app/u);
  });

  test("renders the protected app only after authentication", () => {
    const html = renderToStaticMarkup(
      createElement(AuthGate, {
        sessionStatus: "authenticated",
        submitStatus: "idle",
        onLogin: () => Promise.resolve(),
        onRegister: () => Promise.resolve(),
        children: createElement("div", null, "match app"),
      }),
    );

    assert.match(html, /match app/u);
    assert.doesNotMatch(html, /Sign in/u);
  });
});
