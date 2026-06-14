import { describe, expect, it } from "vitest";

import type {
  ParserSupportCertificate,
  RuntimeSupportReport,
} from "@optcg/types";

import {
  formatPrimitiveSupportSections,
  prefixPrimitiveSupportLines,
} from "./primitive-support-output.js";

describe("primitive support output", () => {
  it("formats parser certificate and runtime report records before missing evidence", () => {
    const parserCertificate = {
      complete: false,
      records: [
        {
          authority: "parser",
          family: "target",
          id: "opponentCharacters",
          sourceSpanIds: ["span:body"],
        },
      ],
      missing: [
        {
          authority: "parser",
          family: "unknown",
          id: "primitiveEvidence",
          reason: "runtime effect line has no primitive parser evidence",
        },
      ],
    } satisfies ParserSupportCertificate;
    const runtimeReports = [
      {
        supported: false,
        reason: "unsupported target primitive",
        records: [
          {
            authority: "runtime",
            family: "target",
            id: "opponentCharacters",
            supported: false,
            reason: "unsupported target primitive",
          },
        ],
        missing: [
          {
            authority: "runtime",
            family: "target",
            id: "opponentCharacters",
            reason: "unsupported target primitive",
          },
        ],
      },
    ] satisfies readonly RuntimeSupportReport[];

    expect(
      formatPrimitiveSupportSections({
        parserCertificate,
        runtimeReports,
      }),
    ).toEqual([
      "Primitive parser: failed",
      "Primitive runtime: failed",
      "Parser certificate records:",
      "- parser target:opponentCharacters spans span:body",
      "Runtime support records:",
      "- runtime target:opponentCharacters failed",
      "Missing parser evidence:",
      "- parser unknown:primitiveEvidence missing runtime effect line has no primitive parser evidence",
      "Missing runtime capability evidence:",
      "- runtime target:opponentCharacters missing unsupported target primitive",
    ]);
  });

  it("prefixes primitive support lines for card and deck audit contexts", () => {
    const lines = prefixPrimitiveSupportLines("OP01-002 line 1 ", [
      "Primitive runtime: failed",
      "Runtime support records:",
      "- runtime entryPoint:onBlock failed",
    ]);

    expect(lines).toEqual([
      "OP01-002 line 1 primitive runtime: failed",
      "OP01-002 line 1 runtime support records:",
      "OP01-002 line 1 - runtime entryPoint:onBlock failed",
    ]);
  });

  it("does not report empty runtime support as passed", () => {
    const parserCertificate = {
      complete: true,
      records: [],
      missing: [],
    } satisfies ParserSupportCertificate;

    expect(
      formatPrimitiveSupportSections({
        parserCertificate,
        runtimeReports: [],
      }),
    ).toContain("Primitive runtime: failed");
  });
});
