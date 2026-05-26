import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

describe("playmat structure", () => {
  test("board layout uses one physical table grid instead of mirrored player mats", async () => {
    const boardLayout = await readFile(
      join(sourceDirectory, "BoardLayout.tsx"),
      "utf8",
    );

    assert.equal(boardLayout.includes("PlayerMat"), false);
    for (const className of [
      "opponent-characters",
      "opponent-cost",
      "opponent-leader",
      "opponent-stage",
      "opponent-deck",
      "opponent-don-deck",
      "opponent-trash",
      "opponent-life",
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

  test("physical table grid uses mirrored player and opponent row heights", async () => {
    const styles = await readFile(join(sourceDirectory, "styles.css"), "utf8");

    assert.match(
      styles,
      /grid-template-rows:\s*112px\s+112px\s+minmax\(\s*100px,\s*1fr\s*\)\s+34px\s+minmax\(\s*100px,\s*1fr\s*\)\s+112px\s+112px;/,
    );
  });

  test("leader and stage zones are centered and mirrored", async () => {
    const styles = await readFile(join(sourceDirectory, "styles.css"), "utf8");

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

  test("main deck stacks above trash and life stacks above DON deck", async () => {
    const styles = await readFile(join(sourceDirectory, "styles.css"), "utf8");

    assert.equal(
      styles.includes(
        '". player-life . player-leader player-stage . player-deck ."',
      ),
      true,
    );
    assert.equal(
      styles.includes(
        '". player-don-deck . player-cost player-cost player-cost player-trash ."',
      ),
      true,
    );
    assert.equal(
      styles.includes(
        '". opponent-don-deck . opponent-cost opponent-cost opponent-cost opponent-deck ."',
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
    const styles = await readFile(join(sourceDirectory, "styles.css"), "utf8");

    assert.match(
      styles,
      /grid-template-rows:\s*112px\s+112px\s+minmax\(\s*100px,\s*1fr\s*\)\s+34px\s+minmax\(\s*100px,\s*1fr\s*\)\s+112px\s+112px;/,
    );
  });
});
