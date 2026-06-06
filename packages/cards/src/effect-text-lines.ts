import { supportedEntryPoints } from "./entry-point-definitions.js";

export const gameplayLinesFromTextParts = (
  parts: readonly (string | null | undefined)[],
): string[] =>
  groupChooseOneBlocks(
    joinDetachedEffectHeaders(
      parts
        .flatMap((text) => (text ?? "").split(/\r?\n/u))
        .map((line) => line.trim())
        .filter(
          (line) => line.length > 0 && !isParentheticalReminderLine(line),
        ),
    ),
  );

const isParentheticalReminderLine = (line: string): boolean =>
  line.startsWith("(") && line.endsWith(")");

const joinDetachedEffectHeaders = (lines: readonly string[]): string[] => {
  const joined: string[] = [];
  let pendingHeader = "";

  for (const line of lines) {
    if (isDetachedEffectHeader(line)) {
      pendingHeader =
        pendingHeader.length === 0 ? line : `${pendingHeader} ${line}`;
      continue;
    }
    joined.push(pendingHeader.length === 0 ? line : `${pendingHeader} ${line}`);
    pendingHeader = "";
  }

  if (pendingHeader.length > 0) {
    joined.push(pendingHeader);
  }

  return joined;
};

const isDetachedEffectHeader = (line: string): boolean =>
  supportedEntryPoints.some((entryPoint) => entryPoint.text === line) ||
  line === "[Once Per Turn]";

const groupChooseOneBlocks = (lines: readonly string[]): string[] => {
  const grouped: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined) {
      break;
    }

    if (!isChooseOneHeader(line)) {
      grouped.push(line);
      index += 1;
      continue;
    }

    const block = [line];
    index += 1;
    while (index < lines.length) {
      const bulletLine = lines[index];
      if (bulletLine === undefined || !bulletLine.startsWith("\u2022")) {
        break;
      }
      block.push(bulletLine);
      index += 1;
    }
    const trailingLine = lines[index];
    if (trailingLine !== undefined && /^then,/iu.test(trailingLine)) {
      block.push(trailingLine);
      index += 1;
    }
    grouped.push(block.join("\n"));
  }

  return grouped;
};

const isChooseOneHeader = (line: string): boolean =>
  /choose one:\s*$/iu.test(line);
