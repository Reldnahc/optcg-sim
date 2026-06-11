import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import type { PlayerId } from "@optcg/types";

import { ControlRail } from "./ControlRail.js";

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
      onNewMatch: () => undefined,
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
