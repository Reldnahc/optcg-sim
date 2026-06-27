import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import { PlayerSummaryLabel } from "./PlayerSummaryLabel.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

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

  test("renders the player's profile title with bounded style", () => {
    const markup = renderToStaticMarkup(
      createElement(PlayerSummaryLabel, {
        label: "Tester",
        title: {
          key: "regional-winner",
          label: "Regional Winner",
          style: {
            text_color: "#fde68a",
            font_family: "display",
            font_weight: 800,
            gradient: {
              from: "#facc15",
              via: "#fb923c",
              to: "#f43f5e",
              angle: 135,
            },
            outline_color: "#111827",
            glow_color: "#fde68a",
          },
        },
        status: "connected",
      }),
    );

    assert.match(markup, /class="player-profile-title"/u);
    assert.match(markup, /data-title-key="regional-winner"/u);
    assert.match(markup, />Regional Winner</u);
    assert.match(markup, /font-weight:800/u);
    assert.match(
      markup,
      /background-image:linear-gradient\(135deg, #facc15, #fb923c, #f43f5e\)/u,
    );
    assert.match(markup, /color:transparent/u);
    assert.match(markup, /text-shadow:0 0 10px #fde68a/u);
    assert.match(
      markup,
      /<span class="player-name">Tester<\/span><span class="connection-status is-connected"[^>]*><\/span><\/h2><span class="player-profile-title"/u,
    );
  });

  test("styles profile title as account text instead of a chip", async () => {
    const styles = await readFile(
      join(sourceDirectory, "styles", "controls.css"),
      "utf8",
    );
    const titleRule = styles.match(
      /\.player-profile-title\s*\{(?<body>[^}]*)\}/u,
    );
    const titleRuleBody = titleRule?.groups?.["body"];

    assert.ok(titleRuleBody);
    assert.doesNotMatch(titleRuleBody, /\bborder\s*:/u);
    assert.doesNotMatch(titleRuleBody, /\bbackground(?:-color)?\s*:/u);
    assert.doesNotMatch(titleRuleBody, /\bborder-radius\s*:/u);
    assert.doesNotMatch(titleRuleBody, /\bpadding\s*:/u);
    assert.match(
      titleRuleBody,
      /font-size:\s*var\(--control-body-font-size\);/u,
    );
    assert.match(titleRuleBody, /font-weight:\s*700;/u);
  });

  test("styles avatar frame like the account preview instead of a gray inset badge", async () => {
    const styles = await readFile(
      join(sourceDirectory, "styles", "controls.css"),
      "utf8",
    );
    const avatarRule = styles.match(
      /\.player-summary-avatar\s*\{(?<body>[^}]*)\}/u,
    );
    const avatarRuleBody = avatarRule?.groups?.["body"];
    const imageRule = styles.match(
      /\.player-summary-avatar img\s*\{(?<body>[^}]*)\}/u,
    );
    const imageRuleBody = imageRule?.groups?.["body"];

    assert.ok(avatarRuleBody);
    assert.ok(imageRuleBody);
    assert.doesNotMatch(avatarRuleBody, /box-shadow:\s*inset/u);
    assert.doesNotMatch(avatarRuleBody, /var\(--match-surface-control\)/u);
    assert.match(
      avatarRuleBody,
      /background:\s*rgba\(15,\s*18,\s*25,\s*0\.94\);/u,
    );
    assert.match(imageRuleBody, /display:\s*block;/u);
    assert.match(imageRuleBody, /max-height:\s*none;/u);
  });

  test("renders no profile title when one is not provided", () => {
    const markup = renderToStaticMarkup(
      createElement(PlayerSummaryLabel, { label: "Tester" }),
    );

    assert.doesNotMatch(markup, /player-profile-title/u);
  });
});
