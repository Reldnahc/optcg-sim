import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

describe("useMatchAppSession", () => {
  test("memoizes decision and card catalog callbacks", async () => {
    const source = await readFile(
      join(sourceDirectory, "use-match-app-session.ts"),
      "utf8",
    );

    assert.match(source, /import \{ useCallback, useMemo \} from "react";/u);
    for (const callbackName of [
      "submitVisibleDecisionOptionFallback",
      "submitVisibleDecisionActionOption",
      "submitVisibleDecisionQuantity",
      "confirmVisibleDecisionFallback",
      "cardDisplay",
      "cardModel",
    ]) {
      assert.match(
        source,
        new RegExp(`const ${callbackName} = useCallback\\(`, "u"),
      );
    }
  });
});
