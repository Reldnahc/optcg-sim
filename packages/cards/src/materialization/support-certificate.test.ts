import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardId } from "@optcg/types";
import type { ParsedRuntimeEffectLine } from "../types.js";
import { materializeEffectDefinition } from "./effect-definitions.js";
import { createParserSupportCertificate } from "./support-certificate.js";

const parsedRuntimeLine = (
  evidence: readonly ParsedRuntimeEffectLine["evidence"][number][],
): ParsedRuntimeEffectLine => ({
  kind: "effect",
  evidence,
  block: {
    category: "auto",
    trigger: { type: "onPlay" },
    sourcePresencePolicy: "mustRemainInSameZone",
    effect: { type: "draw", count: 1, player: "self" },
  },
  sourceMap: {
    textKind: "effect",
    sourceText: "[On Play] Draw 1 card.",
    spans: [
      {
        id: "span:entry",
        role: "entry",
        start: 0,
        end: 9,
        text: "[On Play]",
        primitiveEvidence: ["entry:onPlay"],
      },
      {
        id: "span:body",
        role: "body",
        start: 10,
        end: 22,
        text: "Draw 1 card.",
        primitiveEvidence: ["instruction:draw"],
      },
    ],
  },
});

test("parser certificate groups primitive evidence by support family", () => {
  const certificate = createParserSupportCertificate([
    parsedRuntimeLine(["entry:onPlay", "instruction:draw"]),
  ]);

  assert.equal(certificate.complete, true);
  assert.deepEqual(
    certificate.records.map((record) => [
      record.authority,
      record.family,
      record.id,
      record.sourceSpanIds,
    ]),
    [
      ["parser", "entryPoint", "onPlay", ["span:entry"]],
      ["parser", "body", "draw", ["span:body"]],
    ],
  );
});

test("parser certificate fails closed when a runtime line has no primitive evidence", () => {
  const certificate = createParserSupportCertificate([parsedRuntimeLine([])]);

  assert.equal(certificate.complete, false);
  assert.deepEqual(certificate.records, []);
  assert.deepEqual(certificate.missing, [
    {
      authority: "parser",
      family: "unknown",
      id: "primitiveEvidence",
      reason: "runtime effect line has no primitive parser evidence",
      effectPath: ["0"],
    },
  ]);
});

test("materialized effect definitions expose parser support certificates", () => {
  const materialized = materializeEffectDefinition(
    "OP01-001" as CardId,
    ["[On Play] Draw 1 card."],
    "source-hash",
    {
      effectDefinitionsVersion: "effects-test",
      rulesVersion: "rules-test",
    },
    { evaluateRuntimeSupport: () => ({ supported: true }) },
  );

  assert.equal(materialized.runtimeSupported, true);
  assert.equal(materialized.parserCertificate.complete, true);
  assert.deepEqual(
    materialized.parserCertificate.records.map((record) => [
      record.authority,
      record.family,
      record.id,
    ]),
    [
      ["parser", "entryPoint", "onPlay"],
      ["parser", "sourcePresence", "mustRemain"],
      ["parser", "body", "draw"],
      ["parser", "quantity", "positiveInteger"],
      ["parser", "player", "self"],
      ["parser", "composition", "entryExpression"],
    ],
  );
});
