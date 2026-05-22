import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CardId, PoneglyphCardDetail } from "@optcg/types";

import { runSupportProbe } from "./support-probe.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

describe("support probe proof certificate", () => {
  it("prints generated-support proof certificate chain in order", async () => {
    const detail = await loadFixture("OP03-044.kaya.json");
    const output: string[] = [];

    const exitCode = await runSupportProbe({
      cardId: "OP03-044" as CardId,
      getCard: () => Promise.resolve(detail),
      stdout: {
        write(chunk: string | Uint8Array): boolean {
          output.push(String(chunk));
          return true;
        },
      },
    });

    const text = output.join("");
    expect(exitCode).toBe(0);
    expect(text).toContain("Generated-support proof certificate:");
    expect(text).toContain("- source hash status: passed");
    expect(text).toContain("- behavior hash status: passed");
    expect(text).toContain("- parse completeness: passed");
    expect(text).toContain("- parser-rule certification/evidence: passed");
    expect(text).toContain("- generated DSL schema: passed");
    expect(text).toContain(
      "- component evidence IDs: passed (on-play-draw-then-trash-from-hand)",
    );
    expect(text).toContain("- required runtime capability IDs: passed");
    expect(text).toContain("- missing runtime capability IDs: passed (none)");
    expect(text).toContain("- engine-proof/test-evidence: passed");
    expect(text).toContain("- support metadata gate: passed");
    expect(text).toContain("- review state gate: passed");
    expect(text).toContain("- tested-state gate: passed");
    expect(text).toContain("- final playable decision: yes");

    const positions = [
      "- source hash status:",
      "- behavior hash status:",
      "- parse completeness:",
      "- parser-rule certification/evidence:",
      "- generated DSL schema:",
      "- component evidence IDs:",
      "- required runtime capability IDs:",
      "- missing runtime capability IDs:",
      "- engine-proof/test-evidence:",
      "- support metadata gate:",
      "- review state gate:",
      "- tested-state gate:",
      "- final playable decision:",
    ].map((snippet) => text.indexOf(snippet));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual(
      [...positions].sort((left, right) => left - right),
    );
  });

  it("reports non-runtime-only deck-rule evidence with not-applicable component/runtime requirement layers", async () => {
    const detail = await loadFixture("OP03-044.kaya.json");
    const output: string[] = [];

    const exitCode = await runSupportProbe({
      cardId: "SUP-003E-NON-RUNTIME" as CardId,
      getCard: () =>
        Promise.resolve({
          ...detail,
          card_number: "SUP-003E-NON-RUNTIME",
          effect:
            "Under the rules of this game, you cannot include Events with a cost of 2 or more in your deck.",
          name: "SUP-003E non-runtime only",
        }),
      stdout: {
        write(chunk: string | Uint8Array): boolean {
          output.push(String(chunk));
          return true;
        },
      },
    });

    const text = output.join("");
    expect(exitCode).toBe(0);
    expect(text).toContain("- parse completeness: passed");
    expect(text).toContain("- parser-rule certification/evidence: passed");
    expect(text).toContain("- component evidence IDs: not-applicable");
    expect(text).toContain(
      "- required runtime capability IDs: not-applicable (none)",
    );
    expect(text).toContain("- engine-proof/test-evidence: not-applicable");
    expect(text).toContain("Playable: no");
  });

  it("preserves non-runtime evidence while keeping runtime proof layers for mixed deck-rule plus runtime text", async () => {
    const detail = await loadFixture("OP03-044.kaya.json");
    const output: string[] = [];

    const exitCode = await runSupportProbe({
      cardId: "SUP-003E-MIXED" as CardId,
      getCard: () =>
        Promise.resolve({
          ...detail,
          card_number: "SUP-003E-MIXED",
          effect:
            "Under the rules of this game, you cannot include Events with a cost of 2 or more in your deck.\n[On Play] Draw 1 card.",
          name: "SUP-003E mixed non-runtime runtime",
        }),
      stdout: {
        write(chunk: string | Uint8Array): boolean {
          output.push(String(chunk));
          return true;
        },
      },
    });

    const text = output.join("");
    expect(exitCode).toBe(0);
    expect(text).toContain("Playable: yes");
    expect(text).toContain("- component evidence IDs: passed");
    expect(text).toContain("- required runtime capability IDs: passed");
    expect(text).toContain(
      "exact:external-deck-rule:category-cost-gte-in-your-deck",
    );
  });
});

async function loadFixture(
  fixtureFileName: string,
): Promise<PoneglyphCardDetail> {
  const source = await readFile(
    path.join(repoRoot, "fixtures/poneglyph/cards", fixtureFileName),
    "utf8",
  );

  return JSON.parse(source) as PoneglyphCardDetail;
}
