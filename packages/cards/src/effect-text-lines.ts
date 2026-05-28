export const gameplayLinesFromTextParts = (
  parts: readonly (string | null | undefined)[],
): string[] =>
  parts
    .flatMap((text) => (text ?? "").split(/\r?\n/u))
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !isParentheticalReminderLine(line));

const isParentheticalReminderLine = (line: string): boolean =>
  line.startsWith("(") && line.endsWith(")");
