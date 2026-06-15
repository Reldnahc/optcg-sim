import { readFile } from "node:fs/promises";
import { test } from "vitest";

const combatGateFiles = [
  "block-actions.ts",
  "counter-card-use.ts",
  "damage-step-continuation.ts",
  "resolution.ts",
] as const;

test("combat gates do not import raw protection support helpers", async ({
  expect,
}) => {
  for (const file of combatGateFiles) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");

    expect(source, file).not.toContain("hasOnlyBattleIrrelevantProtections");
    expect(source, file).not.toContain(
      "../replacement/field-removal-protection.js",
    );
  }
});
