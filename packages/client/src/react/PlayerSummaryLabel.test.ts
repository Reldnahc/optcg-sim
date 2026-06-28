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

  test("renders no disconnect timer when none is active", () => {
    const markup = renderToStaticMarkup(
      createElement(PlayerSummaryLabel, {
        label: "Tester",
        timer: {
          game: "34:56",
          isRunning: true,
        },
      }),
    );

    assert.doesNotMatch(markup, /class="disconnect-timer"/u);
    assert.doesNotMatch(markup, />DC /u);
  });

  test("renders active disconnect timer as secondary status", () => {
    const markup = renderToStaticMarkup(
      createElement(PlayerSummaryLabel, {
        label: "Tester",
        timer: {
          game: "34:56",
          isRunning: true,
          disconnect: "00:30",
        },
      }),
    );

    assert.match(markup, /class="disconnect-timer"/u);
    assert.match(markup, />DC 00:30</u);
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
      /font-size:\s*clamp\(14px,\s*calc\(var\(--card-height\) \/ 9\.6\),\s*17px\);/u,
    );
    assert.match(titleRuleBody, /margin-left:\s*0\.35em;/u);
    assert.match(titleRuleBody, /white-space:\s*nowrap;/u);
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
      /width:\s*clamp\(55px,\s*calc\(var\(--card-height\) \/ 2\.24\),\s*70px\);/u,
    );
    assert.match(
      avatarRuleBody,
      /height:\s*clamp\(55px,\s*calc\(var\(--card-height\) \/ 2\.24\),\s*70px\);/u,
    );
    assert.match(
      avatarRuleBody,
      /background:\s*rgba\(15,\s*18,\s*25,\s*0\.94\);/u,
    );
    assert.match(imageRuleBody, /display:\s*block;/u);
    assert.match(imageRuleBody, /max-height:\s*none;/u);
  });

  test("sizes playmat identity without control rail scoped variables", async () => {
    const styles = await readFile(
      join(sourceDirectory, "styles", "controls.css"),
      "utf8",
    );
    const playerSummaryRules = [
      ...styles.matchAll(
        /\.(?:player-summary-label|player-summary-identity|player-summary-avatar|player-profile-title|connection-status)\b[^{]*\{(?<body>[^}]*)\}/gu,
      ),
    ];
    const playerSummaryStyles = playerSummaryRules
      .map((rule) => rule.groups?.["body"] ?? "")
      .join("\n");

    assert.notEqual(playerSummaryRules.length, 0);
    assert.doesNotMatch(playerSummaryStyles, /var\(--control-/u);
  });

  test("scales playmat identity text and spacing up from the compact baseline", async () => {
    const [controlStyles, playmatStyles] = await Promise.all([
      readFile(join(sourceDirectory, "styles", "controls.css"), "utf8"),
      readFile(join(sourceDirectory, "styles", "playmat.css"), "utf8"),
    ]);

    assert.match(
      controlStyles,
      /\.player-summary-label\s*\{[^}]*gap:\s*clamp\(3px,\s*calc\(var\(--card-height\) \/ 64\),\s*5px\);/u,
    );
    assert.match(
      controlStyles,
      /\.player-summary-identity\s*\{[^}]*gap:\s*clamp\(8px,\s*calc\(var\(--card-height\) \/ 16\),\s*13px\);/u,
    );
    assert.match(
      controlStyles,
      /\.player-summary-copy\s*\{[^}]*gap:\s*0\.1em;/u,
    );
    assert.match(
      controlStyles,
      /\.connection-status\s*\{[^}]*width:\s*clamp\(13px,\s*calc\(var\(--card-height\) \/ 12\.8\),\s*19px\);[^}]*height:\s*clamp\(13px,\s*calc\(var\(--card-height\) \/ 12\.8\),\s*19px\);/u,
    );
    assert.match(
      playmatStyles,
      /\.playmat-summary\s*\{[^}]*padding:\s*clamp\(8px,\s*calc\(var\(--card-height\) \/ 17\.6\),\s*13px\);/u,
    );
    assert.match(
      playmatStyles,
      /\.playmat-summary h2\s*\{[^}]*gap:\s*clamp\(8px,\s*calc\(var\(--card-height\) \/ 16\),\s*13px\);[^}]*font-size:\s*clamp\(20px,\s*calc\(var\(--card-height\) \/ 5\.6\),\s*30px\);/u,
    );
  });

  test("styles timers as a separate bottom-right playmat clock block", async () => {
    const [controlStyles, playmatStyles] = await Promise.all([
      readFile(join(sourceDirectory, "styles", "controls.css"), "utf8"),
      readFile(join(sourceDirectory, "styles", "playmat.css"), "utf8"),
    ]);
    const timerRule = controlStyles.match(
      /\.player-timers\s*\{(?<body>[^}]*)\}/u,
    );
    const timerRuleBody = timerRule?.groups?.["body"];
    const gameTimerRule = controlStyles.match(
      /\.game-timer\s*\{(?<body>[^}]*)\}/u,
    );
    const gameTimerRuleBody = gameTimerRule?.groups?.["body"];
    const disconnectRule = controlStyles.match(
      /\.disconnect-timer\s*\{(?<body>[^}]*)\}/u,
    );
    const disconnectRuleBody = disconnectRule?.groups?.["body"];

    assert.ok(timerRuleBody);
    assert.ok(gameTimerRuleBody);
    assert.ok(disconnectRuleBody);
    assert.match(
      playmatStyles,
      /\.playmat-summary\s*\{[^}]*position:\s*relative;/u,
    );
    assert.match(timerRuleBody, /position:\s*absolute;/u);
    assert.match(timerRuleBody, /right:\s*clamp\(8px,/u);
    assert.match(timerRuleBody, /bottom:\s*clamp\(8px,/u);
    assert.match(timerRuleBody, /justify-items:\s*end;/u);
    assert.doesNotMatch(timerRuleBody, /\bborder\s*:/u);
    assert.match(
      timerRuleBody,
      /background:\s*rgba\(8,\s*10,\s*14,\s*0\.72\);/u,
    );
    assert.doesNotMatch(timerRuleBody, /var\(--control-/u);
    assert.match(
      gameTimerRuleBody,
      /font-size:\s*clamp\(20px,\s*calc\(var\(--card-height\) \/ 5\.8\),\s*31px\);/u,
    );
    assert.match(gameTimerRuleBody, /font-weight:\s*800;/u);
    assert.doesNotMatch(gameTimerRuleBody, /var\(--control-/u);
    assert.doesNotMatch(disconnectRuleBody, /\bborder\s*:/u);
    assert.doesNotMatch(disconnectRuleBody, /\bbackground\s*:/u);
    assert.match(
      disconnectRuleBody,
      /font-size:\s*clamp\(10px,\s*calc\(var\(--card-height\) \/ 16\),\s*13px\);/u,
    );
  });

  test("styles playmat summary shell as a subtle translucent overlay", async () => {
    const styles = await readFile(
      join(sourceDirectory, "styles", "playmat.css"),
      "utf8",
    );
    const summaryRule = styles.match(/\.playmat-summary\s*\{(?<body>[^}]*)\}/u);
    const summaryRuleBody = summaryRule?.groups?.["body"];

    assert.ok(summaryRuleBody);
    assert.doesNotMatch(summaryRuleBody, /var\(--match-surface-panel\)/u);
    assert.doesNotMatch(summaryRuleBody, /var\(--match-border\)/u);
    assert.match(
      summaryRuleBody,
      /border:\s*max\(1px,\s*calc\(var\(--card-outline-thin\) \* 0\.5\)\) solid\s+rgba\(255,\s*255,\s*255,\s*0\.14\);/u,
    );
    assert.match(
      summaryRuleBody,
      /background:\s*rgba\(8,\s*10,\s*14,\s*0\.38\);/u,
    );
    assert.match(summaryRuleBody, /border-radius:\s*0;/u);
  });

  test("renders no profile title when one is not provided", () => {
    const markup = renderToStaticMarkup(
      createElement(PlayerSummaryLabel, { label: "Tester" }),
    );

    assert.doesNotMatch(markup, /player-profile-title/u);
  });
});
