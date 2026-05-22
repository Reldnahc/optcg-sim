import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";

type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
interface JsonObject {
  [key: string]: JsonValue;
}

export type ValidationSummary = {
  schemaPath: string;
  validCount: number;
  invalidCount: number;
};

export async function loadJsonFile(filePath: string): Promise<JsonValue> {
  const source = await readFile(filePath, "utf8");
  return JSON.parse(source) as JsonValue;
}

export async function loadJsonObject(filePath: string): Promise<JsonObject> {
  const value = await loadJsonFile(filePath);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`expected ${filePath} to contain a JSON object`);
  }

  return value;
}

export async function listJsonFilesRecursive(
  rootDir: string,
): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listJsonFilesRecursive(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".json")) {
      results.push(entryPath);
    }
  }

  return results.sort();
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? [])
    .map((error) => {
      const location = error.instancePath.length > 0 ? error.instancePath : "/";
      return `${location} ${error.message ?? "failed schema validation"}`;
    })
    .join("\n- ");
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAllowedStartOfGameStageSearchProducer(effect: JsonObject): boolean {
  if (effect["type"] !== "search") {
    return false;
  }

  const request = effect["request"];
  if (!isJsonObject(request)) {
    return false;
  }

  if (
    request["zone"] !== "deck" ||
    request["player"] !== "self" ||
    request["min"] !== 0 ||
    request["max"] !== 1 ||
    request["destination"] !== "stageArea" ||
    request["revealTo"] !== "chooserOnly" ||
    request["shuffleAfter"] !== false ||
    Object.hasOwn(request, "lookCount") ||
    Object.hasOwn(request, "remainingCards")
  ) {
    return false;
  }

  const filter = request["filter"];
  if (!isJsonObject(filter)) {
    return false;
  }

  const filterKeys = Object.keys(filter);
  if (filterKeys.length !== 2) {
    return false;
  }

  const categories = filter["categories"];
  const typesAny = filter["typesAny"];
  if (
    !Array.isArray(categories) ||
    categories.length !== 1 ||
    categories[0] !== "stage" ||
    !Array.isArray(typesAny) ||
    typesAny.length < 1
  ) {
    return false;
  }

  return typesAny.every(
    (entry) => typeof entry === "string" && entry.trim().length > 0,
  );
}

export function validateSemanticEffectDslGuards(value: JsonValue): string[] {
  if (!isJsonObject(value)) {
    return [];
  }

  const effects = value["effects"];
  if (!Array.isArray(effects)) {
    return [];
  }

  return effects.flatMap((entry, index) =>
    isJsonObject(entry)
      ? validateEffectBlockSemantics(entry, `/effects/${String(index)}`)
      : [],
  );
}

function validateEffectBlockSemantics(
  effectBlock: JsonObject,
  pathPrefix: string,
): string[] {
  const trigger = effectBlock["trigger"];
  const isStartOfGameEffectBlock =
    isJsonObject(trigger) && trigger["type"] === "startOfGame";
  return validateEffectSemantics(
    effectBlock["effect"],
    `${pathPrefix}/effect`,
    isStartOfGameEffectBlock,
  );
}

function validateEffectSemantics(
  effect: JsonValue | undefined,
  pathPrefix: string,
  isStartOfGameEffectBlock: boolean,
): string[] {
  if (!isJsonObject(effect) || typeof effect["type"] !== "string") {
    return [];
  }

  if (effect["type"] === "playSelected") {
    return [`${pathPrefix} playSelected must be inside a producing sequence`];
  }

  if (
    !isStartOfGameEffectBlock &&
    isAllowedStartOfGameStageSearchProducer(effect)
  ) {
    return [
      `${pathPrefix} scoped start-of-game stage search request is allowed only in startOfGame effect blocks`,
    ];
  }

  if (effect["type"] !== "sequence") {
    return [];
  }

  const sequencedEffects = effect["effects"];
  if (!Array.isArray(sequencedEffects)) {
    return [];
  }

  const producedHandSelections = new Set<string>();
  let producedStartOfGameStageSelection = false;
  const selectedTargetProducersBySaveResultAs = new Map<string, Set<string>>();
  const failures: string[] = [];

  sequencedEffects.forEach((entry, index) => {
    const segmentPath = `${pathPrefix}/effects/${String(index)}`;
    if (!isJsonObject(entry)) {
      return;
    }

    const segmentEffect = entry["effect"];
    if (!isJsonObject(segmentEffect)) {
      return;
    }

    const segmentType = segmentEffect["type"];
    if (segmentType === "playSelected") {
      const selection = segmentEffect["selection"];
      if (
        typeof selection !== "string" ||
        ((!producedHandSelections.has(selection) ||
          selection === "selected:start-of-game") &&
          !(
            selection === "selected:start-of-game" &&
            producedStartOfGameStageSelection
          ))
      ) {
        failures.push(
          `${segmentPath}/effect playSelected must reference a prior selectCards saveAs or supported start-of-game stage search producer in the same sequence`,
        );
      }
      if (selection === "selected:start-of-game") {
        if (!isStartOfGameEffectBlock) {
          failures.push(
            `${segmentPath}/effect selected:start-of-game is allowed only in startOfGame effect blocks`,
          );
        }
        if (segmentEffect["ignoreCost"] !== true) {
          failures.push(
            `${segmentPath}/effect playSelected using selected:start-of-game must set ignoreCost: true`,
          );
        }
        if (Object.hasOwn(segmentEffect, "enterRested")) {
          failures.push(
            `${segmentPath}/effect playSelected using selected:start-of-game must not set enterRested`,
          );
        }
      }
    }

    const selectedTargetBindings = collectSelectedTargetsBindings(
      segmentEffect,
      `${segmentPath}/effect`,
    );
    for (const { binding, path: bindingPath } of selectedTargetBindings) {
      const producerIds = selectedTargetProducersBySaveResultAs.get(
        binding.saveResultAs,
      );
      if (!producerIds || producerIds.size === 0) {
        failures.push(
          `${bindingPath} savedFieldObject selectedTargets must reference a prior selectTargets segment with matching saveResultAs in the same sequence`,
        );
        continue;
      }

      if (
        typeof binding.sourceSegmentId === "string" &&
        !producerIds.has(binding.sourceSegmentId)
      ) {
        failures.push(
          `${bindingPath} savedFieldObject selectedTargets sourceSegmentId must match a prior selectTargets producer segment id with the same saveResultAs`,
        );
      }
    }

    if (segmentType === "sequence") {
      failures.push(
        ...validateEffectSemantics(
          segmentEffect,
          `${segmentPath}/effect`,
          isStartOfGameEffectBlock,
        ),
      );
    }

    if (
      segmentType === "selectCards" &&
      typeof segmentEffect["saveAs"] === "string"
    ) {
      producedHandSelections.add(segmentEffect["saveAs"]);
    }
    if (
      isStartOfGameEffectBlock &&
      isAllowedStartOfGameStageSearchProducer(segmentEffect)
    ) {
      producedStartOfGameStageSelection = true;
    }

    if (
      segmentType === "selectTargets" &&
      typeof entry["saveResultAs"] === "string"
    ) {
      const producerIds =
        selectedTargetProducersBySaveResultAs.get(entry["saveResultAs"]) ??
        new Set<string>();
      const segmentId = typeof entry["id"] === "string" ? entry["id"] : "";
      producerIds.add(segmentId);
      selectedTargetProducersBySaveResultAs.set(
        entry["saveResultAs"],
        producerIds,
      );
    }
  });

  return failures;
}

interface SelectedTargetsBinding {
  saveResultAs: string;
  sourceSegmentId?: string;
}

interface SelectedTargetsBindingWithPath {
  binding: SelectedTargetsBinding;
  path: string;
}

function collectSelectedTargetsBindings(
  value: JsonValue | undefined,
  currentPath: string,
): SelectedTargetsBindingWithPath[] {
  if (!isJsonObject(value)) {
    return [];
  }

  if (value["type"] === "sequence") {
    // Nested sequences are validated independently by validateEffectSemantics.
    return [];
  }

  const result: SelectedTargetsBindingWithPath[] = [];
  if (value["type"] === "savedFieldObject" && isJsonObject(value["binding"])) {
    const binding = value["binding"];
    if (
      binding["family"] === "selectedTargets" &&
      typeof binding["saveResultAs"] === "string"
    ) {
      const selectedTargetsBinding: SelectedTargetsBinding = {
        saveResultAs: binding["saveResultAs"],
      };
      if (typeof binding["sourceSegmentId"] === "string") {
        selectedTargetsBinding.sourceSegmentId = binding["sourceSegmentId"];
      }
      result.push({
        binding: selectedTargetsBinding,
        path: `${currentPath}/binding`,
      });
    }
  }

  for (const [key, child] of Object.entries(value)) {
    if (Array.isArray(child)) {
      child.forEach((arrayValue, index) => {
        result.push(
          ...collectSelectedTargetsBindings(
            arrayValue,
            `${currentPath}/${key}/${String(index)}`,
          ),
        );
      });
      continue;
    }

    result.push(
      ...collectSelectedTargetsBindings(child, `${currentPath}/${key}`),
    );
  }

  return result;
}

export async function validateEffectDslFixtures(
  repoRoot: string,
): Promise<ValidationSummary> {
  const schemaPath = path.join(repoRoot, "contracts", "effect-dsl.schema.json");
  const validDir = path.join(repoRoot, "fixtures", "effect-dsl", "valid");
  const invalidDir = path.join(repoRoot, "fixtures", "effect-dsl", "invalid");

  const schema = await loadJsonObject(schemaPath);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  const validFixtures = await listJsonFilesRecursive(validDir);
  const invalidFixtures = await listJsonFilesRecursive(invalidDir);

  if (validFixtures.length === 0) {
    throw new Error(`no valid fixtures found under ${validDir}`);
  }

  if (invalidFixtures.length === 0) {
    throw new Error(`no invalid fixtures found under ${invalidDir}`);
  }

  const failures: string[] = [];

  for (const fixturePath of validFixtures) {
    const fixture = await loadJsonFile(fixturePath);
    const isValid = validate(fixture);
    const semanticFailures = validateSemanticEffectDslGuards(fixture);
    if (!isValid) {
      failures.push(
        `expected valid fixture ${path.relative(repoRoot, fixturePath)} to pass, but got:\n- ${formatAjvErrors(validate.errors)}`,
      );
    }
    if (semanticFailures.length > 0) {
      failures.push(
        `expected valid fixture ${path.relative(repoRoot, fixturePath)} to pass semantic guards, but got:\n- ${semanticFailures.join("\n- ")}`,
      );
    }
  }

  for (const fixturePath of invalidFixtures) {
    const fixture = await loadJsonFile(fixturePath);
    const isValid = validate(fixture);
    const semanticFailures = validateSemanticEffectDslGuards(fixture);
    if (isValid && semanticFailures.length === 0) {
      failures.push(
        `expected invalid fixture ${path.relative(repoRoot, fixturePath)} to fail, but it passed`,
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(failures.join("\n\n"));
  }

  return {
    schemaPath,
    validCount: validFixtures.length,
    invalidCount: invalidFixtures.length,
  };
}

async function runCli(): Promise<void> {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, "..");
  const summary = await validateEffectDslFixtures(repoRoot);
  process.stdout.write(
    `effect DSL fixtures validated (${String(summary.validCount)} valid, ${String(summary.invalidCount)} invalid) using ${path.relative(
      repoRoot,
      summary.schemaPath,
    )}\n`,
  );
}

const isEntrypoint = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isEntrypoint) {
  runCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`effect DSL fixture validation failed:\n${message}\n`);
    process.exitCode = 1;
  });
}
