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

type DebtRow = {
  category: ViolationCategory;
  file: string;
  line: string;
  owningChild: string;
  reason: string;
};

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

const productionFiles = listSupportAuthorityProductionFiles();

const migrationDebtInventory: readonly DebtRow[] = [
  {
    category: "exact-wrapper-body-gate",
    file: "packages/cards/src/certified-card-text-parser.ts",
    line: 'if (wrapper === undefined || wrapper.prefix !== "[On Play] ") {',
    owningChild: "CARD-025B",
    reason:
      "Exact wrapper prefix gate is shape-coupled authority rather than reusable trigger-boundary evidence.",
  },
  {
    category: "exact-wrapper-body-gate",
    file: "packages/cards/src/certified-card-text-parser.ts",
    line: 'if (wrapper === undefined || wrapper.prefix !== "[When Attacking] ") {',
    owningChild: "CARD-025B",
    reason:
      "Exact wrapper prefix gate is shape-coupled authority rather than reusable trigger-boundary evidence.",
  },
  {
    category: "exact-wrapper-body-gate",
    file: "packages/cards/src/certified-card-text-parser.ts",
    line: 'if (wrapper.prefix !== "[When Attacking] ") {',
    owningChild: "CARD-025B",
    reason:
      "Exact wrapper prefix gate is shape-coupled authority rather than reusable trigger-boundary evidence.",
  },
  {
    category: "exact-wrapper-body-gate",
    file: "packages/cards/src/composed-parser-builder.ts",
    line: 'if (wrapper === undefined || wrapper.prefix !== "[On Play] ") {',
    owningChild: "CARD-025B",
    reason:
      "Exact wrapper prefix gate is shape-coupled authority rather than reusable trigger-boundary evidence.",
  },
  {
    category: "exact-full-line-authorization",
    file: "packages/cards/src/composed-parser-builder.ts",
    line: 'return sourceText === "your opponent\'s Characters"',
    owningChild: "CARD-025C",
    reason:
      "Exact full-line target authorization should be represented by reusable target primitive parsing.",
  },
  {
    category: "exact-full-line-authorization",
    file: "packages/cards/src/composed-parser-builder.ts",
    line: 'return sourceText === "K.O. that Character." ? "koThatCharacter" : undefined;',
    owningChild: "CARD-025C",
    reason:
      "Exact full-line saved-reference consumer authorization should be represented by reusable consumer primitives.",
  },
  {
    category: "exact-full-line-authorization",
    file: "packages/cards/src/start-of-game-stage-play-components.ts",
    line: 'return sourceText === " from your deck" || sourceText === " from your deck."',
    owningChild: "CARD-025C",
    reason:
      "Exact suffix authorization is full-line sample gating instead of reusable source-suffix primitive evidence.",
  },
  {
    category: "exact-full-line-authorization",
    file: "packages/cards/src/standalone-keyword-parser.ts",
    line: "return sourceText === standaloneBlockerSourceText ||",
    owningChild: "CARD-025C",
    reason:
      "Exact full-text authorization through one-level constant indirection is sample-shaped authority.",
  },
  {
    category: "exact-full-line-authorization",
    file: "packages/cards/src/standalone-keyword-parser.ts",
    line: "sourceText === standaloneBlockerWithReminderSourceText",
    owningChild: "CARD-025C",
    reason:
      "Exact full-text authorization through one-level constant indirection is sample-shaped authority.",
  },
  {
    category: "exact-full-line-authorization",
    file: "packages/cards/src/standalone-keyword-parser.ts",
    line: "sourceText === candidate[1] ||",
    owningChild: "CARD-025C",
    reason:
      "Exact full-text authorization through tuple-index indirection is sample-shaped authority.",
  },
  {
    category: "exact-full-line-authorization",
    file: "packages/cards/src/standalone-keyword-parser.ts",
    line: "sourceText === `${candidate[1]} ${candidate[2]}`,",
    owningChild: "CARD-025C",
    reason:
      "Exact full-text authorization through tuple-template indirection is sample-shaped authority.",
  },
  {
    category: "sample-specific-numeric-authorization",
    file: "packages/cards/src/composed-parser-builder.ts",
    line: "return count === 1 ? { max: 1, min: 1 } : undefined;",
    owningChild: "CARD-025D",
    reason:
      "Sample-specific numeric cardinality gate uses exact number authorization instead of numeric-family support.",
  },
  {
    category: "sample-specific-numeric-authorization",
    file: "packages/cards/src/composed-parser-builder.ts",
    line: "if (optionalDraw !== undefined && optionalDraw.count === 1) {",
    owningChild: "CARD-025D",
    reason: "Sample-specific numeric gate authorizes only one draw count.",
  },
  {
    category: "sample-specific-numeric-authorization",
    file: "packages/cards/src/composed-parser-builder.ts",
    line: "if (conditionedDraw === undefined || conditionedDraw.count !== 1) {",
    owningChild: "CARD-025D",
    reason:
      "Sample-specific numeric gate authorizes only one conditioned draw count.",
  },
  {
    category: "sample-specific-numeric-authorization",
    file: "packages/cards/src/composed-parser-builder.ts",
    line: "if (conditionedDraw.donCount !== 1) {",
    owningChild: "CARD-025D",
    reason:
      "Sample-specific numeric gate authorizes only one DON threshold value.",
  },
  {
    category: "sample-specific-numeric-authorization",
    file: "packages/cards/src/composed-parser-builder.ts",
    line: "parsed.trashCount !== 2 ||",
    owningChild: "CARD-025D",
    reason:
      "Sample-specific numeric gate authorizes only one trash-count threshold.",
  },
  {
    category: "sample-specific-numeric-authorization",
    file: "packages/cards/src/composed-parser-builder.ts",
    line: "parsed.drawCount !== 1",
    owningChild: "CARD-025D",
    reason:
      "Sample-specific numeric gate authorizes only one draw-count threshold.",
  },
  {
    category: "real-card-id-or-external-list-authorization",
    file: "packages/cards/src/support-probe.ts",
    line: 'cardId: cardId ?? ("OP03-044" as CardId),',
    owningChild: "CARD-025E",
    reason:
      "Real card ID default in production path is inventory debt until probe defaults are de-shaped.",
  },
  {
    category: "story-named-parser-ownership",
    file: "packages/cards/src/certified-card-text-parser.ts",
    line: 'export const certifiedParserRuleReviewer = "certified-parser-rule:CARD-009B";',
    owningChild: "CARD-025F",
    reason:
      "Story-coded parser ownership label in production module is debt until ownership is primitive-domain based.",
  },
  {
    category: "story-named-parser-ownership",
    file: "packages/cards/src/conditional-parser-components.ts",
    line: '? "Conditional wrapper and supported condition components were recognized, but conditional generated support remains fail-closed until CARD-019B admits conditional runtime capability evidence."',
    owningChild: "CARD-025F",
    reason:
      "Story-coded runtime boundary reference in production diagnostic text is tracked migration debt.",
  },
  {
    category: "story-named-parser-ownership",
    file: "packages/cards/src/conditional-parser-components.ts",
    line: '? ["conditional-support:blocked-until-CARD-019B"]',
    owningChild: "CARD-025F",
    reason:
      "Story-coded blocker tag in production module is tracked migration debt.",
  },
  {
    category: "exact-wrapper-body-gate",
    file: "packages/cards/src/don-minus-draw-components.ts",
    line: 'if (wrapper === undefined || wrapper.prefix !== "[On Play] ") {',
    owningChild: "CARD-025B",
    reason:
      "Exact wrapper prefix gate is shape-coupled authority rather than reusable trigger-boundary evidence.",
  },
  {
    category: "exact-wrapper-body-gate",
    file: "packages/cards/src/on-play-field-effect-parser.ts",
    line: 'if (wrapper === undefined || wrapper.prefix !== "[On Play] ") {',
    owningChild: "CARD-025B",
    reason:
      "Exact wrapper prefix gate is shape-coupled authority rather than reusable trigger-boundary evidence.",
  },
  {
    category: "exact-wrapper-body-gate",
    file: "packages/cards/src/optional-trash-cost-ko-components.ts",
    line: 'if (wrapper === undefined || wrapper.prefix !== "[On Play] ") {',
    owningChild: "CARD-025B",
    reason:
      "Exact wrapper prefix gate is shape-coupled authority rather than reusable trigger-boundary evidence.",
  },
  {
    category: "exact-wrapper-body-gate",
    file: "packages/cards/src/top-n-search-components.ts",
    line: 'if (wrapper === undefined || wrapper.prefix !== "[On Play] ") {',
    owningChild: "CARD-025B",
    reason:
      "Exact wrapper prefix gate is shape-coupled authority rather than reusable trigger-boundary evidence.",
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
      /\b(count|drawCount|trashCount|donCount|value|returnDonCount)\s*(===|!==)\s*\d+\b|\bcount\s*===\s*1\s*\?\s*\{\s*max:\s*1,\s*min:\s*1\s*\}\s*:\s*undefined/,
  },
];

describe("CARD-025A support authority anti-shape inventory", () => {
  it("detects forbidden authority shapes in production files and fails on unlisted additions", () => {
    const findings = scanProductionFindings();
    const findingKeys = new Set(findings.map(toFindingKey));
    const debtKeys = new Set(migrationDebtInventory.map(toDebtKey));

    const unlisted = findings.filter(
      (finding) => !debtKeys.has(toFindingKey(finding)),
    );
    expect(unlisted).toEqual([]);

    const staleDebtRows = migrationDebtInventory.filter(
      (row) => !findingKeys.has(toDebtKey(row)),
    );
    expect(staleDebtRows).toEqual([]);
  });

  it("keeps migration debt inventory test-only and structurally complete", () => {
    for (const row of migrationDebtInventory) {
      expect(row.category.length).toBeGreaterThan(0);
      expect(row.file.startsWith("packages/cards/src/")).toBe(true);
      expect(row.reason.length).toBeGreaterThan(0);
      expect(/^CARD-025[B-G]$/.test(row.owningChild)).toBe(true);
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

function toDebtKey(debt: DebtRow): string {
  return `${debt.category}|${debt.file}|${debt.line}`;
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
