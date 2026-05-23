import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type ViolationCategory =
  | "exact-full-line-authorization"
  | "exact-wrapper-body-gate"
  | "real-card-id-or-external-list-authorization"
  | "story-named-parser-ownership"
  | "sample-specific-numeric-authorization";

type Finding = {
  category: ViolationCategory;
  file: string;
  line: string;
};
type NonAuthoritativeClassification =
  | "syntax-recognition"
  | "diagnostic-text"
  | "trace-metadata";
type NonAuthoritativeMatch = {
  category: ViolationCategory;
  classification: NonAuthoritativeClassification;
  file: string;
  line: RegExp;
  reason: string;
};

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

const productionFiles = listSupportAuthorityProductionFiles();

const migrationDebtInventory = [] as const;
const closedOutNonAuthoritativeMatches: readonly NonAuthoritativeMatch[] = [
  {
    category: "story-named-parser-ownership",
    classification: "trace-metadata",
    file: "packages/cards/src/certified-card-text-parser.ts",
    line: /certified-parser-rule:CARD-009B/,
    reason:
      "Reviewer label is trace metadata for certification provenance and is not consulted as support authorization authority.",
  },
] as const;

const detectors: ReadonlyArray<{
  category: ViolationCategory;
  regex: RegExp;
}> = [
  {
    category: "exact-wrapper-body-gate",
    regex:
      /wrapper\.prefix\s*!==\s*"\[(On Play|When Attacking|On K\.O\.|Trigger|Activate: Main)\](?: \[Once Per Turn\])? "/,
  },
  {
    category: "exact-full-line-authorization",
    regex:
      /(bodyText|sourceText|wrapper\.bodyText)\s*(===|!==|==|!=)\s*(['"`]).+\3/,
  },
  {
    category: "exact-full-line-authorization",
    regex:
      /(bodyText|sourceText|wrapper\.bodyText)\s*(===|!==|==|!=)\s*[a-zA-Z_$][\w$]*(\[\d+\])?/,
  },
  {
    category: "real-card-id-or-external-list-authorization",
    regex: /\bOP\d{2}-\d{3}\b/,
  },
  {
    category: "story-named-parser-ownership",
    regex: /\b(CARD|ENG|SUP)-\d{3}[A-Z]?\b/,
  },
  {
    category: "sample-specific-numeric-authorization",
    regex:
      /\b(count|drawCount|trashCount|donCount|value|returnDonCount)\s*(===|!==)\s*\d+\b/,
  },
  {
    category: "exact-full-line-authorization",
    regex:
      /\/\^.*(your opponent's Characters|K\\\.O\\\.\s+that\s+Character|from your deck)\.\?\$\/[a-z]*/,
  },
  {
    category: "sample-specific-numeric-authorization",
    regex: /\bSUPPORTED_CARD_014F_[A-Z_]+\b/,
  },
];

describe("CARD-025A support authority anti-shape inventory", () => {
  it("detects forbidden authority shapes in production files and fails on unlisted additions", () => {
    const findings = scanProductionFindings();
    expect(findings).toEqual([]);
  });

  it("keeps migration debt inventory closed out", () => {
    expect(migrationDebtInventory).toEqual([]);
  });

  it("keeps non-authoritative allowances explicit and constrained", () => {
    for (const allowance of closedOutNonAuthoritativeMatches) {
      expect(allowance.reason.trim().length).toBeGreaterThan(0);
      expect([
        "syntax-recognition",
        "diagnostic-text",
        "trace-metadata",
      ]).toContain(allowance.classification);
    }
  });

  it("does not allow production support paths to import this test inventory", () => {
    const sources = productionFiles
      .map((file) => readFileSync(path.join(repoRoot, file), "utf8"))
      .join("\n");

    expect(sources).not.toContain("card-support-authority-shape.test");
    expect(sources).not.toContain("migrationDebtInventory");
  });

  it("regex guards reject forbidden samples and allow legitimate cases", () => {
    expect(
      matchesCategory(
        "exact-full-line-authorization",
        'sourceText === "K.O. that Character."',
      ),
    ).toBe(true);
    expect(
      matchesCategory(
        "exact-wrapper-body-gate",
        'if (wrapper.prefix !== "[On Play] ") {',
      ),
    ).toBe(true);
    expect(
      matchesCategory(
        "real-card-id-or-external-list-authorization",
        'const card = "OP03-044";',
      ),
    ).toBe(true);
    expect(
      matchesCategory(
        "story-named-parser-ownership",
        'const reviewer = "CARD-019B";',
      ),
    ).toBe(true);
    expect(
      matchesCategory(
        "sample-specific-numeric-authorization",
        "if (count === 1) {",
      ),
    ).toBe(true);
    expect(
      matchesCategory(
        "exact-full-line-authorization",
        'return sourceText === " from your deck" || sourceText === " from your deck."',
      ),
    ).toBe(true);
    expect(
      matchesCategory(
        "exact-full-line-authorization",
        "sourceText === candidate[1] ||",
      ),
    ).toBe(true);
    expect(
      matchesCategory(
        "exact-full-line-authorization",
        "sourceText === `${candidate[1]} ${candidate[2]}`,",
      ),
    ).toBe(true);

    expect(
      matchesCategory(
        "exact-full-line-authorization",
        "const regex = /^Draw (\\d+) cards\\.$/;",
      ),
    ).toBe(false);
    expect(
      matchesCategory(
        "exact-full-line-authorization",
        "const tuple = ['[Rush]', '(This card can attack...)'];",
      ),
    ).toBe(false);
    expect(
      matchesCategory(
        "exact-wrapper-body-gate",
        'const prefix = "[On Play] ";',
      ),
    ).toBe(false);
    expect(
      matchesCategory(
        "real-card-id-or-external-list-authorization",
        "support:probe -- --card <card-id>",
      ),
    ).toBe(false);
    expect(
      matchesCategory(
        "story-named-parser-ownership",
        "conditional-support:blocked-until-runtime-capability",
      ),
    ).toBe(false);
    expect(
      matchesCategory(
        "sample-specific-numeric-authorization",
        "if (runtimeClauses.length !== 2) {",
      ),
    ).toBe(false);
    expect(
      matchesCategory(
        "exact-full-line-authorization",
        "return /^ from your deck\\.?$/i.test(sourceText)",
      ),
    ).toBe(false);
    expect(
      matchesCategory(
        "sample-specific-numeric-authorization",
        "if (conditionedDraw.donCount !== SUPPORTED_CARD_014F_ATTACHED_DON_THRESHOLD) {",
      ),
    ).toBe(true);
  });
});

function scanProductionFindings(): Finding[] {
  const findings: Finding[] = [];

  for (const file of productionFiles) {
    const source = readFileSync(path.join(repoRoot, file), "utf8");
    const lines = source.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.length === 0) {
        continue;
      }
      for (const detector of detectors) {
        if (!detector.regex.test(line)) {
          continue;
        }
        if (isAllowedLine(detector.category, file, line)) {
          continue;
        }
        findings.push({ category: detector.category, file, line });
      }
    }
  }

  return dedupeFindings(findings);
}

function isAllowedLine(
  category: ViolationCategory,
  file: string,
  line: string,
): boolean {
  if (
    closedOutNonAuthoritativeMatches.some(
      (allowance) =>
        allowance.category === category &&
        allowance.file === file &&
        allowance.line.test(line),
    )
  ) {
    return true;
  }

  if (category === "sample-specific-numeric-authorization") {
    if (
      file.endsWith("line-separated-composition.ts") &&
      /runtimeClauses\.length/.test(line)
    ) {
      return true;
    }
    if (
      file.endsWith("conditional-generated-support-composer.ts") &&
      /(parsedEffects\.length|bodyParts\.length|parsed\.effects\.length)/.test(
        line,
      )
    ) {
      return true;
    }
    if (
      /noun !== "card"|noun !== "cards"|noun === "card"|noun === "cards"/.test(
        line,
      )
    ) {
      return true;
    }
  }

  if (category === "story-named-parser-ownership") {
    if (!/(parser)/.test(path.basename(file))) {
      return true;
    }
    if (
      /\b(sinceStory|generatedAtStory)\b/.test(line) &&
      !/certified-parser-rule/.test(line)
    ) {
      return true;
    }
  }

  if (
    category === "real-card-id-or-external-list-authorization" &&
    /support-probe\.ts$/.test(file) &&
    /Usage: pnpm --filter/.test(line)
  ) {
    return true;
  }

  return false;
}

function dedupeFindings(findings: readonly Finding[]): Finding[] {
  const byKey = new Map<string, Finding>();
  for (const finding of findings) {
    const key = toFindingKey(finding);
    if (!byKey.has(key)) {
      byKey.set(key, finding);
    }
  }
  return [...byKey.values()];
}

function toFindingKey(finding: Finding): string {
  return `${finding.category}|${finding.file}|${finding.line}`;
}

function matchesCategory(category: ViolationCategory, line: string): boolean {
  return detectors
    .filter((detector) => detector.category === category)
    .some((detector) => detector.regex.test(line));
}

function listSupportAuthorityProductionFiles(): readonly string[] {
  const root = path.join(repoRoot, "packages", "cards", "src");
  const includeName =
    /(generated-support|support|parser|composition|evidence|components|runtime-capability|evaluator|probe|report|external-deck-construction-rule|line-separated-composition)/;
  const excludeName =
    /(fixtures?|manifest|cache|client|schema|overlay|normalization)/;
  const files: string[] = [];

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".ts")) {
        continue;
      }
      if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".d.ts")) {
        continue;
      }
      if (!includeName.test(entry.name) || excludeName.test(entry.name)) {
        continue;
      }
      files.push(path.relative(repoRoot, entryPath).replaceAll("\\", "/"));
    }
  };

  walk(root);
  return files.sort();
}
