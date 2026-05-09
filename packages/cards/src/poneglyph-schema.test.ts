import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { validatePoneglyphCardDetail } from "./poneglyph-schema.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

async function readJsonFixture(relativePath: string): Promise<unknown> {
  const source = await readFile(path.join(repoRoot, relativePath), "utf8");
  return JSON.parse(source) as unknown;
}

describe("Poneglyph card-detail validation", () => {
  it("accepts the checked-in OP01-060 and OP05-091 fixtures", async () => {
    const doflamingo = validatePoneglyphCardDetail(
      await readJsonFixture(
        "fixtures/poneglyph/cards/OP01-060.donquixote-doflamingo.json",
      ),
    );
    const rebecca = validatePoneglyphCardDetail(
      await readJsonFixture("fixtures/poneglyph/cards/OP05-091.rebecca.json"),
    );

    expect(doflamingo.card_number).toBe("OP01-060");
    expect(rebecca.card_number).toBe("OP05-091");
  });

  it("rejects malformed card-detail payloads with a clear error", () => {
    expect(() =>
      validatePoneglyphCardDetail({
        card_number: "OP01-060",
        name: "Incomplete",
      }),
    ).toThrow(/Invalid Poneglyph card detail/);
  });

  it("rejects search-result-shaped payloads as card-detail sources", () => {
    expect(() =>
      validatePoneglyphCardDetail({
        data: [
          {
            card_number: "OP01-060",
            name: "Donquixote Doflamingo",
            variants: [],
          },
        ],
        meta: { total: 1 },
      }),
    ).toThrow(/Invalid Poneglyph card detail/);
  });
});
