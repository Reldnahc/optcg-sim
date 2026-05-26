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
      "opponent-trash",
      "opponent-life",
      "player-characters",
      "player-cost",
      "player-leader",
      "player-stage",
      "player-deck",
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
      /grid-template-rows:\s*76px\s+112px\s+minmax\(\s*100px,\s*1fr\s*\)\s+34px\s+minmax\(\s*100px,\s*1fr\s*\)\s+112px\s+76px;/,
    );
  });

  test("leader and stage zones are centered and mirrored", async () => {
    const styles = await readFile(join(sourceDirectory, "styles.css"), "utf8");

    assert.equal(
      styles.includes(
        '". . . opponent-stage opponent-leader . . opponent-life"',
      ),
      true,
    );
    assert.equal(
      styles.includes('"player-life . . player-leader player-stage . . ."'),
      true,
    );
  });
});
