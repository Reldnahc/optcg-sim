import { readFileSync } from "node:fs";

import {
  createBehaviorCoverageReport,
  createBehaviorCoverageSourceFailureReport,
  createEmptyBehaviorCoverageBucketSummary,
  type BehaviorCoverageReport,
  type BehaviorCoverageEntry,
} from "./behavior-coverage.js";
import { extractEngineEffectPrimitiveTypes } from "./engine-primitive-inventory.js";
import {
  createPoneglyphCoverageEntriesFromCardIds,
  createPoneglyphCoverageEntriesFromDeckHash,
  createPoneglyphCoverageEntriesFromSet,
  createPoneglyphDeckHashCodec,
  defaultPoneglyphBaseUrl,
  fetchPoneglyphCard,
  type DeckHashCodecPort,
  type PoneglyphFetch,
} from "./poneglyph-card-source.js";

export interface BehaviorCoverageCliDependencies {
  readonly fetchPoneglyph?: PoneglyphFetch;
  readonly deckHashCodec?: DeckHashCodecPort;
  readonly baseUrl?: string;
}

const usage =
  "Usage: behavior:coverage -- --text <effect line> | --card <card id> | --set <set code> | --deck-hash <hash> | --fixture corpus";

const sourceFamilyError =
  "Choose exactly one behavior coverage source family: --text, --card, --set, --deck-hash, or --fixture";

type CoverageSource =
  | {
      readonly ok: true;
      readonly sourceLabel: string;
      readonly entries: readonly BehaviorCoverageEntry[];
    }
  | {
      readonly ok: false;
      readonly report: BehaviorCoverageReport;
    };

export const createBehaviorCoverageCliReport = async (
  argv: readonly string[],
  dependencies: BehaviorCoverageCliDependencies = {},
): Promise<BehaviorCoverageReport> => {
  const args = argsAfterPassthrough(argv);
  const source = await resolveCoverageSource(args, dependencies);
  if (!source.ok) {
    return source.report;
  }

  const inventoryPrimitiveTypes = extractEngineEffectPrimitiveTypes({
    rootTypeName: "Effect",
    sourceFiles: [
      {
        fileName: "effects.ts",
        text: readFileSync(
          new URL("../../types/src/effects.ts", import.meta.url),
          "utf8",
        ),
      },
      {
        fileName: "effect-continuous.ts",
        text: readFileSync(
          new URL("../../types/src/effect-continuous.ts", import.meta.url),
          "utf8",
        ),
      },
    ],
  });

  const report = createBehaviorCoverageReport({
    inventoryPrimitiveTypes,
    entries: source.entries,
  });
  return {
    ...report,
    lines: [`Behavior coverage source: ${source.sourceLabel}`, ...report.lines],
  };
};

const resolveCoverageSource = async (
  args: readonly string[],
  dependencies: BehaviorCoverageCliDependencies,
): Promise<CoverageSource> => {
  const texts = valuesForArg(args, "--text");
  const cardIds = valuesForArg(args, "--card");
  const setCodes = valuesForArg(args, "--set");
  const deckHashes = valuesForArg(args, "--deck-hash");
  const fixtures = valuesForArg(args, "--fixture");
  const selectedFamilies = [
    texts.length > 0,
    cardIds.length > 0,
    setCodes.length > 0,
    deckHashes.length > 0,
    fixtures.length > 0,
  ].filter(Boolean).length;

  if (selectedFamilies === 0) {
    return { ok: false, report: errorReport([usage]) };
  }
  if (selectedFamilies > 1) {
    return { ok: false, report: errorReport([sourceFamilyError]) };
  }
  if (texts.length > 0) {
    return {
      ok: true,
      sourceLabel: "text",
      entries: texts.map((text, index) => ({
        label: `text:${String(index + 1)}`,
        text,
      })),
    };
  }

  const baseUrl = dependencies.baseUrl ?? defaultPoneglyphBaseUrl;
  const fetchPoneglyph = dependencies.fetchPoneglyph ?? fetchPoneglyphCard;
  if (cardIds.length > 0) {
    return loadedSource(
      `card ${cardIds.join(", ")}`,
      await createPoneglyphCoverageEntriesFromCardIds(cardIds, {
        baseUrl,
        fetchPoneglyph,
      }),
    );
  }
  const singletonError = validateSingletonSources({
    setCodes,
    deckHashes,
    fixtures,
  });
  if (singletonError !== undefined) {
    return { ok: false, report: errorReport([singletonError]) };
  }
  const setCode = setCodes[0];
  if (setCode !== undefined) {
    return loadedSource(
      `set ${setCode}`,
      await createPoneglyphCoverageEntriesFromSet(setCode, {
        baseUrl,
        fetchPoneglyph,
      }),
    );
  }
  const deckHash = deckHashes[0];
  if (deckHash !== undefined) {
    return loadedSource(
      "deck hash",
      await createPoneglyphCoverageEntriesFromDeckHash(deckHash, {
        baseUrl,
        deckHashCodec:
          dependencies.deckHashCodec ?? createPoneglyphDeckHashCodec(),
        fetchPoneglyph,
      }),
    );
  }

  return {
    ok: false,
    report: errorReport([
      `Unknown behavior coverage fixture: ${fixtures[0] ?? ""}`,
    ]),
  };
};

const validateSingletonSources = (input: {
  readonly setCodes: readonly string[];
  readonly deckHashes: readonly string[];
  readonly fixtures: readonly string[];
}): string | undefined => {
  if (input.setCodes.length > 1) {
    return "Expected exactly one value for --set.";
  }
  if (input.deckHashes.length > 1) {
    return "Expected exactly one value for --deck-hash.";
  }
  if (input.fixtures.length > 1) {
    return "Expected exactly one value for --fixture.";
  }
  return undefined;
};

const loadedSource = (
  sourceLabel: string,
  result:
    | {
        readonly ok: true;
        readonly entries: readonly BehaviorCoverageEntry[];
      }
    | { readonly ok: false; readonly error: string },
): CoverageSource => {
  if (!result.ok) {
    return {
      ok: false,
      report: createBehaviorCoverageSourceFailureReport({
        sourceLabel,
        error: result.error,
      }),
    };
  }
  return {
    ok: true,
    sourceLabel,
    entries: result.entries,
  };
};

const errorReport = (errors: readonly string[]): BehaviorCoverageReport => ({
  exitCode: 1,
  lines: [],
  errors,
  bucketSummary: createEmptyBehaviorCoverageBucketSummary(),
  entryResults: [],
});

const argsAfterPassthrough = (argv: readonly string[]): readonly string[] => {
  const passthroughIndex = argv.indexOf("--");
  return passthroughIndex >= 0 ? argv.slice(passthroughIndex + 1) : argv;
};

const valuesForArg = (
  args: readonly string[],
  name: string,
): readonly string[] => {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) {
      continue;
    }
    const value = args[index + 1];
    if (value !== undefined && value.length > 0) {
      values.push(value);
    }
  }
  return values;
};

const main = async (): Promise<number> => {
  const report = await createBehaviorCoverageCliReport(process.argv.slice(2));
  for (const line of report.lines) {
    writeLine(line);
  }
  for (const error of report.errors) {
    writeError(error);
  }
  return report.exitCode;
};

const safeMain = async (): Promise<number> => {
  try {
    return await main();
  } catch (error: unknown) {
    const report = createBehaviorCoverageSourceFailureReport({
      sourceLabel: "unknown",
      error: error instanceof Error ? error.message : String(error),
    });
    for (const line of report.lines) {
      writeLine(line);
    }
    return report.exitCode;
  }
};

const writeLine = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

const writeError = (message: string): void => {
  process.stderr.write(`${message}\n`);
};

if (process.argv[1]?.endsWith("behavior-coverage-cli.ts") === true) {
  void safeMain().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
