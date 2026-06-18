export function normalizeParserText(text: string): string {
  return text
    .replace(/[\u2018\u2019]/gu, "'")
    .replace(/[\u201c\u201d]/gu, '"')
    .replace(/\uff0d/gu, "\u2212");
}
