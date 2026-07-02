export const malformedSourceTextReason = (text: string): string | undefined => {
  const normalized = text.replace(/\s+/gu, " ").trim();
  if (
    /\b(?:has|have) the attribute\b/iu.test(normalized) ||
    /\bby attribute cards?\b/iu.test(normalized)
  ) {
    return "missing attribute value";
  }
  return undefined;
};
