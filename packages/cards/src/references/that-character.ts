import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface ReferenceParseResult {
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export const thatCharacterReferencePrimitive = {
  primitiveId: "reference:thatCharacter",
  matches: [{ id: "that-character" }],
} as const;

export function parseThatCharacterReference(
  input: ParseInput,
): ReferenceParseResult | undefined {
  const match = /^that Character\b\s*(?<rest>.*)$/i.exec(input.text);
  if (match === null) {
    return undefined;
  }

  return {
    evidence: ["reference:thatCharacter", "target:thatCharacter"],
    rest: match.groups?.["rest"]?.trim() ?? "",
  };
}
