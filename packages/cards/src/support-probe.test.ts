import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CardId, PoneglyphCardDetail } from "@optcg/types";

import { normalizePoneglyphCardDetail } from "./normalization.js";
import { runSupportProbe, runSupportProbeCli } from "./support-probe.js";

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
  const source = await readFile(
    path.join(repoRoot, "fixtures/poneglyph/cards/OP03-044.kaya.json"),
    "utf8",
  );

  return JSON.parse(source) as PoneglyphCardDetail;
}

describe("support probe", () => {
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
    expect(text).toContain('span: "Then rest 1 DON!!."');
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
