import { readFile } from "node:fs/promises";
import { test } from "vitest";

const continuationModules = [
  "owner-deck-bottom-decision.ts",
  "pay-cost-actions.ts",
  "rest-target-decision.ts",
  "trash-from-hand-actions.ts",
] as const;

test("replacement continuation modules use the shared stored-process gate", async ({
  expect,
}) => {
  for (const module of continuationModules) {
    const source = await readFile(new URL(module, import.meta.url), "utf8");

    expect(source, module).not.toContain("state.replacementState.find(");
    expect(source, module).not.toContain(
      "const replacementPayloadWithoutPending",
    );
  }
});
