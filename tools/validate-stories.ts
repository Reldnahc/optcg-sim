import type { AnySchema, ErrorObject, ValidateFunction } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const STORY_DIRECTORIES = [
  "stories/generated",
  "stories/approved",
  "stories/blocked",
  "stories/done",
  "stories/ambiguities",
  "stories/replaced",
];

type StoryDocument = Record<string, unknown>;

type ParsedStoryFile = {
  document: StoryDocument;
  relativePath: string;
};

export type StoryValidationResult = {
  checkedFiles: string[];
  diagnostics: string[];
  ok: boolean;
};

export type StoryValidationOptions = {
  repoRoot?: string;
};

export async function validateCommittedStories(
  options: StoryValidationOptions = {},
): Promise<StoryValidationResult> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const schemaPath = path.join(repoRoot, "contracts", "story.schema.json");
  const schema = parseJsonSchema(await readFile(schemaPath, "utf8"));
  const ajv: Ajv2020 = new Ajv2020({ allErrors: true });
  const validate: ValidateFunction = ajv.compile(schema);
  const checkedFiles = await findStoryFiles(repoRoot);
  const diagnostics: string[] = [];
  const parsedStories: ParsedStoryFile[] = [];

  for (const relativePath of checkedFiles) {
    const absolutePath = path.join(repoRoot, relativePath);

    try {
      const source = await readFile(absolutePath, "utf8");
      const document = parseStoryYaml(source);
      parsedStories.push({ document, relativePath });

      if (!validate(document)) {
        diagnostics.push(
          ...formatSchemaErrors(relativePath, validate.errors ?? []),
        );
      }
    } catch (error) {
      diagnostics.push(`${relativePath}: ${formatError(error)}`);
    }
  }

  diagnostics.push(...validateStoryLifecycle(parsedStories));
  diagnostics.push(
    ...validateApprovedCardImplementationStoryGuards(parsedStories),
  );
  diagnostics.sort();

  return {
    checkedFiles,
    diagnostics,
    ok: diagnostics.length === 0,
  };
}

function validateStoryLifecycle(stories: ParsedStoryFile[]) {
  const diagnostics: string[] = [];
  const doneStoryIds = new Set(
    stories
      .filter(
        ({ document, relativePath }) =>
          relativePath.startsWith("stories/done/") &&
          readStringField(document, "status") === "done",
      )
      .map(({ document }) => readStringField(document, "id"))
      .filter((id): id is string => id !== null),
  );

  for (const { document, relativePath } of stories) {
    if (
      !relativePath.startsWith("stories/approved/") ||
      readStringField(document, "status") !== "approved"
    ) {
      continue;
    }

    const childStoryIds = readChildStoryIds(document);

    if (
      childStoryIds.length > 0 &&
      childStoryIds.every((id) => doneStoryIds.has(id))
    ) {
      diagnostics.push(
        `${relativePath}: approved parent story is stale because all declared child stories are done: ${childStoryIds.join(", ")}`,
      );
    }
  }

  return diagnostics;
}

function validateApprovedCardImplementationStoryGuards(
  stories: ParsedStoryFile[],
) {
  const diagnostics: string[] = [];

  for (const { document, relativePath } of stories) {
    if (
      !relativePath.startsWith("stories/approved/") ||
      readStringField(document, "status") !== "approved" ||
      readStringField(document, "area") !== "cards" ||
      readStringField(document, "type") !== "implementation"
    ) {
      continue;
    }

    if (!hasNonEmptyStringArray(document, "card_source_integrity")) {
      diagnostics.push(
        `${relativePath}: approved stories with area: cards and type: implementation must define card_source_integrity evidence before approval.`,
      );
    }

    if (!hasNonEmptyStringArray(document, "engine_capability_preflight")) {
      diagnostics.push(
        `${relativePath}: approved stories with area: cards and type: implementation must define engine_capability_preflight evidence before approval.`,
      );
    }
  }

  return diagnostics;
}

function readStringField(document: StoryDocument, key: string) {
  const value = document[key];
  return typeof value === "string" ? value : null;
}

function hasNonEmptyStringArray(document: StoryDocument, key: string) {
  const value = document[key];

  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "string" && item.trim() !== "")
  );
}

function readChildStoryIds(document: StoryDocument) {
  const childStories = document["child_stories"];

  if (!Array.isArray(childStories)) {
    return [];
  }

  return childStories
    .map((childStory) =>
      typeof childStory === "object" && childStory !== null
        ? (childStory as StoryDocument)["id"]
        : null,
    )
    .filter((id): id is string => typeof id === "string");
}

async function findStoryFiles(repoRoot: string) {
  const trackedStoryFiles = findTrackedStoryFiles(repoRoot);

  if (trackedStoryFiles) {
    return trackedStoryFiles;
  }

  const files: string[] = [];

  for (const directory of STORY_DIRECTORIES) {
    files.push(...(await findYamlFiles(repoRoot, directory)));
  }

  return files.sort();
}

function findTrackedStoryFiles(repoRoot: string) {
  const result = spawnSync("git", ["ls-files", "stories/**/*.yaml"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    return null;
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && isStoryLifecyclePath(line))
    .flatMap((line) => resolvePendingLifecycleMove(repoRoot, line))
    .sort();
}

function resolvePendingLifecycleMove(repoRoot: string, relativePath: string) {
  if (existsSync(path.join(repoRoot, relativePath))) {
    return [relativePath];
  }

  const movedToDonePath = toPendingDonePath(relativePath);
  if (
    movedToDonePath !== null &&
    existsSync(path.join(repoRoot, movedToDonePath))
  ) {
    return [movedToDonePath];
  }

  return [relativePath];
}

function toPendingDonePath(relativePath: string) {
  const approvedPrefix = "stories/approved/";
  if (!relativePath.startsWith(approvedPrefix)) {
    return null;
  }

  return `stories/done/${relativePath.slice(approvedPrefix.length)}`;
}

function isStoryLifecyclePath(relativePath: string) {
  return STORY_DIRECTORIES.some(
    (directory) =>
      relativePath.startsWith(`${directory}/`) &&
      relativePath.endsWith(".yaml"),
  );
}

async function findYamlFiles(repoRoot: string, relativeDirectory: string) {
  const absoluteDirectory = path.join(repoRoot, relativeDirectory);

  try {
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      const absolutePath = path.join(absoluteDirectory, entry.name);

      if (entry.isDirectory()) {
        files.push(...(await findYamlFiles(repoRoot, relativePath)));
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".yaml")) {
        files.push(toPosixPath(path.relative(repoRoot, absolutePath)));
      }
    }

    return files;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function parseStoryYaml(source: string): StoryDocument {
  const result: StoryDocument = {};
  const lines = source.split(/\r?\n/);

  for (let index = 0; index < lines.length; ) {
    const line = lines[index];

    if (line === undefined) {
      throw new Error("Unexpected end of story file.");
    }

    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      index += 1;
      continue;
    }

    const keyMatch = line.match(/^([a-z_]+):(?:\s(.*))?$/i);

    if (!keyMatch) {
      throw new Error(`Unable to parse story line: ${line}`);
    }

    const [, key, rawValue = ""] = keyMatch;

    if (!key) {
      throw new Error(`Unable to parse story key from line: ${line}`);
    }

    if (rawValue === "" && isObjectListLine(lines[index + 1])) {
      const { items, nextIndex } = parseObjectList(lines, index + 1);
      result[key] = items;
      index = nextIndex;
      continue;
    }

    if (rawValue === "" && isListLine(lines[index + 1])) {
      const items: string[] = [];
      index += 1;

      while (index < lines.length && isListLine(lines[index])) {
        const itemLine = readRequiredLine(
          lines,
          index,
          "reading story list item",
        );
        items.push(parseListValue(itemLine));
        index += 1;
      }

      result[key] = items;
      continue;
    }

    if (isInlineEmptyArray(rawValue)) {
      result[key] = [];
      index += 1;
      continue;
    }

    const blockScalarStyle = parseBlockScalarStyle(rawValue);

    if (blockScalarStyle) {
      const blockLines: string[] = [];
      index += 1;

      while (index < lines.length && isIndentedBlock(lines[index])) {
        const blockLine = readRequiredLine(lines, index, "reading story block");
        blockLines.push(blockLine.slice(2));
        index += 1;
      }

      result[key] = foldBlockScalar(blockLines, blockScalarStyle);
      continue;
    }

    result[key] = parseScalarValue(rawValue);
    index += 1;
  }

  return result;
}

function formatSchemaErrors(relativePath: string, errors: ErrorObject[]) {
  return errors.map(
    (error) =>
      `${relativePath}: ${formatInstancePath(error.instancePath)} ${error.message ?? "failed schema validation"}`,
  );
}

function formatInstancePath(instancePath: string) {
  return instancePath === "" ? "/" : instancePath;
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function parseJsonSchema(source: string): AnySchema {
  const parsed = JSON.parse(source) as unknown;

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Story schema must be a JSON object.");
  }

  return parsed;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function isListLine(line: string | undefined) {
  return typeof line === "string" && /^ {2}- /.test(line);
}

function isObjectListLine(line: string | undefined) {
  return typeof line === "string" && /^ {2}- [a-z_]+:/i.test(line);
}

function isIndentedBlock(line: string | undefined) {
  return (
    typeof line === "string" && (line.startsWith("  ") || line.trim() === "")
  );
}

function parseObjectList(lines: string[], startIndex: number) {
  const items: StoryDocument[] = [];
  let index = startIndex;

  while (index < lines.length && isObjectListLine(lines[index])) {
    const item: StoryDocument = {};
    const firstLine = readRequiredLine(
      lines,
      index,
      "reading object list item",
    );
    parseObjectProperty(item, firstLine.replace(/^ {2}- /, ""));
    index += 1;

    while (index < lines.length && /^ {4}[a-z_]+:/i.test(lines[index] ?? "")) {
      const propertyLine = readRequiredLine(
        lines,
        index,
        "reading object list property",
      );
      parseObjectProperty(item, propertyLine.slice(4));
      index += 1;
    }

    items.push(item);
  }

  return { items, nextIndex: index };
}

function parseObjectProperty(item: StoryDocument, line: string) {
  const match = line.match(/^([a-z_]+):(?:\s(.*))?$/i);

  if (!match) {
    throw new Error(`Unable to parse story object property: ${line}`);
  }

  const [, key, rawValue = ""] = match;

  if (!key) {
    throw new Error(`Unable to parse story object property key: ${line}`);
  }

  item[key] = parseInlineValue(rawValue);
}

function parseListValue(line: string) {
  return parseScalarValue(line.replace(/^ {2}- /, ""));
}

function parseInlineValue(value: string) {
  const trimmed = value.trim();

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const innerValue = trimmed.slice(1, -1).trim();
    return innerValue === ""
      ? []
      : innerValue.split(",").map((item) => parseScalarValue(item));
  }

  return parseScalarValue(value);
}

function parseScalarValue(value: string) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function isInlineEmptyArray(value: string) {
  return value.trim() === "[]";
}

function parseBlockScalarStyle(value: string) {
  const match = value.trim().match(/^([>|])[-+]?$/);
  return match?.[1] ?? null;
}

function readRequiredLine(
  lines: string[],
  index: number,
  context: string,
): string {
  const line = lines[index];

  if (line === undefined) {
    throw new Error(`Unexpected end of file while ${context}.`);
  }

  return line;
}

function foldBlockScalar(lines: string[], style: string) {
  if (style === "|") {
    return trimTrailingBlankLines(lines).join("\n").trim();
  }

  const paragraphs: string[] = [];
  let currentParagraph: string[] = [];

  for (const line of lines) {
    if (line.trim() === "") {
      if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph.join(" ").trim());
        currentParagraph = [];
      }
      continue;
    }

    currentParagraph.push(line.trim());
  }

  if (currentParagraph.length > 0) {
    paragraphs.push(currentParagraph.join(" ").trim());
  }

  return paragraphs.join("\n\n");
}

function trimTrailingBlankLines(lines: string[]) {
  const result = [...lines];

  while (result.length > 0 && result[result.length - 1]?.trim() === "") {
    result.pop();
  }

  return result;
}

function toPosixPath(value: string) {
  return value.split(path.sep).join(path.posix.sep);
}

async function runCli() {
  const result = await validateCommittedStories();

  if (result.ok) {
    process.stdout.write(
      `Validated ${String(result.checkedFiles.length)} committed story file(s).\n`,
    );
    return;
  }

  process.stderr.write(`${result.diagnostics.join("\n")}\n`);
  process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await runCli();
}
