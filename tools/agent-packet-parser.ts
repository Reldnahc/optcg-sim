export type StoryData = {
  spec_version: string;
  spec_package_name: string;
  story_schema_version: string;
  id: string;
  epic_id: string;
  title: string;
  type: string;
  area: string;
  primary_concern: string;
  priority: string;
  status: string;
  summary: string;
  story_boundary: string;
  allowed_touch_points: string[];
  spec_refs: string[];
  scope: string[];
  non_scope: string[];
  dependencies: string[];
  acceptance_criteria: string[];
  required_tests: string[];
  repo_rules: string[];
  ambiguity_policy: string;
};

export function parseStoryYaml(source: string): StoryData {
  const result = new Map<string, string | string[]>();
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

    if (key === undefined || key === "") {
      throw new Error(`Unable to parse story key from line: ${line}`);
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

      result.set(key, items);
      continue;
    }

    if (isInlineEmptyArray(rawValue)) {
      result.set(key, []);
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

      result.set(key, foldBlockScalar(blockLines, blockScalarStyle));
      continue;
    }

    result.set(key, parseScalarValue(rawValue));
    index += 1;
  }

  return {
    acceptance_criteria: expectStringArray(result, "acceptance_criteria"),
    allowed_touch_points: expectStringArray(result, "allowed_touch_points"),
    ambiguity_policy: expectString(result, "ambiguity_policy"),
    area: expectString(result, "area"),
    dependencies: expectStringArray(result, "dependencies"),
    epic_id: expectString(result, "epic_id"),
    id: expectString(result, "id"),
    non_scope: expectStringArray(result, "non_scope"),
    primary_concern: expectString(result, "primary_concern"),
    priority: expectString(result, "priority"),
    repo_rules: expectStringArray(result, "repo_rules"),
    required_tests: expectStringArray(result, "required_tests"),
    scope: expectStringArray(result, "scope"),
    spec_package_name: expectString(result, "spec_package_name"),
    spec_refs: expectStringArray(result, "spec_refs"),
    spec_version: expectString(result, "spec_version"),
    status: expectString(result, "status"),
    story_boundary: expectString(result, "story_boundary"),
    story_schema_version: expectString(result, "story_schema_version"),
    summary: expectString(result, "summary"),
    title: expectString(result, "title"),
    type: expectString(result, "type"),
  };
}

export function parseOptionMap(args: string[]) {
  const options = new Map<string, string>();

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === undefined) {
      throw new Error("Unexpected missing CLI token.");
    }

    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const value = args[index + 1];

    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${token}`);
    }

    options.set(token, value);
    index += 1;
  }

  return options;
}

export function requireOption(options: Map<string, string>, key: string) {
  const value = options.get(key);

  if (!value) {
    throw new Error(`Missing required option ${key}`);
  }

  return value;
}

function isListLine(line: string | undefined) {
  return typeof line === "string" && /^ {2}- /.test(line);
}

function isIndentedBlock(line: string | undefined) {
  return (
    typeof line === "string" && (line.startsWith("  ") || line.trim() === "")
  );
}

function parseListValue(line: string) {
  return parseScalarValue(line.replace(/^ {2}- /, ""));
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
  const copy = [...lines];

  while (copy.length > 0) {
    const lastLine = copy[copy.length - 1];

    if (lastLine === undefined || lastLine.trim() !== "") {
      break;
    }

    copy.pop();
  }

  return copy;
}

function expectString(map: Map<string, string | string[]>, key: string) {
  const value = map.get(key);

  if (typeof value !== "string") {
    throw new Error(`Missing string field ${key} in story file.`);
  }

  return value;
}

function expectStringArray(map: Map<string, string | string[]>, key: string) {
  const value = map.get(key);

  if (!Array.isArray(value)) {
    throw new Error(`Missing list field ${key} in story file.`);
  }

  return value;
}
