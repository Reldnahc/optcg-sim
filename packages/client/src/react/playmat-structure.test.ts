import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const playmatStylesPath = join(sourceDirectory, "styles", "playmat.css");
const appShellStylesPath = join(sourceDirectory, "styles", "app-shell.css");
const cardStylesPath = join(sourceDirectory, "styles", "card.css");
const controlsStylesPath = join(sourceDirectory, "styles", "controls.css");
const modalStylesPath = join(sourceDirectory, "styles", "modal-frame.css");
const zoneStylesPath = join(sourceDirectory, "styles", "zone.css");

describe("playmat structure", () => {
  test("board layout uses one physical table grid instead of mirrored player mats", async () => {
    const boardLayout = await readFile(
      join(sourceDirectory, "BoardLayout.tsx"),
      "utf8",
    );

    assert.equal(boardLayout.includes("PlayerMat"), false);
    assert.equal(boardLayout.includes("phase-ladder"), false);
    for (const className of [
      "opponent-characters",
      "opponent-cost",
      "opponent-leader",
      "opponent-restriction-area",
      "opponent-stage",
      "opponent-deck",
      "opponent-don-deck",
      "opponent-trash",
      "opponent-life",
      "center-spacer",
      "opponent-center-spacer",
      "player-center-spacer",
      "player-characters",
      "player-cost",
      "player-leader",
      "player-restriction-area",
      "player-stage",
      "player-deck",
      "player-don-deck",
      "player-trash",
      "player-life",
    ]) {
      assert.equal(
        boardLayout.includes(className),
        true,
        `BoardLayout must render ${className}.`,
      );
    }
  });

  test("character areas opt into five fixed slots instead of spread or overlap rows", async () => {
    const boardLayout = await readFile(
      join(sourceDirectory, "BoardLayout.tsx"),
      "utf8",
    );

    assert.match(
      boardLayout,
      /className="playmat-zone opponent-characters"[\s\S]*displayMode="slots"[\s\S]*slotCount=\{5\}/u,
    );
    assert.match(
      boardLayout,
      /className="playmat-zone player-characters"[\s\S]*displayMode="slots"[\s\S]*slotCount=\{5\}/u,
    );
  });

  test("physical table grid keeps the original center footprint split into two halves", async () => {
    const [appShellStyles, playmatStyles] = await Promise.all([
      readFile(appShellStylesPath, "utf8"),
      readFile(playmatStylesPath, "utf8"),
    ]);

    assert.match(appShellStyles, /--match-app-padding:\s*8px;/);
    assert.match(appShellStyles, /--playmat-board-padding:\s*8px;/);
    assert.match(appShellStyles, /--playmat-border-width:\s*2px;/);
    assert.match(appShellStyles, /--playmat-grid-gap:\s*6px;/);
    assert.match(
      appShellStyles,
      /--match-playmat-color-rgb:\s*34,\s*34,\s*36;/u,
    );
    assert.match(appShellStyles, /--match-playmat-opacity:\s*0\.92;/u);
    assert.match(
      appShellStyles,
      /--match-surface-board:\s*rgba\(\s*var\(--match-playmat-color-rgb\),\s*var\(--match-playmat-opacity\)\s*\);/u,
    );
    assert.match(
      appShellStyles,
      /--match-surface-zone:\s*rgba\(0,\s*0,\s*0,\s*var\(--zone-guide-background-alpha\)\);/u,
    );
    assert.match(appShellStyles, /--zone-guide-background-alpha:\s*0\.18;/u);
    assert.match(
      appShellStyles,
      /--playmat-vertical-chrome:\s*calc\(\s*\(var\(--match-app-padding\)\s*\*\s*2\)\s*\+\s*\(var\(--playmat-board-padding\)\s*\*\s*2\)\s*\+\s*\(var\(--playmat-border-width\)\s*\*\s*2\)\s*\+\s*\(var\(--playmat-grid-gap\)\s*\*\s*6\)\s*\);/,
    );
    assert.match(
      appShellStyles,
      /--playmat-row-height:\s*calc\(\(100vh\s*-\s*var\(--playmat-vertical-chrome\)\)\s*\/\s*6\);/,
    );
    assert.match(appShellStyles, /padding:\s*var\(--match-app-padding\);/);
    assert.match(
      playmatStyles,
      /grid-template-rows:\s*var\(--playmat-row-height\)\s+var\(--playmat-row-height\)\s+var\(--playmat-row-height\)\s+minmax\(\s*0,\s*1fr\s*\)\s+var\(--playmat-row-height\)\s+var\(--playmat-row-height\)\s+var\(--playmat-row-height\);/,
    );
    assert.match(
      playmatStyles,
      /height:\s*calc\(100vh\s*-\s*\(var\(--match-app-padding\)\s*\*\s*2\)\);/,
    );
    assert.match(playmatStyles, /gap:\s*var\(--playmat-grid-gap\);/);
    assert.match(
      playmatStyles,
      /border:\s*var\(--playmat-border-width\)\s+solid\s+var\(--match-border\);/u,
    );
    assert.match(playmatStyles, /background:\s*var\(--match-surface-board\);/u);
    assert.match(playmatStyles, /padding:\s*var\(--playmat-board-padding\);/);
    assert.equal(
      playmatStyles.includes('". . center-spacer center-spacer . ."'),
      true,
    );
    assert.equal(
      playmatStyles.includes(
        '". . opponent-center-spacer opponent-center-spacer . ."',
      ),
      false,
    );
    assert.equal(
      playmatStyles.includes(
        '". . player-center-spacer player-center-spacer . ."',
      ),
      false,
    );
    assert.match(
      playmatStyles,
      /\.center-spacer\s*\{[^}]*grid-area:\s*center-spacer;[^}]*display:\s*grid;[^}]*grid-template-rows:\s*minmax\(\s*0,\s*1fr\s*\)\s+minmax\(\s*0,\s*1fr\s*\);/u,
    );
    assert.match(
      playmatStyles,
      /\.opponent-center-spacer\s*\{[^}]*min-height:\s*0;/u,
    );
    assert.match(
      playmatStyles,
      /\.player-center-spacer\s*\{[^}]*min-height:\s*0;/u,
    );
  });

  test("card-sized zones reserve the same reactive card width used by cards", async () => {
    const [appShellStyles, playmatStyles, cardStyles] = await Promise.all([
      readFile(appShellStylesPath, "utf8"),
      readFile(playmatStylesPath, "utf8"),
      readFile(cardStylesPath, "utf8"),
    ]);

    assert.match(
      appShellStyles,
      /--card-height:\s*clamp\(\s*var\(--desktop-card-min-height\),\s*calc\(var\(--playmat-row-height\)\s*-\s*14px\),\s*var\(--desktop-card-max-height\)\s*\);/,
    );
    assert.match(
      appShellStyles,
      /--card-width:\s*calc\(var\(--card-height\)\s*\/\s*1\.4\);/,
    );
    assert.match(
      appShellStyles,
      /--card-zone-width:\s*calc\(var\(--card-width\)\s*\+\s*14px\);/,
    );
    assert.match(cardStyles, /height:\s*var\(--card-height\);/);
    assert.match(
      playmatStyles,
      /grid-template-columns:\s*var\(--card-zone-width\)\s+var\(--playmat-wide-zone-width\)\s+var\(--card-zone-width\)\s+var\(--card-zone-width\)\s+var\(--playmat-wide-zone-width\)\s+var\(--card-zone-width\);/,
    );
  });

  test("playmat columns use fixed reactive tracks so cost rows cannot resize the board", async () => {
    const [appShellStyles, playmatStyles] = await Promise.all([
      readFile(appShellStylesPath, "utf8"),
      readFile(playmatStylesPath, "utf8"),
    ]);

    assert.match(
      appShellStyles,
      /--playmat-wide-zone-width:\s*calc\(var\(--card-width\)\s*\*\s*1\.6\);/,
    );
    assert.equal(playmatStyles.includes("minmax(116px, 1fr)"), false);
    assert.match(
      playmatStyles,
      /grid-template-columns:\s*var\(--card-zone-width\)\s+var\(--playmat-wide-zone-width\)\s+var\(--card-zone-width\)\s+var\(--card-zone-width\)\s+var\(--playmat-wide-zone-width\)\s+var\(--card-zone-width\);/,
    );
  });

  test("board shell does not force an oversized playmat width", async () => {
    const [appShellStyles, controlsStyles] = await Promise.all([
      readFile(appShellStylesPath, "utf8"),
      readFile(controlsStylesPath, "utf8"),
    ]);

    assert.equal(appShellStyles.includes("minmax(900px, 1fr) 260px"), false);
    assert.equal(appShellStyles.includes("minmax(650px, 900px)"), false);
    assert.equal(appShellStyles.includes("clamp(230px, 24vw, 360px)"), false);
    assert.match(appShellStyles, /grid-template-columns:\s*1fr;/);
    assert.match(
      appShellStyles,
      /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+max-content\s+minmax\(0,\s*1fr\);/,
    );
    assert.match(
      appShellStyles,
      /grid-template-areas:\s*"hand-rail playmat-board \.";/,
    );
    assert.match(
      controlsStyles,
      /\.control-rail\s*\{[^}]*position:\s*absolute;/u,
    );
    assert.match(
      controlsStyles,
      /\.control-rail\s*\{[^}]*--control-rail-default-width:\s*clamp\(/u,
    );
    assert.match(
      controlsStyles,
      /\.control-rail\s*\{[^}]*right:\s*var\(--control-rail-gap\);/u,
    );
    assert.match(
      controlsStyles,
      /\.control-rail\s*\{[^}]*width:\s*var\(--control-rail-default-width\);/u,
    );
  });

  test("effect spotlight is hosted in the empty hand rail lane", async () => {
    const [boardLayout, matchApp, effectSpotlightStyles] = await Promise.all([
      readFile(join(sourceDirectory, "BoardLayout.tsx"), "utf8"),
      readFile(join(sourceDirectory, "MatchApp.tsx"), "utf8"),
      readFile(join(sourceDirectory, "styles", "effect-spotlight.css"), "utf8"),
    ]);

    assert.match(
      boardLayout,
      /<div className="hand-rail">[\s\S]*<EffectSpotlight/u,
    );
    assert.match(matchApp, /effectSpotlightCard=\{effectSpotlightCard\}/u);
    assert.match(
      matchApp,
      /const effectSpotlightActive = effectSpotlight\?\.active;/u,
    );
    assert.match(
      matchApp,
      /const effectSpotlightHistory = playerSnapshot\?\.view\.effectSpotlightHistory;/u,
    );
    assert.match(
      matchApp,
      /consumeInitialResolvedSources: effectSpotlightHistory === undefined/u,
    );
    assert.match(
      matchApp,
      /initialCursorKey: effectSpotlightHistory\?\.presentKey/u,
    );
    assert.match(matchApp, /effectSpotlightActive=\{effectSpotlightActive\}/u);
    assert.match(
      matchApp,
      /effectSpotlightControls=\{effectSpotlight\?\.controls\}/u,
    );
    assert.match(boardLayout, /controls=\{effectSpotlightControls\}/u);
    assert.equal(matchApp.includes("<EffectSpotlight"), false);
    assert.match(
      effectSpotlightStyles,
      /\.effect-spotlight\s*\{[^}]*position:\s*absolute;/u,
    );
    assert.match(
      effectSpotlightStyles,
      /\.effect-spotlight\s*\{[^}]*pointer-events:\s*auto;/u,
    );
    assert.match(
      effectSpotlightStyles,
      /\.effect-spotlight-card\s*\{[^}]*pointer-events:\s*none;/u,
    );
    assert.match(
      effectSpotlightStyles,
      /--effect-spotlight-card-width:\s*min\(\s*calc\(var\(--card-width\)\s*\+\s*var\(--card-width\)\s*\+\s*var\(--card-width\)\),\s*calc\(100vw\s*-\s*16px\)\s*\);/u,
    );
    assert.match(
      effectSpotlightStyles,
      /width:\s*var\(--effect-spotlight-card-width\);/u,
    );
    assert.equal(effectSpotlightStyles.includes("calc(100% - 12px)"), false);
    assert.equal(effectSpotlightStyles.includes(" * "), false);
    assert.equal(effectSpotlightStyles.includes(" / "), false);
    assert.match(
      effectSpotlightStyles,
      /\.effect-spotlight-card\s*\{[^}]*aspect-ratio:\s*0\.7;[^}]*border-radius:\s*6px;/u,
    );
    assert.match(effectSpotlightStyles, /right:\s*4%;/u);
    assert.match(effectSpotlightStyles, /bottom:\s*18%;/u);
    assert.match(effectSpotlightStyles, /left:\s*4%;/u);
    assert.match(effectSpotlightStyles, /min-height:\s*24%;/u);
    assert.match(effectSpotlightStyles, /max-height:\s*29%;/u);
    assert.match(effectSpotlightStyles, /display:\s*flex;/u);
    assert.match(effectSpotlightStyles, /flex-direction:\s*column;/u);
    assert.match(effectSpotlightStyles, /align-items:\s*start;/u);
    assert.match(
      effectSpotlightStyles,
      /\.effect-spotlight-card__trigger-rules\s*\{[^}]*margin-bottom:\s*clamp\(2px,\s*0\.45vh,\s*4px\);[^}]*margin-top:\s*auto;/u,
    );
    assert.match(
      effectSpotlightStyles,
      /\.effect-spotlight \.trigger-block\s*\{[^}]*background:\s*#17150d;[^}]*color:\s*#fff8f8;/u,
    );
    assert.match(
      effectSpotlightStyles,
      /\.effect-spotlight \.card-rules-tag--trigger\s*\{[^}]*line-height:\s*1\.65;[^}]*font-size:\s*0\.9em;/u,
    );
    assert.match(
      effectSpotlightStyles,
      /\.effect-spotlight \.card-rules-tag--trigger\s*\{[^}]*border-radius:\s*0;/u,
    );
    assert.match(
      effectSpotlightStyles,
      /\.effect-spotlight \.trigger-block--wraps \.card-rules-tag--trigger\s*\{[^}]*border-radius:\s*0;[^}]*vertical-align:\s*top;/u,
    );
    assert.match(
      effectSpotlightStyles,
      /\.effect-spotlight \.card-rules-tag--trigger\s*\{[^}]*margin:\s*-0\.15em 0 -0\.2em 0;/u,
    );
    assert.match(
      effectSpotlightStyles,
      /\.effect-spotlight \.trigger-block \.card-rules-line:first-child\s*\{[^}]*padding-left:\s*0\.3em;[^}]*padding-top:\s*0;[^}]*padding-bottom:\s*0;/u,
    );
    assert.match(
      effectSpotlightStyles,
      /background:\s*rgba\(246,\s*238,\s*224,\s*0\.9\);/u,
    );
    assert.match(
      effectSpotlightStyles,
      /--effect-spotlight-rules-font-size:\s*clamp\(5px,\s*0\.82vh,\s*15px\);/u,
    );
    assert.match(
      effectSpotlightStyles,
      /--effect-spotlight-rules-font-size:\s*clamp\(5px,\s*3\.4cqw,\s*15px\);/u,
    );
    assert.match(
      effectSpotlightStyles,
      /\.effect-spotlight \.card-rules-text\s*\{[^}]*font-size:\s*var\(--effect-spotlight-rules-font-size\);[^}]*line-height:\s*var\(--effect-spotlight-rules-line-height\);/u,
    );
    assert.match(
      effectSpotlightStyles,
      /--effect-spotlight-rules-line-height:\s*1\.24;/u,
    );
    assert.equal(effectSpotlightStyles.includes("letter-spacing"), false);
    assert.match(effectSpotlightStyles, /transform:\s*scaleX\(0\.98\);/u);
    assert.match(effectSpotlightStyles, /transform-origin:\s*left top;/u);
    assert.match(effectSpotlightStyles, /align-self:\s*start;/u);
    assert.match(
      effectSpotlightStyles,
      /\.effect-spotlight \.card-rules-line \+ \.card-rules-line\s*\{[^}]*margin-top:\s*0\.2em;/u,
    );
    assert.match(
      effectSpotlightStyles,
      /\.effect-spotlight \.card-rules-tag\s*\{[^}]*margin-bottom:\s*0\.14em;[^}]*padding:\s*0\.01em 0\.3em;/u,
    );
    assert.match(
      effectSpotlightStyles,
      /\.effect-spotlight \.card-rules-tag--trigger\s*\{[^}]*padding:\s*0\.15em 1\.4em 0\.15em 0\.3em;/u,
    );
    assert.equal(effectSpotlightStyles.includes("0.14rem"), false);
    assert.equal(effectSpotlightStyles.includes("1.4rem"), false);
    assert.equal(
      effectSpotlightStyles.includes(
        ".effect-spotlight .effect-rules-span .card-rules-line",
      ),
      false,
    );
    assert.match(
      effectSpotlightStyles,
      /\.effect-spotlight \.effect-rules-span--active\s*\{[^}]*color:\s*#171005;/u,
    );
    assert.match(
      effectSpotlightStyles,
      /--effect-spotlight-highlight-background:\s*rgba\(255,\s*186,\s*45,\s*0\.72\);/u,
    );
    assert.match(
      effectSpotlightStyles,
      /\.effect-spotlight\s+\.effect-rules-span--active\s+:where\(\.card-rules-copy,\s*\.card-rules-link\)\s*\{[^}]*background:\s*var\(--effect-spotlight-highlight-background\);/u,
    );
    assert.match(
      effectSpotlightStyles,
      /\.effect-spotlight\s+\.effect-rules-span--active\s+:where\(\.card-rules-copy,\s*\.card-rules-link\)\s*\{[^}]*border-radius:\s*0;/u,
    );
    assert.match(
      effectSpotlightStyles,
      /\.effect-spotlight\s+\.effect-rules-span--active\s+:where\(\.card-rules-copy,\s*\.card-rules-link\)\s*\{[^}]*box-shadow:\s*none;/u,
    );
    assert.match(
      effectSpotlightStyles,
      /\.effect-spotlight\s+\.effect-rules-span--active\s+:where\(\.card-rules-copy,\s*\.card-rules-link\)\s*\{[^}]*text-decoration-line:\s*underline;/u,
    );
    assert.match(
      effectSpotlightStyles,
      /\.effect-spotlight \.effect-rules-span--active \.card-rules-tag\s*\{[^}]*box-shadow:/u,
    );
    assert.equal(effectSpotlightStyles.includes("position: fixed;"), false);
  });

  test("control dock is tall and flush inside the panel", async () => {
    const controlsStyles = await readFile(controlsStylesPath, "utf8");

    assert.match(
      controlsStyles,
      /--control-window-dock-height:\s*clamp\(\s*260px,\s*calc\(var\(--card-height\) \* 2\.15\),\s*460px\s*\);/u,
    );
    assert.match(controlsStyles, /\.control-window-dock\s*\{[^}]*right:\s*0;/u);
    assert.match(
      controlsStyles,
      /\.control-window-dock\s*\{[^}]*bottom:\s*0;/u,
    );
    assert.match(controlsStyles, /\.control-window-dock\s*\{[^}]*left:\s*0;/u);
    assert.match(
      controlsStyles,
      /\.control-window-dock\s*\{[^}]*height:\s*var\(--control-window-dock-height\);/u,
    );
  });

  test("leader and stage zones are centered and mirrored", async () => {
    const styles = await readFile(playmatStylesPath, "utf8");

    assert.equal(
      styles.includes(
        '"opponent-deck . opponent-stage opponent-leader opponent-restrictions opponent-life"',
      ),
      true,
    );
    assert.equal(
      styles.includes(
        '"player-life player-restrictions player-leader player-stage . player-deck"',
      ),
      true,
    );
  });

  test("life zones span into the adjacent character row", async () => {
    const styles = await readFile(playmatStylesPath, "utf8");

    assert.equal(
      styles.includes(
        '"opponent-characters opponent-characters opponent-characters opponent-characters opponent-characters opponent-life"',
      ),
      true,
    );
    assert.equal(
      styles.includes(
        '"player-life player-characters player-characters player-characters player-characters player-characters"',
      ),
      true,
    );
  });

  test("main deck stacks above trash and life stacks above DON deck", async () => {
    const styles = await readFile(playmatStylesPath, "utf8");

    assert.equal(
      styles.includes(
        '"player-don-deck player-cost player-cost player-cost player-cost player-trash"',
      ),
      true,
    );
    assert.equal(
      styles.includes(
        '"opponent-trash opponent-cost opponent-cost opponent-cost opponent-cost opponent-don-deck"',
      ),
      true,
    );
    assert.equal(
      styles.includes(
        '"opponent-deck . opponent-stage opponent-leader opponent-restrictions opponent-life"',
      ),
      true,
    );
  });

  test("deck and DON deck render full hidden card stacks without collection modals", async () => {
    const boardLayout = await readFile(
      join(sourceDirectory, "BoardLayout.tsx"),
      "utf8",
    );

    const opponentDeckStart = boardLayout.indexOf(
      'className="playmat-zone opponent-deck"',
    );
    const opponentDeckEnd = boardLayout.indexOf(
      'className="playmat-zone opponent-don-deck"',
      opponentDeckStart,
    );
    const opponentDeckZone = boardLayout.slice(
      opponentDeckStart,
      opponentDeckEnd,
    );
    assert.match(opponentDeckZone, /label="Deck"/u);
    assert.match(opponentDeckZone, /board\.opponent\.deckCount/u);
    assert.match(opponentDeckZone, /"hidden-deck-opponent"/u);
    assert.match(
      opponentDeckZone,
      /reduceDeckStackRendering \? 1 : undefined/u,
    );
    assert.doesNotMatch(opponentDeckZone, /"hidden-deck-opponent",\s+1\)/u);
    assert.match(
      boardLayout,
      /className="playmat-zone opponent-don-deck"[\s\S]*label="DON!! Deck"[\s\S]*hiddenCards\([\s\S]*board\.opponent\.donDeckCount,[\s\S]*"hidden-don-deck-opponent"[\s\S]*\)/u,
    );
    assert.doesNotMatch(
      boardLayout,
      /className="playmat-zone opponent-don-deck"[\s\S]*label="DON!! Deck"[\s\S]*hiddenCards\([\s\S]*board\.opponent\.donDeckCount,[\s\S]*"hidden-don-deck-opponent",[\s\S]*1[,)]/u,
    );
    const playerDeckStart = boardLayout.indexOf(
      'className="playmat-zone player-deck"',
    );
    const playerDeckEnd = boardLayout.indexOf(
      'className="playmat-zone player-don-deck"',
      playerDeckStart,
    );
    const playerDeckZone = boardLayout.slice(playerDeckStart, playerDeckEnd);
    assert.match(playerDeckZone, /label="Deck"/u);
    assert.match(playerDeckZone, /board\.self\.deckCount/u);
    assert.match(playerDeckZone, /"hidden-deck-self"/u);
    assert.doesNotMatch(playerDeckZone, /"hidden-deck-self",\s+1\)/u);
    assert.match(
      boardLayout,
      /className="playmat-zone player-don-deck"[\s\S]*label="DON!! Deck"[\s\S]*hiddenCards\([\s\S]*board\.self\.donDeckCount,[\s\S]*"hidden-don-deck-self"[\s\S]*\)/u,
    );
    assert.doesNotMatch(
      boardLayout,
      /className="playmat-zone player-don-deck"[\s\S]*label="DON!! Deck"[\s\S]*hiddenCards\([\s\S]*board\.self\.donDeckCount,[\s\S]*"hidden-don-deck-self",[\s\S]*1[,)]/u,
    );
    assert.equal(boardLayout.includes("const stack = "), false);
    assert.equal(boardLayout.includes("stack-label"), false);

    for (const zoneClass of [
      "opponent-deck",
      "opponent-don-deck",
      "player-deck",
      "player-don-deck",
    ]) {
      const zoneStart = boardLayout.indexOf(
        `className="playmat-zone ${zoneClass}"`,
      );
      const nextZoneStart = boardLayout.indexOf(
        'className="playmat-zone',
        zoneStart + 1,
      );
      const zoneSource = boardLayout.slice(
        zoneStart,
        nextZoneStart === -1 ? undefined : nextZoneStart,
      );
      assert.equal(zoneSource.includes("onViewCollection"), false);
    }
  });

  test("deck, DON deck, trash, leader, and stage use same-height rows", async () => {
    const styles = await readFile(playmatStylesPath, "utf8");

    assert.match(
      styles,
      /grid-template-rows:\s*var\(--playmat-row-height\)\s+var\(--playmat-row-height\)\s+var\(--playmat-row-height\)\s+minmax\(\s*0,\s*1fr\s*\)\s+var\(--playmat-row-height\)\s+var\(--playmat-row-height\)\s+var\(--playmat-row-height\);/,
    );
  });

  test("single-card zones center cards in both axes", async () => {
    const styles = await readFile(zoneStylesPath, "utf8");

    assert.match(styles, /\.zone\s*\{[^}]*box-sizing:\s*border-box;/u);
    assert.match(styles, /\.zone\s*\{[^}]*width:\s*100%;/u);
    assert.match(styles, /\.zone-cards\s*\{[^}]*align-items:\s*center;/u);
    assert.match(styles, /\.zone-cards\s*\{[^}]*justify-content:\s*center;/u);
    assert.match(styles, /\.zone-cards\s*\{[^}]*min-width:\s*0;/u);
    assert.match(
      styles,
      /\.zone\s*\{[^}]*border:\s*2px solid rgba\(246,\s*232,\s*209,\s*var\(--zone-guide-border-alpha\)\);[^}]*background:\s*var\(--match-surface-zone\);/u,
    );
  });

  test("battle arrow layer sits above the play field but below modals", async () => {
    const [playmatStyles, modalStyles] = await Promise.all([
      readFile(playmatStylesPath, "utf8"),
      readFile(modalStylesPath, "utf8"),
    ]);

    assert.match(
      playmatStyles,
      /\.battle-arrow-overlay\s*\{[^}]*z-index:\s*5;/u,
    );
    assert.match(modalStyles, /\.modal-frame\s*\{[^}]*z-index:\s*30;/u);
  });

  test("opponent deck stack renders above opponent trash when stacked upward", async () => {
    const styles = await readFile(playmatStylesPath, "utf8");

    assert.match(styles, /\.opponent-deck\s*\{[^}]*z-index:\s*2;/u);
    assert.match(styles, /\.opponent-trash\s*\{[^}]*z-index:\s*1;/u);
  });
});
