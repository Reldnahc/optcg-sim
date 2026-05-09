import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { normalizePoneglyphCardDetail } from "./normalization.js";
import {
  mergeSimulatorOverlay,
  validateSimulatorOverlayRegistry,
} from "./overlay.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

async function readJsonFixture(relativePath: string): Promise<unknown> {
  const source = await readFile(path.join(repoRoot, relativePath), "utf8");
  return JSON.parse(source) as unknown;
}

async function normalizedRebecca() {
  return normalizePoneglyphCardDetail(
    await readJsonFixture("fixtures/poneglyph/cards/OP05-091.rebecca.json"),
  );
}

describe("simulator overlay merge", () => {
  it("uses overlay support status and effectDefinitionId as gameplay authority", async () => {
    const normalized = await normalizedRebecca();
    const merged = mergeSimulatorOverlay(normalized, {
      cardId: "OP05-091",
      effectDefinitionId: "op05-091.blocker-on-play-v1",
      support: {
        behaviorHash: normalized.behaviorHash,
        cardDataVersion: "cards-2026-05-09",
        cardId: "OP05-091",
        effectDefinitionId: "op05-091.blocker-on-play-v1",
        rulesVersion: "rules-2026-05-09",
        sourceTextHash: normalized.sourceTextHash,
        status: "implemented-dsl",
        tested: true,
      },
    });

    expect(merged.card.support.status).toBe("implemented-dsl");
    expect(merged.card.support.effectDefinitionId).toBe(
      "op05-091.blocker-on-play-v1",
    );
    expect(merged.overlay.effectDefinitionId).toBe(
      "op05-091.blocker-on-play-v1",
    );
  });

  it("keeps raw Poneglyph detail out of the merged engine-facing card", async () => {
    const normalized = await normalizedRebecca();
    const merged = mergeSimulatorOverlay(normalized);

    expect(normalized.raw).toBeDefined();
    expect("raw" in merged.card).toBe(false);
  });

  it("preserves sourceTextHash and behaviorHash from overlay support metadata", async () => {
    const normalized = await normalizedRebecca();
    const merged = mergeSimulatorOverlay(normalized, {
      cardId: "OP05-091",
      support: {
        behaviorHash: "reviewed-behavior-hash",
        cardDataVersion: "cards-reviewed",
        cardId: "OP05-091",
        rulesVersion: "rules-reviewed",
        sourceTextHash: "reviewed-source-hash",
        status: "implemented-custom",
        tested: true,
      },
    });

    expect(merged.card.behaviorHash).toBe(normalized.behaviorHash);
    expect(merged.card.sourceTextHash).toBe(normalized.sourceTextHash);
    expect(merged.card.support.behaviorHash).toBe("reviewed-behavior-hash");
    expect(merged.card.support.sourceTextHash).toBe("reviewed-source-hash");
  });

  it("merges customHandlerIds plus tested and version metadata from overlay support", async () => {
    const normalized = await normalizedRebecca();
    const merged = mergeSimulatorOverlay(normalized, {
      cardId: "OP05-091",
      customHandlerIds: ["op05-091.custom-handler"],
      support: {
        behaviorHash: normalized.behaviorHash,
        cardDataVersion: "cards-v1",
        cardId: "OP05-091",
        customHandlerIds: ["op05-091.custom-handler"],
        rulesVersion: "rules-v1",
        sourceTextHash: normalized.sourceTextHash,
        status: "implemented-custom",
        tested: true,
      },
    });

    expect(merged.card.support.customHandlerIds).toEqual([
      "op05-091.custom-handler",
    ]);
    expect(merged.card.support.tested).toBe(true);
    expect(merged.card.support.rulesVersion).toBe("rules-v1");
    expect(merged.card.support.cardDataVersion).toBe("cards-v1");
    expect(merged.overlay.customHandlerIds).toEqual([
      "op05-091.custom-handler",
    ]);
  });

  it("merges banlist, simulator status tags, ruling notes, and notes from overlay", async () => {
    const normalized = await normalizedRebecca();
    const merged = mergeSimulatorOverlay(normalized, {
      banlist: [
        {
          cardId: "OP05-091",
          effectiveFrom: "2026-05-09",
          format: "standard",
          maxCopies: 0,
          reason: "Simulator safety hold",
          status: "simulatorBanned",
        },
      ],
      cardId: "OP05-091",
      rulingNotes: [
        {
          source: "simulator-note",
          text: "Requires reviewed sequence-local target handling.",
        },
      ],
      simulatorTags: ["simulator-status:blocked"],
      support: {
        behaviorHash: normalized.behaviorHash,
        cardDataVersion: "cards-v1",
        cardId: "OP05-091",
        notes: "Blocked until target handling is reviewed.",
        rulesVersion: "rules-v1",
        sourceTextHash: normalized.sourceTextHash,
        status: "banned-in-simulator",
        tested: false,
      },
    });

    expect(merged.card.support.status).toBe("banned-in-simulator");
    expect(merged.card.support.notes).toBe(
      "Blocked until target handling is reviewed.",
    );
    expect(merged.overlay.banlist).toHaveLength(1);
    expect(merged.overlay.rulingNotes).toHaveLength(1);
    expect(merged.overlay.simulatorTags).toEqual(["simulator-status:blocked"]);
  });

  it("fails closed on malformed or mismatched overlay records", async () => {
    const normalized = await normalizedRebecca();

    expect(() =>
      mergeSimulatorOverlay(normalized, {
        cardId: "OP05-091",
        support: {
          cardId: "OP05-091",
          status: "implemented-dsl",
        },
      }),
    ).toThrow(/Invalid simulator overlay/);

    expect(() =>
      mergeSimulatorOverlay(normalized, {
        cardId: "OP01-060",
        support: {
          behaviorHash: normalized.behaviorHash,
          cardDataVersion: "cards-v1",
          cardId: "OP01-060",
          rulesVersion: "rules-v1",
          sourceTextHash: normalized.sourceTextHash,
          status: "implemented-dsl",
          tested: true,
        },
      }),
    ).toThrow(/does not match normalized card OP05-091/);
  });

  it("fails closed when top-level overlay effect metadata disagrees with support metadata", async () => {
    const normalized = await normalizedRebecca();

    expect(() =>
      mergeSimulatorOverlay(normalized, {
        cardId: "OP05-091",
        effectDefinitionId: "op05-091.overlay-effect",
        support: {
          behaviorHash: normalized.behaviorHash,
          cardDataVersion: "cards-v1",
          cardId: "OP05-091",
          effectDefinitionId: "op05-091.support-effect",
          rulesVersion: "rules-v1",
          sourceTextHash: normalized.sourceTextHash,
          status: "implemented-dsl",
          tested: true,
        },
      }),
    ).toThrow(/effectDefinitionId/i);

    expect(() =>
      mergeSimulatorOverlay(normalized, {
        cardId: "OP05-091",
        customHandlerIds: ["op05-091.overlay-handler"],
        support: {
          behaviorHash: normalized.behaviorHash,
          cardDataVersion: "cards-v1",
          cardId: "OP05-091",
          customHandlerIds: ["op05-091.support-handler"],
          rulesVersion: "rules-v1",
          sourceTextHash: normalized.sourceTextHash,
          status: "implemented-custom",
          tested: true,
        },
      }),
    ).toThrow(/customHandlerIds/i);
  });

  it("validates overlay registries keyed by card ID", async () => {
    const normalized = await normalizedRebecca();
    const registry = validateSimulatorOverlayRegistry({
      "OP05-091": {
        cardId: "OP05-091",
        support: {
          behaviorHash: normalized.behaviorHash,
          cardDataVersion: "cards-v1",
          cardId: "OP05-091",
          rulesVersion: "rules-v1",
          sourceTextHash: normalized.sourceTextHash,
          status: "implemented-dsl",
          tested: true,
        },
      },
    });

    expect(
      Object.values(registry).map((overlay) => overlay.support.status),
    ).toEqual(["implemented-dsl"]);
  });

  it("fails closed when overlay registry keys or nested card references disagree", async () => {
    const normalized = await normalizedRebecca();

    expect(() =>
      validateSimulatorOverlayRegistry({
        "OP05-091": {
          cardId: "OP01-060",
          support: {
            behaviorHash: normalized.behaviorHash,
            cardDataVersion: "cards-v1",
            cardId: "OP01-060",
            rulesVersion: "rules-v1",
            sourceTextHash: normalized.sourceTextHash,
            status: "implemented-dsl",
            tested: true,
          },
        },
      }),
    ).toThrow(/registry key OP05-091/);

    expect(() =>
      validateSimulatorOverlayRegistry({
        "OP05-091": {
          banlist: [
            {
              cardId: "OP01-060",
              effectiveFrom: "2026-05-09",
              format: "standard",
              status: "simulatorBanned",
            },
          ],
          cardId: "OP05-091",
          support: {
            behaviorHash: normalized.behaviorHash,
            cardDataVersion: "cards-v1",
            cardId: "OP05-091",
            rulesVersion: "rules-v1",
            sourceTextHash: normalized.sourceTextHash,
            status: "implemented-dsl",
            tested: true,
          },
        },
      }),
    ).toThrow(/banlist cardId OP01-060/);
  });

  it("fails closed on unknown overlay metadata fields", async () => {
    const normalized = await normalizedRebecca();

    expect(() =>
      mergeSimulatorOverlay(normalized, {
        cardId: "OP05-091",
        inferredFromPrintedText: true,
        support: {
          behaviorHash: normalized.behaviorHash,
          cardDataVersion: "cards-v1",
          cardId: "OP05-091",
          rulesVersion: "rules-v1",
          sourceTextHash: normalized.sourceTextHash,
          status: "implemented-dsl",
          tested: true,
        },
      }),
    ).toThrow(/Invalid simulator overlay/);
  });

  it("fails closed on empty required support metadata", async () => {
    const normalized = await normalizedRebecca();

    expect(() =>
      mergeSimulatorOverlay(normalized, {
        cardId: "OP05-091",
        support: {
          behaviorHash: "",
          cardDataVersion: "cards-v1",
          cardId: "OP05-091",
          rulesVersion: "rules-v1",
          sourceTextHash: normalized.sourceTextHash,
          status: "implemented-dsl",
          tested: true,
        },
      }),
    ).toThrow(/Invalid simulator overlay/);
  });

  it("keeps cards unsupported when no overlay is present", async () => {
    const normalized = await normalizedRebecca();
    const merged = mergeSimulatorOverlay(normalized);

    expect(merged.card.support).toMatchObject({
      behaviorHash: normalized.behaviorHash,
      cardDataVersion: "unreviewed",
      cardId: "OP05-091",
      rulesVersion: "unreviewed",
      sourceTextHash: normalized.sourceTextHash,
      status: "unsupported",
      tested: false,
    });
    expect(merged.overlay.support.status).toBe("unsupported");
    expect(merged.overlay.effectDefinitionId).toBeUndefined();
    expect(merged.overlay.customHandlerIds).toBeUndefined();
  });
});
