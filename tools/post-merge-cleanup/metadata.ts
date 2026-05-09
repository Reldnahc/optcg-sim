import type { CleanupMetadata, CleanupMode } from "./types.js";

const METADATA_HEADER = "Post-merge cleanup:";

export function parseCleanupMetadataBlock(prBody: string): CleanupMetadata {
  const sections = findMetadataSections(prBody);

  if (sections.length !== 1) {
    throw new Error(
      sections.length === 0
        ? "Missing Post-merge cleanup metadata block."
        : "Ambiguous Post-merge cleanup metadata block; expected exactly one.",
    );
  }

  return parseCleanupMetadataLines(sections[0] ?? []);
}

export function parseCleanupMetadataLines(lines: string[]): CleanupMetadata {
  let mode: CleanupMode | null = null;
  const stories: string[] = [];
  const branches: string[] = [];
  let activeList: "stories" | "branches" | null = null;
  let sawStories = false;
  let sawBranches = false;

  for (const line of lines) {
    if (line.trim() === "") {
      continue;
    }

    const modeMatch = line.match(/^ {2}mode:\s*(single|parent)\s*$/);

    if (modeMatch?.[1]) {
      if (mode !== null) {
        throw new Error("Malformed cleanup metadata: duplicate mode.");
      }

      mode = modeMatch[1] as CleanupMode;
      activeList = null;
      continue;
    }

    if (line === "  stories:") {
      if (sawStories) {
        throw new Error(
          "Malformed cleanup metadata: duplicate stories section.",
        );
      }
      sawStories = true;
      activeList = "stories";
      continue;
    }

    if (line === "  branches:") {
      if (sawBranches) {
        throw new Error(
          "Malformed cleanup metadata: duplicate branches section.",
        );
      }
      sawBranches = true;
      activeList = "branches";
      continue;
    }

    const itemMatch = line.match(/^ {4}-\s+(.+)\s*$/);

    if (itemMatch?.[1]) {
      if (activeList === "stories") {
        stories.push(itemMatch[1].trim());
        continue;
      }

      if (activeList === "branches") {
        branches.push(itemMatch[1].trim());
        continue;
      }
    }

    throw new Error(`Malformed cleanup metadata line: ${line}`);
  }

  if (mode === null) {
    throw new Error("Malformed cleanup metadata: missing mode.");
  }

  if (stories.length === 0) {
    throw new Error(
      "Malformed cleanup metadata: at least one story is required.",
    );
  }

  return {
    branches,
    mode,
    stories,
  };
}

function findMetadataSections(prBody: string) {
  const lines = prBody.replace(/\r\n/g, "\n").split("\n");
  const sections: string[][] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]?.trim() !== METADATA_HEADER) {
      continue;
    }

    const sectionLines: string[] = [];
    let offset = index + 1;

    while (offset < lines.length) {
      const line = lines[offset] ?? "";

      if (line.startsWith("  ") || line.trim() === "") {
        sectionLines.push(line);
        offset += 1;
        continue;
      }

      break;
    }

    sections.push(sectionLines);
  }

  return sections;
}
