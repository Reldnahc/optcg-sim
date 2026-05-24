import type { ParseInput, PrimitiveEvidence } from "../types.js";

export type ProtectionProcess =
  | { readonly type: "fieldRemoval" }
  | { readonly type: "ko" };

export interface ProtectionProcessParseResult {
  readonly process: ProtectionProcess;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export const fieldRemovalProtectionProcessPrimitive = {
  primitiveId: "protectionProcess:fieldRemoval",
  matches: [
    {
      id: "cannot-be-removed-from-field",
    },
  ],
} as const;

export const koProtectionProcessPrimitive = {
  primitiveId: "protectionProcess:ko",
  matches: [
    {
      id: "cannot-be-ko",
    },
  ],
} as const;

export function parseProtectionProcess(
  input: ParseInput,
): ProtectionProcessParseResult | undefined {
  const fieldRemovalMatch =
    /^cannot be removed from the field\b\s*(?<rest>.*)$/i.exec(input.text);
  if (fieldRemovalMatch !== null) {
    return {
      process: { type: "fieldRemoval" },
      evidence: ["protectionProcess:fieldRemoval"],
      rest: fieldRemovalMatch.groups?.["rest"]?.trim() ?? "",
    };
  }

  const koMatch = /^cannot be K\.O\.'d\b\s*(?<rest>.*)$/i.exec(input.text);
  if (koMatch !== null) {
    return {
      process: { type: "ko" },
      evidence: ["protectionProcess:ko"],
      rest: koMatch.groups?.["rest"]?.trim() ?? "",
    };
  }

  return undefined;
}
