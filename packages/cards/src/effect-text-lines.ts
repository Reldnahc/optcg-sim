import { supportedEntryPoints } from "./entry-point-definitions.js";
import {
  createSourceSlice,
  trimSource,
  type SourceSlice,
} from "./source-slices.js";

export const gameplayLinesFromTextParts = (
  parts: readonly (string | null | undefined)[],
): string[] =>
  gameplayLineSlicesFromTextParts(parts).map((slice) => slice.text);

export const gameplayLineSlicesFromTextParts = (
  parts: readonly (string | null | undefined)[],
): SourceSlice[] =>
  groupBulletBlockSlices(
    joinDetachedEffectHeaderSlices(
      parts.flatMap((text) => rangedNonReminderLines(text ?? "")),
    ),
  );

const rangedNonReminderLines = (text: string): SourceSlice[] => {
  const root = createSourceSlice(text);
  const lines: SourceSlice[] = [];
  const pattern = /[^\r\n]+/gu;

  for (const match of root.rawText.matchAll(pattern)) {
    const index = match.index;
    const rawText = match[0];
    const trimmed = trimSource({
      text: rawText,
      rawText,
      start: root.start + index,
      end: root.start + index + rawText.length,
    });
    if (trimmed.text.length > 0 && !isParentheticalReminderLine(trimmed.text)) {
      lines.push(...splitAdjacentEntryPointSlices(trimmed));
    }
  }

  return lines;
};

const isParentheticalReminderLine = (line: string): boolean =>
  line.startsWith("(") && line.endsWith(")");

const splitAdjacentEntryPointSlices = (line: SourceSlice): SourceSlice[] => {
  const splitStarts = [0];

  for (let index = 1; index < line.rawText.length; index += 1) {
    if (isAdjacentEntryPointStart(line.rawText, index)) {
      splitStarts.push(index);
    }
  }

  if (splitStarts.length === 1) {
    return [line];
  }

  return splitStarts.map((start, index) => {
    const end = splitStarts[index + 1] ?? line.rawText.length;
    const rawText = line.rawText.slice(start, end);
    return trimSource({
      text: rawText,
      rawText,
      start: line.start + start,
      end: line.start + end,
    });
  });
};

const isAdjacentEntryPointStart = (text: string, index: number): boolean => {
  if (text[index] !== "[") {
    return false;
  }
  const precedingText = text.slice(0, index).trimEnd();
  return (
    precedingText.endsWith(".") &&
    supportedEntryPoints.some((entryPoint) =>
      text.startsWith(entryPoint.text, index),
    )
  );
};

const joinDetachedEffectHeaderSlices = (
  lines: readonly SourceSlice[],
): SourceSlice[] => {
  const joined: SourceSlice[] = [];
  let pendingHeaders: SourceSlice[] = [];

  for (const line of lines) {
    if (isDetachedEffectHeader(line.text)) {
      pendingHeaders = [...pendingHeaders, line];
      continue;
    }

    if (pendingHeaders.length === 0) {
      joined.push(line);
    } else {
      const slices = [...pendingHeaders, line];
      joined.push(
        joinSlices(slices, slices.map((slice) => slice.text).join(" ")),
      );
      pendingHeaders = [];
    }
  }

  if (pendingHeaders.length > 0) {
    joined.push(
      joinSlices(
        pendingHeaders,
        pendingHeaders.map((slice) => slice.text).join(" "),
      ),
    );
  }

  return joined;
};

const isDetachedEffectHeader = (line: string): boolean =>
  supportedEntryPoints.some((entryPoint) => entryPoint.text === line) ||
  line === "[Once Per Turn]";

const groupBulletBlockSlices = (
  lines: readonly SourceSlice[],
): SourceSlice[] => {
  const grouped: SourceSlice[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined) {
      break;
    }

    const header = parseBulletBlockHeader(line.text);
    if (header === undefined) {
      grouped.push(line);
      index += 1;
      continue;
    }

    const block = [line];
    index += 1;
    while (index < lines.length) {
      const bulletLine = lines[index];
      if (bulletLine === undefined || !isBulletLine(bulletLine.text)) {
        break;
      }
      block.push(bulletLine);
      index += 1;
    }
    const trailingLine = lines[index];
    if (
      header.includeTrailingThen &&
      trailingLine !== undefined &&
      /^then,/iu.test(trailingLine.text)
    ) {
      block.push(trailingLine);
      index += 1;
    }
    grouped.push(
      joinSlices(block, block.map((slice) => slice.text).join("\n")),
    );
  }

  return grouped;
};

const parseBulletBlockHeader = (
  line: string,
): { readonly includeTrailingThen: boolean } | undefined => {
  if (/chooses? one:\s*$/iu.test(line)) {
    return { includeTrailingThen: true };
  }
  if (
    /^Apply each of the following effects based on the number of cards in your trash:\s*$/iu.test(
      line,
    )
  ) {
    return { includeTrailingThen: false };
  }
  return undefined;
};

const isBulletLine = (line: string): boolean =>
  line.startsWith("\u2022") || line.startsWith("-");

const joinSlices = (
  slices: readonly SourceSlice[],
  text: string,
): SourceSlice => {
  const first = slices[0];
  const last = slices[slices.length - 1];

  return {
    text,
    rawText: slices.map((slice) => slice.rawText).join("\n"),
    start: first?.start ?? 0,
    end: last?.end ?? 0,
  };
};
