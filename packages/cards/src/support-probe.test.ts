import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchema } from "ajv";
import { describe, expect, it } from "vitest";
import type { CardId, PoneglyphCardDetail } from "@optcg/types";

import { normalizePoneglyphCardDetail } from "./normalization.js";
import {
  formatSupportProbeBlocker,
  runSupportProbe,
  runSupportProbeCli,
} from "./support-probe.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

function toCardId(value: string): CardId {
  return value as CardId;
}

async function loadOp03044Fixture(): Promise<PoneglyphCardDetail> {
  return loadFixture("OP03-044.kaya.json");
}

async function loadFixture(
  fixtureFileName: string,
): Promise<PoneglyphCardDetail> {
  const source = await readFile(
    path.join(repoRoot, "fixtures/poneglyph/cards", fixtureFileName),
    "utf8",
  );

  return JSON.parse(source) as PoneglyphCardDetail;
}

describe("support probe", () => {
  it("formats blocker output with explicit layer coverage for report/probe integration", () => {
    expect(
      formatSupportProbeBlocker({
        code: "unsupported-primitive",
        component: "source-integrity:fixture-hash-mismatch",
        message: "Fixture source integrity mismatch.",
      }),
    ).toContain("[layer: source-integrity]");
    expect(
      formatSupportProbeBlocker({
        code: "unsupported-primitive",
        component: "review:missing-review-record",
        message: "Review evidence missing.",
      }),
    ).toContain("[layer: review]");
    expect(
      formatSupportProbeBlocker({
        code: "unsupported-primitive",
        component: "test-status:missing-test-evidence",
        message: "Test evidence missing.",
      }),
    ).toContain("[layer: test-status]");
    expect(
      formatSupportProbeBlocker({
        code: "unsupported-primitive",
        component: "trigger:event",
        message: "Trigger category unsupported.",
      }),
    ).toContain("[layer: unsupported-trigger]");
    expect(
      formatSupportProbeBlocker({
        code: "unsupported-primitive",
        component: "payCost:returnDon:self:count-exact",
        message: "Cost category unsupported.",
      }),
    ).toContain("[layer: unsupported-cost]");
    expect(
      formatSupportProbeBlocker({
        code: "unsupported-primitive",
        component: "optionalEffectBlock:onPlay:draw-1:self",
        message: "Optionality category unsupported.",
      }),
    ).toContain("[layer: unsupported-optionality]");
    expect(
      formatSupportProbeBlocker({
        code: "unsupported-primitive",
        component: "condition:yourTurn",
        message: "Condition category unsupported.",
      }),
    ).toContain("[layer: unsupported-condition]");
    expect(
      formatSupportProbeBlocker({
        code: "unsupported-primitive",
        component: "sequence:position:segment2",
        message: "Cardinality category unsupported.",
      }),
    ).toContain("[layer: unsupported-cardinality]");
    expect(
      formatSupportProbeBlocker({
        code: "unsupported-primitive",
        component: "selectTargets:field:public:character:max1",
        message: "Target category unsupported.",
      }),
    ).toContain("[layer: unsupported-target]");
    expect(
      formatSupportProbeBlocker({
        code: "unsupported-primitive",
        component: "card014a:unsupported:duration-until-start-next-turn",
        message: "Duration category unsupported.",
      }),
    ).toContain("[layer: unsupported-duration]");
    expect(
      formatSupportProbeBlocker({
        code: "unsupported-primitive",
        component: "modifyPower:self:permanent",
        message: "Modifier category unsupported.",
      }),
    ).toContain("[layer: unsupported-modifier]");
    expect(
      formatSupportProbeBlocker({
        code: "unsupported-primitive",
        component: "cannotAttack:choose:thisTurn",
        message: "Restriction category unsupported.",
      }),
    ).toContain("[layer: unsupported-restriction]");
    expect(
      formatSupportProbeBlocker({
        code: "unsupported-primitive",
        component: "savedFieldObject:consumer:generic",
        message: "Saved-reference category unsupported.",
      }),
    ).toContain("[layer: unsupported-saved-reference]");
    expect(
      formatSupportProbeBlocker({
        code: "unsupported-primitive",
        component: "destination:owner-deck-bottom",
        message: "Destination category unsupported.",
      }),
    ).toContain("[layer: unsupported-destination]");
    expect(
      formatSupportProbeBlocker({
        code: "unsupported-primitive",
        component: "sequence-action-composition:draw-then-trash",
        message: "Sequence/action composition category unsupported.",
      }),
    ).toContain("[layer: unsupported-sequence-action-composition]");
    expect(
      formatSupportProbeBlocker({
        code: "unsupported-primitive",
        component: "unknown:untrusted",
        message: "Unknown category unsupported.",
      }),
    ).toContain("[layer: unsupported-layer]");
  });

  it("formats conditional keyword-grant trace components as recognition-only diagnostics", () => {
    const text = formatSupportProbeBlocker({
      code: "unparsed-span",
      decomposition: {
        recognizedActionCandidates: ["this Character gains [Rush]"],
        recognizedSyntaxFragments: [
          "if-conditional-wrapper",
          "condition-components:v1",
          "keyword-grant-components:v1",
        ],
        recognizedTriggerCandidates: [],
        reason:
          "Conditional keyword-grant components were recognized, but generated support remains fail-closed.",
        traceComponents: [
          {
            id: "keyword-grant:target:self-character",
            kind: "target",
            status: "supported",
            text: "this Character",
          },
          {
            id: "keyword-grant:verb:gains",
            kind: "verb",
            status: "supported",
            text: "gains",
          },
          {
            id: "keyword-grant:keyword:rush",
            kind: "keyword",
            status: "supported",
            text: "[Rush]",
          },
        ],
        unsupportedConditionFragments: [],
        unsupportedSyntaxFragments: [
          "conditional-keyword-grant:schema-runtime-bridge-missing",
        ],
      },
      message: "Unsupported card text remains after certified parsing.",
    });

    expect(text).toContain(
      "diagnostic recognition only; remains unsupported for generated support",
    );
    expect(text).toContain(
      "recognized supported-action candidate: this Character gains [Rush]",
    );
    expect(text).toContain("recognized target candidate: this Character");
    expect(text).toContain("recognized verb candidate: gains");
    expect(text).toContain("recognized keyword candidate: [Rush]");
    expect(text).toContain(
      "unsupported syntax blocker: conditional-keyword-grant:schema-runtime-bridge-missing",
    );
  });

  it("formats deepest successful layer for schema/runtime blockers and omits it for parser/stale blockers", () => {
    expect(
      formatSupportProbeBlocker({
        code: "missing-runtime-capability",
        capabilityId: "effect:draw:self:count:positive-safe-integer",
        component: "on-play-draw",
        message: "Missing runtime capability.",
        schemaValidated: true,
      }),
    ).toContain("[deepest-successful-layer: schema]");
    expect(
      formatSupportProbeBlocker({
        code: "missing-runtime-capability",
        capabilityId: "effect:draw:self:count:positive-safe-integer",
        component: "on-play-draw",
        message: "Missing runtime capability.",
        schemaValidated: true,
      }),
    ).toContain("[component: on-play-draw]");

    expect(
      formatSupportProbeBlocker({
        code: "invalid-dsl-schema",
        component: "/effects/0/type must be string",
        message: "Generated DSL failed effect DSL schema validation.",
      }),
    ).toContain("[deepest-successful-layer: parser]");

    expect(
      formatSupportProbeBlocker({
        code: "unparsed-span",
        message: "Card text is not covered by certified parser rules.",
        span: { start: 0, end: 9, text: "two cards" },
      }),
    ).not.toContain("[deepest-successful-layer:");

    expect(
      formatSupportProbeBlocker({
        code: "stale-hash",
        expectedHash: "sha256:old",
        message: "Poneglyph text hash changed.",
        receivedHash: "sha256:new",
      }),
    ).not.toContain("[deepest-successful-layer:");
  });

  it("runs CLI path with injected fetch and prints playable output without live network", async () => {
    const detail = await loadOp03044Fixture();
    const normalized = normalizePoneglyphCardDetail(detail);
    const output: string[] = [];
    const fetchCalls: string[] = [];

    const exitCode = await runSupportProbeCli(
      [
        "--card",
        "OP03-044",
        "--expected-source-text-hash",
        normalized.sourceTextHash,
        "--expected-behavior-hash",
        normalized.behaviorHash,
      ],
      {
        cwd: repoRoot,
        fetch: (url) => {
          fetchCalls.push(url);
          return Promise.resolve({
            json: () => Promise.resolve(detail),
            ok: true,
            status: 200,
          });
        },
        stderr: {
          write(): boolean {
            return true;
          },
        },
        stdout: {
          write(chunk: string | Uint8Array): boolean {
            output.push(String(chunk));
            return true;
          },
        },
      },
    );

    const text = output.join("");
    expect(exitCode).toBe(0);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]).toContain("/v1/cards/OP03-044");
    expect(text).toContain("Playable: yes");
    expect(text).toContain("op03-044.generated-support");
  });

  it("reports stale blockers when live detail drifts from reviewed hash evidence", async () => {
    const detail = await loadOp03044Fixture();
    const normalized = normalizePoneglyphCardDetail(detail);
    const output: string[] = [];

    const exitCode = await runSupportProbeCli(
      [
        "--card",
        "OP03-044",
        "--expected-source-text-hash",
        normalized.sourceTextHash,
        "--expected-behavior-hash",
        normalized.behaviorHash,
      ],
      {
        cwd: repoRoot,
        fetch: () =>
          Promise.resolve({
            json: () =>
              Promise.resolve({
                ...detail,
                name: "Kaya Drifted",
              }),
            ok: true,
            status: 200,
          }),
        stderr: {
          write(): boolean {
            return true;
          },
        },
        stdout: {
          write(chunk: string | Uint8Array): boolean {
            output.push(String(chunk));
            return true;
          },
        },
      },
    );

    const text = output.join("");
    expect(exitCode).toBe(0);
    expect(text).toContain("Playable: no");
    expect(text).toContain("stale-hash");
    expect(text).toContain("Poneglyph behavior hash changed.");
  });

  it("prioritizes stale-hash blockers ahead of parser/scanner diagnostics", async () => {
    const detail = await loadOp03044Fixture();
    const normalized = normalizePoneglyphCardDetail(detail);
    const output: string[] = [];

    const exitCode = await runSupportProbe({
      cardId: toCardId("CARD-020B-STALE-FIRST"),
      expectedSourceTextHash: normalized.sourceTextHash,
      getCard: () =>
        Promise.resolve({
          ...detail,
          card_number: "CARD-020B-STALE-FIRST",
          effect:
            "[On Play] Place up to 1 of your opponent's Characters with 1000 power or less at the bottom of the owner's deck.",
          name: "CARD-020B stale hash priority",
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
    expect(text).toContain("Playable: no");
    expect(text).toContain("stale-hash");
    expect(text).not.toContain("unparsed-span");
    expect(text).not.toContain("recognized trigger candidate");
  });

  it("returns CLI parse error to stderr when --card is missing", async () => {
    const stderr: string[] = [];

    const exitCode = await runSupportProbeCli([], {
      cwd: repoRoot,
      fetch: () =>
        Promise.reject(new Error("fetch should not run when argv is invalid")),
      stderr: {
        write(chunk: string | Uint8Array): boolean {
          stderr.push(String(chunk));
          return true;
        },
      },
      stdout: {
        write(): boolean {
          return true;
        },
      },
    });

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toContain("Missing --card <id>.");
  });

  it("returns CLI parse error to stderr when duplicate --card is supplied", async () => {
    const stderr: string[] = [];

    const exitCode = await runSupportProbeCli(
      ["--card", "OP03-044", "--card", "OP03-045"],
      {
        cwd: repoRoot,
        fetch: () =>
          Promise.reject(
            new Error("fetch should not run when argv is invalid"),
          ),
        stderr: {
          write(chunk: string | Uint8Array): boolean {
            stderr.push(String(chunk));
            return true;
          },
        },
        stdout: {
          write(): boolean {
            return true;
          },
        },
      },
    );

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toContain("Exactly one --card value is required.");
  });

  it("prints OP03-044 generated-support playable evidence from injected Poneglyph detail", async () => {
    const detail = await loadOp03044Fixture();
    const output: string[] = [];

    const exitCode = await runSupportProbe({
      cardId: toCardId("OP03-044"),
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
    expect(text).toContain("Playable: yes");
    expect(text).toContain("op03-044.generated-support");
    expect(text).toContain("card_type: Character");
    expect(text).toContain("color: Blue");
    expect(text).toContain("cost: 1");
    expect(text).toContain("power: 0");
    expect(text).toContain("counter: 2000");
    expect(text).toContain("types: East Blue");
    expect(text).toContain("trigger: null");
    expect(text).toContain(
      "effect: [On Play] Draw 2 cards and trash 2 cards from your hand.",
    );
  });

  it("prints playable no and blocker evidence for unsupported generated-support detail", async () => {
    const detail = await loadOp03044Fixture();
    const output: string[] = [];

    const exitCode = await runSupportProbe({
      cardId: toCardId("OP03-999"),
      getCard: () =>
        Promise.resolve({
          ...detail,
          card_number: "OP03-999",
          effect: "[On Play] Draw 1 card. Then rest 1 DON!!.",
          name: "Unsupported Template Candidate",
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
    expect(text).toContain("Playable: no");
    expect(text).toMatch(/Blockers:/);
    expect(text).toMatch(/unparsed-span|missing-runtime-capability/);
    expect(text).toContain("layer: parser");
    expect(text).toContain('span: "Then rest 1 DON!!."');
  });

  it("prints only the unsupported span for mixed [Blocker] plus unsupported opponent-turn text", async () => {
    const detail = await loadOp03044Fixture();
    const output: string[] = [];

    const exitCode = await runSupportProbe({
      cardId: toCardId("OP03-045"),
      getCard: () =>
        Promise.resolve({
          ...detail,
          card_number: "OP03-045",
          effect:
            "[Blocker] (After your opponent declares an attack, you may rest this card to make it the new target of the attack.)\n[Opponent's Turn] This Character gains +1000 power.",
          keyword: ["Blocker"],
          name: "Mixed Blocker Unsupported Candidate",
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
    expect(text).toContain("Playable: no");
    expect(text).toContain(
      'span: "[Opponent\'s Turn] This Character gains +1000 power."',
    );
    expect(text).not.toContain('span: "[Blocker]"');
  });

  it("prints only Neptunian unsupported residue for mixed EB04-011 Rush: Character text", async () => {
    const detail = await loadFixture("EB04-011.scaled-neptunian.json");
    const output: string[] = [];

    const exitCode = await runSupportProbe({
      cardId: toCardId("EB04-011"),
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
    expect(text).toContain("Playable: no");
    expect(text).toContain("layer: parser");
    expect(text).toContain(
      'span: "[On Play] Draw a card for each of your {Neptunian} type Characters. Then, trash the same number of cards from your hand."',
    );
    expect(text).not.toContain('span: "[Rush: Character]');
  });

  it("prints parser/source-span diagnostics for unsupported word-number text", async () => {
    const detail = await loadOp03044Fixture();
    const output: string[] = [];

    const exitCode = await runSupportProbe({
      cardId: toCardId("CARD-015A-WORD-NUMBER"),
      getCard: () =>
        Promise.resolve({
          ...detail,
          card_number: "CARD-015A-WORD-NUMBER",
          effect: "[On Play] Draw two cards.",
          name: "Word Number Unsupported Candidate",
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
    expect(text).toContain("Playable: no");
    expect(text).toContain("unparsed-span");
    expect(text).toContain("layer: parser");
    expect(text).toContain('span: "[On Play] Draw two cards."');
  });

  it("prints reusable trace components for EB02-027-style bottom-deck parser failures", async () => {
    const detail = await loadOp03044Fixture();
    const output: string[] = [];

    const exitCode = await runSupportProbe({
      cardId: toCardId("CARD-016A-PROBE-BOTTOM-DECK"),
      getCard: () =>
        Promise.resolve({
          ...detail,
          card_number: "CARD-016A-PROBE-BOTTOM-DECK",
          effect:
            "[On Play] Place up to 1 of your opponent's Characters with 1000 power or less at the bottom of the owner's deck.",
          name: "Bottom Deck Trace Probe Candidate",
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
    expect(text).toContain("Playable: no");
    expect(text).toContain(
      "diagnostic recognition only; remains unsupported for generated support",
    );
    expect(text).toContain("recognized trigger candidate: [On Play]");
    expect(text).toContain("recognized cardinality candidate: up to 1");
    expect(text).toContain(
      "recognized target candidate: your opponent's Characters",
    );
    expect(text).toContain(
      "recognized predicate candidate: 1000 power or less",
    );
    expect(text).toContain(
      "recognized action candidate: place at the bottom of the owner's deck",
    );
    expect(text).toContain(
      "unsupported destination blocker: bottom of the owner's deck",
    );
    expect(text).toContain(
      "unsupported syntax blocker: action/destination:bottom-of-owner-deck",
    );
    expect(text).toContain(
      "unsupported component blocker: bottom of the owner's deck",
    );
    expect(text).not.toContain("condition conjunction: or");
  });

  it("keeps unsupported parser diagnostics as recognition-only metadata and does not imply playability", async () => {
    const detail = await loadOp03044Fixture();
    const output: string[] = [];

    const exitCode = await runSupportProbe({
      cardId: toCardId("CARD-020B-UNSUPPORTED-RECOGNIZED"),
      getCard: () =>
        Promise.resolve({
          ...detail,
          card_number: "CARD-020B-UNSUPPORTED-RECOGNIZED",
          effect:
            "[On Play] Place up to 1 of your opponent's Characters with 1000 power or less at the bottom of the owner's deck.",
          name: "CARD-020B recognized but unsupported",
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
    expect(text).toContain("Playable: no");
    expect(text).toContain(
      "diagnostic recognition only; remains unsupported for generated support",
    );
    expect(text).toContain("recognized trigger candidate: [On Play]");
    expect(text).toContain(
      "unsupported syntax blocker: action/destination:bottom-of-owner-deck",
    );
  });

  it("prints parser-layer blockers for unsupported On K.O. continuous generated-support text", async () => {
    const detail = await loadOp03044Fixture();
    const output: string[] = [];

    const exitCode = await runSupportProbe({
      cardId: toCardId("CARD-018A-PROBE-ON-KO-CONTINUOUS"),
      getCard: () =>
        Promise.resolve({
          ...detail,
          card_number: "CARD-018A-PROBE-ON-KO-CONTINUOUS",
          effect:
            "[On K.O.] This Character gets +1000 power while this card is on the field.",
          name: "On KO Continuous Probe Candidate",
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
    expect(text).toContain("Playable: no");
    expect(text).toContain("unparsed-span");
    expect(text).toContain("layer: parser");
    expect(text).toContain(
      'span: "[On K.O.] This Character gets +1000 power while this card is on the field."',
    );
  });

  it("prints metadata layer for empty-effect metadata precondition blockers", async () => {
    const detail = await loadOp03044Fixture();
    const output: string[] = [];

    const exitCode = await runSupportProbe({
      cardId: toCardId("CARD-014I-UNKNOWN"),
      getCard: () =>
        Promise.resolve({
          ...detail,
          card_number: "CARD-014I-UNKNOWN",
          card_type: "Event",
          effect: null,
          name: "Unknown Layer Candidate",
          power: null,
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
    expect(text).toContain("Playable: no");
    expect(text).toContain("layer: metadata");
  });

  it("prints metadata layer for certified keyword metadata precondition blockers", async () => {
    const detail = await loadOp03044Fixture();
    const output: string[] = [];

    const exitCode = await runSupportProbe({
      cardId: toCardId("CARD-014I-METADATA"),
      getCard: () =>
        Promise.resolve({
          ...detail,
          card_number: "CARD-014I-METADATA",
          card_type: "Event",
          effect:
            "[Blocker] (After your opponent declares an attack, you may rest this card to make it the new target of the attack.)",
          keyword: ["Blocker"],
          name: "Metadata Layer Candidate",
          power: null,
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
    expect(text).toContain("Playable: no");
    expect(text).toContain("unsupported-primitive");
    expect(text).toContain("layer: metadata");
  });

  it("does not create, delete, or rewrite fixture, manifest, report, or cache files when probing via CLI", async () => {
    const detail = await loadOp03044Fixture();
    const sensitivePaths = [
      "fixtures/poneglyph/cards",
      "fixtures/cards",
      "fixtures/generated-support-report.json",
      "fixtures/generated-support",
      ".cache",
      "cache",
      "tmp/cards-cache",
      "packages/cards/.cache",
    ].map((relativePath) => path.join(repoRoot, relativePath));

    const before = await snapshotRecursiveFileHashes(sensitivePaths);

    const exitCode = await runSupportProbeCli(["--card", "OP03-044"], {
      cwd: repoRoot,
      fetch: () =>
        Promise.resolve({
          json: () => Promise.resolve(detail),
          ok: true,
          status: 200,
        }),
      stderr: {
        write(): boolean {
          return true;
        },
      },
      stdout: {
        write(): boolean {
          return true;
        },
      },
    });
    const after = await snapshotRecursiveFileHashes(sensitivePaths);

    expect(exitCode).toBe(0);
    expect(after).toEqual(before);
  });

  it("accepts question-mark leader attribute filters in effect DSL schema", () => {
    const schema = JSON.parse(
      readFileSync(
        path.join(repoRoot, "contracts/effect-dsl.schema.json"),
        "utf8",
      ),
    ) as AnySchema;
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
      schema,
    );
    const definition = {
      cardId: "OP13-079",
      implementationStatus: "implemented-dsl",
      effects: [
        {
          id: "op13-079.leader-question-mark-attribute-check",
          category: "activate",
          trigger: { type: "activateMain" },
          effect: {
            type: "draw",
            count: 1,
            player: "self",
          },
          condition: {
            type: "hasCardInZone",
            zone: "leaderArea",
            player: "self",
            filter: {
              categories: ["leader"],
              attributesAny: ["?"],
            },
          },
        },
      ],
      metadata: {
        sourceTextHash: "sha256:test",
        rulesVersion: "generated-support-v1",
        effectDefinitionsVersion: "generated-support-v1",
        tested: true,
      },
    };

    expect(validate(definition)).toBe(true);
    expect(validate.errors).toBeNull();
  });
});

type PathSnapshotEntry = {
  exists: boolean;
  files: Record<string, string>;
  path: string;
};

async function snapshotRecursiveFileHashes(
  paths: string[],
): Promise<PathSnapshotEntry[]> {
  const snapshots: PathSnapshotEntry[] = [];

  for (const targetPath of paths) {
    snapshots.push(await snapshotPathRecursive(targetPath));
  }

  return snapshots;
}

async function snapshotPathRecursive(
  targetPath: string,
): Promise<PathSnapshotEntry> {
  try {
    const stats = await stat(targetPath);
    const files: Record<string, string> = {};

    if (stats.isDirectory()) {
      await collectDirectoryFileHashes(targetPath, targetPath, files);
      return {
        exists: true,
        files,
        path: targetPath,
      };
    }

    files["."] = await hashFile(targetPath);
    return {
      exists: true,
      files,
      path: targetPath,
    };
  } catch (error) {
    if (isEnoent(error)) {
      return {
        exists: false,
        files: {},
        path: targetPath,
      };
    }

    throw error;
  }
}

async function collectDirectoryFileHashes(
  rootPath: string,
  currentPath: string,
  files: Record<string, string>,
): Promise<void> {
  const children = (await readdir(currentPath)).sort();

  for (const child of children) {
    const absoluteChildPath = path.join(currentPath, child);
    const childStats = await stat(absoluteChildPath);

    if (childStats.isDirectory()) {
      await collectDirectoryFileHashes(rootPath, absoluteChildPath, files);
      continue;
    }

    const relativeChildPath =
      path.relative(rootPath, absoluteChildPath).replace(/\\/g, "/") || ".";
    files[relativeChildPath] = await hashFile(absoluteChildPath);
  }
}

async function hashFile(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

function isEnoent(error: unknown): error is { code: "ENOENT" } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
