export interface BulletListPayload {
  readonly items: readonly string[];
  readonly trailingThen?: string;
}

export function parseBulletListPayload(
  text: string,
): BulletListPayload | undefined {
  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const items: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined || !line.startsWith("\u2022")) {
      break;
    }
    const item = line.slice(1).trim();
    if (item.length === 0) {
      return undefined;
    }
    items.push(item);
    index += 1;
  }

  const trailingLine = lines[index];
  if (trailingLine === undefined) {
    return { items };
  }

  if (index === lines.length - 1 && /^then,/iu.test(trailingLine)) {
    return { items, trailingThen: trailingLine };
  }

  return undefined;
}
