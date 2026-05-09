import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

async function readJsonFixture(relativePath: string): Promise<unknown> {
  const source = await readFile(path.join(repoRoot, relativePath), "utf8");
  return JSON.parse(source) as unknown;
}

describe("Poneglyph fixtures", () => {
  it("checks in the required card-detail fixtures", async () => {
    const doflamingo = await readJsonFixture(
      "fixtures/poneglyph/cards/OP01-060.donquixote-doflamingo.json",
    );
    const rebecca = await readJsonFixture(
      "fixtures/poneglyph/cards/OP05-091.rebecca.json",
    );

    expect(doflamingo).toMatchObject({
      card_number: "OP01-060",
      name: "Donquixote Doflamingo",
    });
    expect(rebecca).toMatchObject({
      card_number: "OP05-091",
      name: "Rebecca",
    });
  });

  it("checks in the OpenAPI fixture with expected Poneglyph endpoints", async () => {
    const openApi = await readJsonFixture(
      "fixtures/poneglyph/openapi.optcg-api-0.1.0.json",
    );

    expect(openApi).toMatchObject({
      paths: {
        "/v1/cards/{card_number}": expect.any(Object) as unknown,
        "/v1/cards/batch": expect.any(Object) as unknown,
        "/v1/search": expect.any(Object) as unknown,
        "/v1/cards/{card_number}/text": expect.any(Object) as unknown,
        "/v1/formats": expect.any(Object) as unknown,
      },
    });
  });
});
