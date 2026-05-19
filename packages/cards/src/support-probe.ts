import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchema } from "ajv";
import type { CardId, EffectDefinition } from "@optcg/types";

import { normalizePoneglyphCardDetail } from "./normalization.js";
import {
  createPoneglyphClient,
  type PoneglyphFetch,
  type PoneglyphClient,
} from "./poneglyph-client.js";
import type { EffectDefinitionValidationResult } from "./generated-support-index.js";
import {
  classifyGeneratedSupportBlockerLayer,
  determineDeepestSuccessfulLayerForBlocker,
} from "./generated-support-report.js";
import type {
  GeneratedSupportBlocker,
  GeneratedSupportDiagnosticTraceComponent,
} from "./generated-support-types.js";
import {
  evaluateGeneratedSupportPlayability,
  type EvaluateGeneratedSupportPlayabilityInput,
} from "./support-evaluator.js";

const defaultBaseUrl = "https://api.poneglyph.one";
const cardIdPattern = /^[A-Z]{2,6}\d{2}-\d{3}$/;
let validateSchema: ReturnType<Ajv2020["compile"]> | undefined;

export type SupportProbeOptions = {
  cardId: CardId;
  expectedBehaviorHash?: string;
  expectedSourceTextHash?: string;
  getCard: PoneglyphClient["getCard"];
  stdout: Pick<NodeJS.WriteStream, "write">;
};

export async function runSupportProbe(
  options: SupportProbeOptions,
): Promise<number> {
  const detail = await options.getCard(options.cardId);
  const normalized = normalizePoneglyphCardDetail(detail);
  const evaluationInput: EvaluateGeneratedSupportPlayabilityInput = {
    card: normalized,
    cardDataVersion: new Date().toISOString().slice(0, 10),
    effectDefinitionsVersion: "generated-support-v1",
    rulesVersion: "generated-support-v1",
    validateEffectDefinition,
  };
  if (options.expectedBehaviorHash !== undefined) {
    evaluationInput.expectedBehaviorHash = options.expectedBehaviorHash;
  }
  if (options.expectedSourceTextHash !== undefined) {
    evaluationInput.expectedSourceTextHash = options.expectedSourceTextHash;
  }
  const evaluation = evaluateGeneratedSupportPlayability(evaluationInput);

  options.stdout.write(`Card ID: ${normalized.cardId}\n`);
  options.stdout.write(`Playable: ${evaluation.playable ? "yes" : "no"}\n`);
  options.stdout.write(`sourceTextHash: ${normalized.sourceTextHash}\n`);
  options.stdout.write(`behaviorHash: ${normalized.behaviorHash}\n`);
  options.stdout.write(`card_type: ${detail.card_type}\n`);
  options.stdout.write(`color: ${detail.color.join(", ")}\n`);
  options.stdout.write(`cost: ${String(detail.cost)}\n`);
  options.stdout.write(`power: ${String(detail.power)}\n`);
  options.stdout.write(`counter: ${String(detail.counter)}\n`);
  options.stdout.write(`types: ${detail.types.join(", ")}\n`);
  options.stdout.write(
    `trigger: ${detail.trigger === null ? "null" : detail.trigger}\n`,
  );
  options.stdout.write(
    `effect: ${detail.effect === null ? "null" : detail.effect}\n`,
  );

  if (evaluation.effectDefinitionId !== undefined) {
    options.stdout.write(
      `effectDefinitionId: ${evaluation.effectDefinitionId}\n`,
    );
  }

  if (evaluation.blockers.length === 0) {
    options.stdout.write("Blockers: none\n");
  } else {
    options.stdout.write("Blockers:\n");
    for (const blocker of evaluation.blockers) {
      options.stdout.write(`${formatSupportProbeBlocker(blocker)}\n`);
    }
  }

  return 0;
}

export function formatSupportProbeBlocker(
  blocker: Pick<
    GeneratedSupportBlocker,
    | "capabilityId"
    | "code"
    | "component"
    | "decomposition"
    | "diagnosticLayer"
    | "expectedHash"
    | "message"
    | "receivedHash"
    | "schemaValidated"
    | "span"
  >,
): string {
  const spanText =
    blocker.span === undefined
      ? ""
      : ` span: ${JSON.stringify(blocker.span.text)}`;
  const layer = classifyGeneratedSupportBlockerLayer(blocker);
  const deepestSuccessfulLayer =
    determineDeepestSuccessfulLayerForBlocker(blocker);
  const deepestSuccessfulLayerText =
    deepestSuccessfulLayer === undefined
      ? ""
      : ` [deepest-successful-layer: ${deepestSuccessfulLayer}]`;
  const componentText =
    blocker.component === undefined ? "" : ` [component: ${blocker.component}]`;
  const decompositionText =
    blocker.decomposition === undefined
      ? ""
      : formatDiagnosticDecomposition(blocker.decomposition);
  return `- ${blocker.code} [layer: ${layer}]${deepestSuccessfulLayerText}${componentText}: ${blocker.message}${spanText}${decompositionText}`;
}

function formatDiagnosticDecomposition(
  decomposition: NonNullable<GeneratedSupportBlocker["decomposition"]>,
): string {
  const recognizedTriggerLines = decomposition.recognizedTriggerCandidates.map(
    (candidate) => `  recognized trigger candidate: ${candidate}`,
  );
  const recognizedActionLines = decomposition.recognizedActionCandidates.map(
    (candidate) => `  recognized supported-action candidate: ${candidate}`,
  );
  const recognizedSyntaxLines = decomposition.recognizedSyntaxFragments.map(
    (fragment) => `  recognized syntax fragment: ${fragment}`,
  );
  const unsupportedConditionLines =
    decomposition.unsupportedConditionFragments.map(
      (fragment) => `  unsupported condition predicate: ${fragment}`,
    );
  const unsupportedSyntaxLines = decomposition.unsupportedSyntaxFragments.map(
    (fragment) => `  unsupported syntax blocker: ${fragment}`,
  );
  const traceLines = (decomposition.traceComponents ?? [])
    .filter(
      (component) =>
        component.kind !== "trigger" ||
        !decomposition.recognizedTriggerCandidates.includes(component.text),
    )
    .map((component) => {
      const statusLabel =
        component.status === "unsupported" ? "unsupported" : "recognized";
      const noun = toTraceComponentDisplayName(component.kind);
      const suffix =
        component.status === "unsupported" ? "blocker" : "candidate";
      if (component.status === "unsupported") {
        return [
          `  unsupported ${noun} blocker: ${component.text}`,
          `  unsupported component blocker: ${component.text}`,
        ].join("\n");
      }
      return `  ${statusLabel} ${noun} ${suffix}: ${component.text}`;
    });
  return [
    "",
    "  diagnostic recognition only; remains unsupported for generated support",
    ...recognizedTriggerLines,
    ...recognizedSyntaxLines,
    ...recognizedActionLines,
    ...traceLines,
    ...unsupportedConditionLines,
    ...unsupportedSyntaxLines,
    `  reason: ${decomposition.reason}`,
  ].join("\n");
}

function toTraceComponentDisplayName(
  kind: GeneratedSupportDiagnosticTraceComponent["kind"],
): string {
  switch (kind) {
    case "action":
      return "action";
    case "cardinality":
      return "cardinality";
    case "condition":
      return "condition";
    case "condition-connector":
      return "condition connector";
    case "cost":
      return "cost";
    case "destination":
      return "destination";
    case "duration":
      return "duration";
    case "modifier":
      return "modifier";
    case "optionality":
      return "optionality";
    case "predicate":
      return "predicate";
    case "quantity":
      return "quantity";
    case "restriction":
      return "restriction";
    case "saved-reference":
      return "saved-reference";
    case "sequence":
      return "sequence";
    case "target":
      return "target";
    case "trigger":
      return "trigger";
    case "wrapper":
      return "wrapper";
  }
}

export async function runSupportProbeCli(
  argv: string[],
  environment: {
    cwd: string;
    fetch: PoneglyphFetch;
    stderr: Pick<NodeJS.WriteStream, "write">;
    stdout: Pick<NodeJS.WriteStream, "write">;
  },
): Promise<number> {
  try {
    const parsed = parseProbeArgs(argv);
    if (parsed.help) {
      environment.stdout.write(usageText());
      return 0;
    }

    const client = createPoneglyphClient({
      baseUrl: parsed.baseUrl,
      fetch: environment.fetch,
    });

    const probeOptions: SupportProbeOptions = {
      cardId: parsed.cardId,
      getCard: client.getCard,
      stdout: environment.stdout,
    };
    if (parsed.expectedBehaviorHash !== undefined) {
      probeOptions.expectedBehaviorHash = parsed.expectedBehaviorHash;
    }
    if (parsed.expectedSourceTextHash !== undefined) {
      probeOptions.expectedSourceTextHash = parsed.expectedSourceTextHash;
    }

    return await runSupportProbe(probeOptions);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    environment.stderr.write(`${message}\n`);
    return 1;
  }
}

type ParsedProbeArgs = {
  baseUrl: string;
  cardId: CardId;
  expectedBehaviorHash?: string;
  expectedSourceTextHash?: string;
  help: boolean;
};

function parseProbeArgs(argv: string[]): ParsedProbeArgs {
  let cardId: CardId | undefined;
  let baseUrl = defaultBaseUrl;
  let expectedBehaviorHash: string | undefined;
  let expectedSourceTextHash: string | undefined;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) {
      continue;
    }

    if (token === "--") {
      continue;
    }
    if (token === "--help" || token === "-h") {
      help = true;
      continue;
    }
    if (token === "--card") {
      if (cardId !== undefined) {
        throw new Error("Exactly one --card value is required.");
      }
      cardId = toCardId(readOptionValue(argv, index, token));
      index += 1;
      continue;
    }
    if (token === "--base-url") {
      baseUrl = readOptionValue(argv, index, token);
      index += 1;
      continue;
    }
    if (token === "--expected-behavior-hash") {
      expectedBehaviorHash = readOptionValue(argv, index, token);
      index += 1;
      continue;
    }
    if (token === "--expected-source-text-hash") {
      expectedSourceTextHash = readOptionValue(argv, index, token);
      index += 1;
      continue;
    }
    if (token.startsWith("-")) {
      throw new Error(`Unknown option: ${token}`);
    }
    if (cardId !== undefined) {
      throw new Error("Exactly one explicit card ID is required.");
    }
    cardId = toCardId(token);
  }

  if (!help && cardId === undefined) {
    throw new Error("Missing --card <id>.");
  }

  const parsed: ParsedProbeArgs = {
    baseUrl,
    cardId: cardId ?? ("OP03-044" as CardId),
    help,
  };
  if (expectedBehaviorHash !== undefined) {
    parsed.expectedBehaviorHash = expectedBehaviorHash;
  }
  if (expectedSourceTextHash !== undefined) {
    parsed.expectedSourceTextHash = expectedSourceTextHash;
  }
  return parsed;
}

function readOptionValue(
  argv: string[],
  index: number,
  option: string,
): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("-")) {
    throw new Error(`Missing value for ${option}.`);
  }
  return value;
}

function toCardId(value: string): CardId {
  if (!cardIdPattern.test(value)) {
    throw new Error(`Invalid Poneglyph card ID: ${value}`);
  }
  return value as CardId;
}

function validateEffectDefinition(
  definition: EffectDefinition,
): EffectDefinitionValidationResult {
  const validate = getEffectDefinitionValidator();
  const valid = validate(definition);
  if (valid) {
    return { valid: true };
  }
  return {
    errors: (validate.errors ?? []).map((error) =>
      `${error.instancePath || "/"} ${error.message ?? ""}`.trim(),
    ),
    valid: false,
  };
}

function getEffectDefinitionValidator(): ReturnType<Ajv2020["compile"]> {
  if (validateSchema !== undefined) {
    return validateSchema;
  }

  const schema = JSON.parse(
    readFileSync(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "..",
        "..",
        "..",
        "contracts/effect-dsl.schema.json",
      ),
      "utf8",
    ),
  ) as AnySchema;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  validateSchema = ajv.compile(schema);
  return validateSchema;
}

function usageText(): string {
  return [
    "Usage: pnpm --filter @optcg/cards support:probe -- --card OP03-044",
    "",
    "Options:",
    "  --card <id>        Probe exactly one Poneglyph card ID.",
    "  --base-url <url>   Poneglyph base URL. Defaults to https://api.poneglyph.one.",
    "  --expected-source-text-hash <hash>  Optional reviewed source-text hash baseline.",
    "  --expected-behavior-hash <hash>     Optional reviewed behavior hash baseline.",
    "",
  ].join("\n");
}

function nodeFetchAdapter(): PoneglyphFetch {
  return async (url, init) => {
    const response = await fetch(url, init);
    return {
      json: () => response.json(),
      ok: response.ok,
      status: response.status,
    };
  };
}

if (process.argv[1] !== undefined) {
  const invokedPath = path.resolve(process.argv[1]);
  const modulePath = fileURLToPath(import.meta.url);

  if (invokedPath === modulePath) {
    const exitCode = await runSupportProbeCli(process.argv.slice(2), {
      cwd: process.cwd(),
      fetch: nodeFetchAdapter(),
      stderr: process.stderr,
      stdout: process.stdout,
    });
    process.exitCode = exitCode;
  }
}
