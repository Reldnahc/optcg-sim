import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

type ChildStory = {
  id: string;
  title: string;
};

type Story = {
  childStories: ChildStory[];
  id: string;
  status: string;
  title: string;
};

type ReviewPlanStory = {
  id: string;
  path: string;
  status: string;
  title: string;
};

type ReviewAssignment = {
  id: string;
  model: "gpt-5.5";
  reasoning: "high";
  requiredCoverage: string[];
  stories: string[];
  type: "parent-story-set";
};

const REQUIRED_COVERAGE = [
  "parent story authority and non-implementation boundary",
  "declared child story scope, non-scope, allowed touch points, required tests, and dependencies",
  "parent/child consistency and lifecycle fit",
  "findings and disposition for the parent and each declared child",
];

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const repoRoot = findRepoRoot(process.cwd());
    const parentPath = resolvePath(repoRoot, options.parent);
    const parentSource = await readFile(parentPath, "utf8");
    const parentStory = parseStory(parentSource);

    if (parentStory.childStories.length === 0) {
      throw new Error(
        `Parent story ${parentStory.id} must declare child_stories for story-review planning.`,
      );
    }

    const stories: ReviewPlanStory[] = [
      {
        id: parentStory.id,
        path: toPortablePath(path.relative(repoRoot, parentPath)),
        status: parentStory.status,
        title: parentStory.title,
      },
    ];

    for (const child of parentStory.childStories) {
      const childPath = await findStoryById(repoRoot, child.id);
      if (!childPath) {
        throw new Error(`Unable to find child story ${child.id}.`);
      }

      const childStory = parseStory(await readFile(childPath, "utf8"));
      stories.push({
        id: childStory.id,
        path: toPortablePath(path.relative(repoRoot, childPath)),
        status: childStory.status,
        title: childStory.title,
      });
    }

    const reviewAssignments: ReviewAssignment[] = [
      {
        id: `story-review:${parentStory.id}`,
        model: "gpt-5.5",
        reasoning: "high",
        requiredCoverage: REQUIRED_COVERAGE,
        stories: stories.map((story) => story.id),
        type: "parent-story-set",
      },
    ];

    const plan = {
      parent: stories[0],
      reviewAssignments,
      stories,
    };

    if (options.format === "json") {
      process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
      return;
    }

    process.stdout.write(renderMarkdown(plan));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

function parseArgs(args: string[]) {
  const options = new Map<string, string>();

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];

    if (token === "--") {
      continue;
    }

    if (!token?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token ?? ""}`);
    }

    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${token}`);
    }

    options.set(token, value);
    index += 1;
  }

  const parent = options.get("--parent");
  if (!parent) {
    throw new Error("Missing required option --parent");
  }

  const format = options.get("--format") ?? "markdown";
  if (format !== "markdown" && format !== "json") {
    throw new Error(`Unsupported format ${format}. Use markdown or json.`);
  }

  return {
    format,
    parent,
  };
}

function parseStory(source: string): Story {
  const id = readScalar(source, "id");
  const status = readScalar(source, "status");
  const title = readScalar(source, "title");
  const childStories = readChildStories(source);

  return {
    childStories,
    id,
    status,
    title,
  };
}

function readScalar(source: string, key: string) {
  const match = source.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  const value = match?.[1]?.trim();

  if (!value) {
    throw new Error(`Unable to read story field ${key}.`);
  }

  return unquote(value);
}

function readChildStories(source: string): ChildStory[] {
  const lines = source.split(/\r?\n/);
  const childStories: ChildStory[] = [];
  let index = lines.findIndex((line) => line === "child_stories:");

  if (index < 0) {
    return childStories;
  }

  index += 1;

  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined || line.trim() === "") {
      index += 1;
      continue;
    }

    if (!line.startsWith("  - ")) {
      break;
    }

    const idMatch = line.match(/^ {2}- id:\s*(.+)$/);
    if (!idMatch?.[1]) {
      throw new Error(`Malformed child_stories item: ${line}`);
    }

    const id = unquote(idMatch[1].trim());
    let title = "";
    index += 1;

    while (index < lines.length && /^ {4}[a-z_]+:/i.test(lines[index] ?? "")) {
      const propertyLine = lines[index] ?? "";
      const titleMatch = propertyLine.match(/^ {4}title:\s*(.+)$/);
      if (titleMatch?.[1]) {
        title = unquote(titleMatch[1].trim());
      }
      index += 1;
    }

    childStories.push({
      id,
      title,
    });
  }

  return childStories;
}

async function findStoryById(repoRoot: string, storyId: string) {
  const directories = [
    "stories/approved",
    "stories/generated",
    "stories/blocked",
    "stories/done",
  ];

  for (const directory of directories) {
    const absoluteDirectory = path.join(repoRoot, directory);
    let entries: string[];

    try {
      entries = await readdir(absoluteDirectory);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }

    const fileName = entries
      .filter((entry) => entry.endsWith(".yaml"))
      .sort((left, right) => left.localeCompare(right))
      .find((entry) => entry.startsWith(`${storyId}-`));

    if (fileName) {
      return path.join(absoluteDirectory, fileName);
    }
  }

  return null;
}

function findRepoRoot(startDirectory: string) {
  let current = startDirectory;

  for (;;) {
    if (path.basename(current) === "repo") {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return startDirectory;
    }

    current = parent;
  }
}

function resolvePath(repoRoot: string, value: string) {
  return path.isAbsolute(value) ? value : path.join(repoRoot, value);
}

function renderMarkdown(plan: {
  parent: ReviewPlanStory | undefined;
  reviewAssignments: ReviewAssignment[];
  stories: ReviewPlanStory[];
}) {
  const lines = [
    "# Story Review Plan",
    "",
    `Parent: ${plan.parent?.id ?? "unknown"}`,
    "",
    "## Stories",
    "",
    ...plan.stories.map((story) => `- ${story.id}: ${story.path}`),
    "",
    "## Assignments",
    "",
  ];

  for (const assignment of plan.reviewAssignments) {
    lines.push(
      `- ${assignment.id}: ${assignment.type}; model ${assignment.model}; reasoning ${assignment.reasoning}; stories ${assignment.stories.join(", ")}`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

function unquote(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function toPortablePath(value: string) {
  return value.split(path.sep).join("/");
}

await main();
