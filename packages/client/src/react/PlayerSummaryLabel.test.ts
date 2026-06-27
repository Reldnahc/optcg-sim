import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import { PlayerSummaryLabel } from "./PlayerSummaryLabel.js";

describe("PlayerSummaryLabel", () => {
  test("renders the player's avatar crop when one is available", () => {
    const markup = renderToStaticMarkup(
      createElement(PlayerSummaryLabel, {
        label: "Tester",
        avatar: {
          imageUrl: "https://cdn.example/avatar.png",
          crop: { x: 0.25, y: 0.1, size: 0.5 },
        },
      }),
    );

    assert.match(markup, /player-summary-avatar/u);
    assert.match(markup, /https:\/\/cdn\.example\/avatar\.png/u);
    assert.match(markup, /alt="Tester avatar"/u);
  });

  test("renders a default avatar placeholder when no avatar is available", () => {
    const markup = renderToStaticMarkup(
      createElement(PlayerSummaryLabel, { label: "Tester" }),
    );

    assert.match(markup, /player-summary-avatar-placeholder/u);
  });
});
