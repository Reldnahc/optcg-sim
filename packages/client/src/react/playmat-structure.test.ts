import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const playmatStylesPath = join(sourceDirectory, "styles", "playmat.css");

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

  test("physical table grid uses fixed play rows with a center flexible spacer", async () => {
    const styles = await readFile(playmatStylesPath, "utf8");

    assert.match(styles, /--playmat-row-height:\s*calc\(100vh\s*\/\s*6\.5\);/);
    assert.match(
      styles,
      /grid-template-rows:\s*var\(--playmat-row-height\)\s+var\(--playmat-row-height\)\s+var\(--playmat-row-height\)\s+minmax\(\s*0,\s*1fr\s*\)\s+var\(--playmat-row-height\)\s+var\(--playmat-row-height\)\s+var\(--playmat-row-height\);/,
    );
    assert.equal(
      styles.includes('". . . center-spacer center-spacer . . ."'),
      true,
    );
  });

  test("leader and stage zones are centered and mirrored", async () => {
    const styles = await readFile(playmatStylesPath, "utf8");

    assert.equal(
      styles.includes(
        '". opponent-life . opponent-stage opponent-leader . opponent-trash ."',
      ),
      true,
    );
    assert.equal(
      styles.includes(
        '". player-life . player-leader player-stage . player-deck ."',
      ),
      true,
    );
  });

  test("life zones span into the adjacent character row", async () => {
    const styles = await readFile(playmatStylesPath, "utf8");

    assert.equal(
      styles.includes(
        '". opponent-life opponent-characters opponent-characters opponent-characters opponent-characters opponent-characters ."',
      ),
      true,
    );
    assert.equal(
      styles.includes(
        '". player-life player-characters player-characters player-characters player-characters player-characters ."',
      ),
      true,
    );
  });

  test("main deck stacks above trash and life stacks above DON deck", async () => {
    const styles = await readFile(playmatStylesPath, "utf8");

    assert.equal(
      styles.includes(
        '". player-don-deck player-cost player-cost player-cost player-cost player-trash ."',
      ),
      true,
    );
    assert.equal(
      styles.includes(
        '". opponent-don-deck opponent-cost opponent-cost opponent-cost opponent-cost opponent-deck ."',
      ),
      true,
    );
    assert.equal(
      styles.includes(
        '". opponent-life . opponent-stage opponent-leader . opponent-trash ."',
      ),
      true,
    );
  });

  test("deck, DON deck, trash, leader, and stage use same-height rows", async () => {
    const styles = await readFile(playmatStylesPath, "utf8");

    assert.match(
      styles,
      /grid-template-rows:\s*var\(--playmat-row-height\)\s+var\(--playmat-row-height\)\s+var\(--playmat-row-height\)\s+minmax\(\s*0,\s*1fr\s*\)\s+var\(--playmat-row-height\)\s+var\(--playmat-row-height\)\s+var\(--playmat-row-height\);/,
    );
  });
});
