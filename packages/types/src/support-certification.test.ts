import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  ParserSupportCertificate,
  RuntimeSupportReport,
  SupportEvidenceRecord,
} from "./index.js";

test("support certification types represent parser and runtime evidence separately", () => {
  const parserRecord = {
    authority: "parser",
    family: "body",
    id: "draw",
    sourceSpanIds: ["span:body"],
  } satisfies SupportEvidenceRecord;

  const certificate = {
    complete: true,
    records: [parserRecord],
    missing: [],
  } satisfies ParserSupportCertificate;

  const runtimeReport = {
    supported: true,
    records: [
      {
        authority: "runtime",
        family: "body",
        id: "draw",
        supported: true,
      },
    ],
    missing: [],
  } satisfies RuntimeSupportReport;

  assert.equal(certificate.records[0]?.authority, "parser");
  assert.equal(runtimeReport.records[0]?.authority, "runtime");
});
