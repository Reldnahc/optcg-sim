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
      "opponent-stage",
      "opponent-deck",
      "opponent-don-deck",
      "opponent-trash",
      "opponent-life",
      "center-spacer",
      "player-characters",
      "player-cost",
      "player-leader",
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

  test("physical table grid uses fixed play rows with a center flexible spacer", async () => {
    const [appShellStyles, playmatStyles] = await Promise.all([
      readFile(appShellStylesPath, "utf8"),
      readFile(playmatStylesPath, "utf8"),
    ]);

    assert.match(
      appShellStyles,
      /--playmat-row-height:\s*calc\(100vh\s*\/\s*6\.5\);/,
    );
    assert.match(
      playmatStyles,
      /grid-template-rows:\s*var\(--playmat-row-height\)\s+var\(--playmat-row-height\)\s+var\(--playmat-row-height\)\s+minmax\(\s*0,\s*1fr\s*\)\s+var\(--playmat-row-height\)\s+var\(--playmat-row-height\)\s+var\(--playmat-row-height\);/,
    );
    assert.equal(
      playmatStyles.includes('". . center-spacer center-spacer . ."'),
      true,
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
      /--card-height:\s*calc\(var\(--playmat-row-height\)\s*-\s*14px\);/,
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
    assert.match(controlsStyles, /\.control-rail\s*\{[^}]*right:\s*8px;/u);
    assert.match(controlsStyles, /\.control-rail\s*\{[^}]*width:\s*260px;/u);
  });

  test("leader and stage zones are centered and mirrored", async () => {
    const styles = await readFile(playmatStylesPath, "utf8");

    assert.equal(
      styles.includes(
        '"opponent-deck . opponent-stage opponent-leader . opponent-life"',
      ),
      true,
    );
    assert.equal(
      styles.includes(
        '"player-life . player-leader player-stage . player-deck"',
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
        '"opponent-deck . opponent-stage opponent-leader . opponent-life"',
      ),
      true,
    );
  });

  test("deck and DON deck render as hidden card stacks without collection modals", async () => {
    const boardLayout = await readFile(
      join(sourceDirectory, "BoardLayout.tsx"),
      "utf8",
    );

    assert.match(
      boardLayout,
      /className="playmat-zone opponent-deck"[\s\S]*label="Deck"[\s\S]*hiddenCards\([\s\S]*board\.opponent\.deckCount/u,
    );
    assert.match(
      boardLayout,
      /className="playmat-zone opponent-don-deck"[\s\S]*label="DON!! Deck"[\s\S]*hiddenCards\([\s\S]*board\.opponent\.donDeckCount/u,
    );
    assert.match(
      boardLayout,
      /className="playmat-zone player-deck"[\s\S]*label="Deck"[\s\S]*hiddenCards\([\s\S]*board\.self\.deckCount/u,
    );
    assert.match(
      boardLayout,
      /className="playmat-zone player-don-deck"[\s\S]*label="DON!! Deck"[\s\S]*hiddenCards\([\s\S]*board\.self\.donDeckCount/u,
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

    assert.match(styles, /\.zone-cards\s*\{[^}]*align-items:\s*center;/u);
    assert.match(styles, /\.zone-cards\s*\{[^}]*justify-content:\s*center;/u);
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
    assert.match(modalStyles, /\.modal-frame\s*\{[^}]*z-index:\s*10;/u);
  });
});
