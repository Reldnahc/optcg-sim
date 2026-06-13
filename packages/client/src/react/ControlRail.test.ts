import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import type { PlayerId } from "@optcg/types";

import { ControlRail } from "./ControlRail.js";

const buttonWithAriaLabel = (markup: string, label: string): string => {
  const match = new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`, "u").exec(
    markup,
  );
  if (match === null) {
    throw new Error(`Expected button with aria-label ${label}.`);
  }
  return match[0];
};

test("control rail shows turn and phase at the top of the controls panel", () => {
  const markup = renderToStaticMarkup(
    createElement(ControlRail, {
      errors: [],
      globalActions: [{ index: 12, type: "endMainPhase", label: "End turn" }],
      disabled: false,
      turnState: {
        globalTurn: 4,
        playerTurnCounts: {},
        turnPlayerId: "p1" as PlayerId,
        phase: "main",
        step: "counter",
      },
      onAction: () => undefined,
      onHome: () => undefined,
    }),
  );

  const statusPosition = markup.indexOf("control-turn-status");
  const actionPosition = markup.indexOf("End turn");

  assert.match(markup, /Turn 4/u);
  assert.match(markup, /Counter Step/u);
  assert.equal(statusPosition >= 0, true);
  assert.equal(actionPosition >= 0, true);
  assert.equal(statusPosition < actionPosition, true);
});

test("control rail keeps home and rematch hidden during active matches", () => {
  const markup = renderToStaticMarkup(
    createElement(ControlRail, {
      errors: [],
      globalActions: [{ index: 12, type: "endMainPhase", label: "End turn" }],
      disabled: false,
      matchStatus: "active",
      onAction: () => undefined,
      onHome: () => undefined,
      onRematch: () => undefined,
    }),
  );

  assert.equal(markup.includes('aria-label="Home"'), false);
  assert.equal(markup.includes('aria-label="Rematch"'), false);
  assert.equal(markup.includes('aria-label="New match"'), false);
});

test("control rail shows home and rematch only once the match is over", () => {
  const markup = renderToStaticMarkup(
    createElement(ControlRail, {
      errors: [],
      globalActions: [],
      disabled: false,
      matchStatus: "gameOver",
      onAction: () => undefined,
      onHome: () => undefined,
      onRematch: () => undefined,
    }),
  );
  const homePosition = markup.indexOf('aria-label="Home"');
  const rematchPosition = markup.indexOf('aria-label="Rematch"');

  assert.match(markup, /class="[^"]*end-match-actions/u);
  assert.equal(markup.includes('aria-label="New match"'), false);
  assert.equal(homePosition >= 0, true);
  assert.equal(rematchPosition >= 0, true);
  assert.equal(rematchPosition < homePosition, true);
  assert.match(
    markup,
    /class="action-button is-primary end-match-action"[^>]*aria-label="Rematch"/u,
  );
});

test("control rail disables rematch after self requests it", () => {
  const markup = renderToStaticMarkup(
    createElement(ControlRail, {
      errors: [],
      globalActions: [],
      disabled: false,
      matchStatus: "gameOver",
      rematchStatus: "requestedBySelf",
      onAction: () => undefined,
      onHome: () => undefined,
      onRematch: () => undefined,
    }),
  );

  assert.match(buttonWithAriaLabel(markup, "Rematch requested"), /disabled/u);
});

test("control rail keeps opponent rematch request clickable", () => {
  const markup = renderToStaticMarkup(
    createElement(ControlRail, {
      errors: [],
      globalActions: [],
      disabled: false,
      matchStatus: "gameOver",
      rematchStatus: "requestedByOpponent",
      onAction: () => undefined,
      onHome: () => undefined,
      onRematch: () => undefined,
    }),
  );

  assert.match(markup, /aria-label="Rematch requested"/u);
  assert.doesNotMatch(
    buttonWithAriaLabel(markup, "Rematch requested"),
    /disabled/u,
  );
});

test("control rail shows opponent left when rematch cannot continue", () => {
  const markup = renderToStaticMarkup(
    createElement(ControlRail, {
      errors: [],
      globalActions: [],
      disabled: false,
      matchStatus: "gameOver",
      opponentConnectionStatus: "disconnected",
      onAction: () => undefined,
      onHome: () => undefined,
      onRematch: () => undefined,
    }),
  );

  assert.match(buttonWithAriaLabel(markup, "Opponent left"), /disabled/u);
});
