import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

async function readCanonicalTypes() {
  return readFile(
    path.join(repoRoot, "contracts", "canonical-types.ts"),
    "utf8",
  );
}

test("GameState keeps the once-per-turn ledger in canonical state", async () => {
  const canonicalTypes = await readCanonicalTypes();

  assert.match(
    canonicalTypes,
    /export interface GameState\s*{[\s\S]*?\boncePerTurn:\s*OncePerTurnRecord\[];[\s\S]*?}/m,
  );
});

test("Action preserves branded IDs for effect activation and decision responses", async () => {
  const canonicalTypes = await readCanonicalTypes();

  assert.match(
    canonicalTypes,
    /type:\s*"activateEffect";[\s\S]*?\beffectId:\s*EffectId;/m,
  );
  assert.match(
    canonicalTypes,
    /type:\s*"respondToDecision";[\s\S]*?\bdecisionId:\s*DecisionId;/m,
  );
});

test("PoneglyphCardDetail preserves the raw API payload shape", async () => {
  const canonicalTypes = await readCanonicalTypes();

  assert.match(
    canonicalTypes,
    /export interface PoneglyphOfficialFaq\s*{[\s\S]*?\bupdated_on:\s*string;[\s\S]*?}/m,
  );
  assert.match(
    canonicalTypes,
    /export interface PoneglyphErrata\s*{[\s\S]*?\blabel:\s*string\s*\|\s*null;[\s\S]*?\bbefore_text:\s*string\s*\|\s*null;[\s\S]*?\bafter_text:\s*string\s*\|\s*null;[\s\S]*?}/m,
  );
  assert.match(
    canonicalTypes,
    /export interface PoneglyphVariant\s*{[\s\S]*?\bname:\s*string\s*\|\s*null;[\s\S]*?\blabel:\s*string\s*\|\s*null;[\s\S]*?\bartist:\s*string\s*\|\s*null;[\s\S]*?\bset_code:\s*string\s*\|\s*null;[\s\S]*?\breleased_at:\s*string\s*\|\s*null;[\s\S]*?\btcgplayer_url:\s*string\s*\|\s*null;[\s\S]*?\bmarket_price:\s*string\s*\|\s*null;[\s\S]*?}/m,
  );
  assert.match(
    canonicalTypes,
    /export interface PoneglyphLegalityRecord\s*{[\s\S]*?\bbanned_at\?:\s*string;[\s\S]*?\bmax_copies\?:\s*number;[\s\S]*?\bpaired_with\?:\s*string\[];[\s\S]*?}/m,
  );
  assert.match(
    canonicalTypes,
    /export interface PoneglyphCardDetail\s*{[\s\S]*?\bcard_number:\s*string;[\s\S]*?\bset_name:\s*string;[\s\S]*?\breleased_at:\s*string\s*\|\s*null;[\s\S]*?\bcard_type:\s*string;[\s\S]*?\brarity:\s*string\s*\|\s*null;[\s\S]*?\bcost:\s*number\s*\|\s*null;[\s\S]*?\bpower:\s*number\s*\|\s*null;[\s\S]*?\bcounter:\s*number\s*\|\s*null;[\s\S]*?\blife:\s*number\s*\|\s*null;[\s\S]*?\battribute:\s*string\[]\s*\|\s*null;[\s\S]*?\beffect:\s*string\s*\|\s*null;[\s\S]*?\btrigger:\s*string\s*\|\s*null;[\s\S]*?\bblock:\s*string\s*\|\s*null;[\s\S]*?\bavailable_languages:\s*string\[];[\s\S]*?\bofficial_faq:\s*PoneglyphOfficialFaq\[];[\s\S]*?}/m,
  );
  assert.doesNotMatch(canonicalTypes, /\bcardNumber:\s*string;/);
  assert.doesNotMatch(
    canonicalTypes,
    /\bsetName:\s*string;[\s\S]*?export interface PoneglyphCardDetail/m,
  );
  assert.doesNotMatch(canonicalTypes, /\bavailableLanguages:\s*string\[];/);
  assert.doesNotMatch(
    canonicalTypes,
    /\bofficialFaq:\s*PoneglyphOfficialFaq\[];[\s\S]*?export interface PoneglyphCardDetail/m,
  );
});

test("ResolvedCard retains errata in normalized manifests", async () => {
  const canonicalTypes = await readCanonicalTypes();

  assert.match(canonicalTypes, /export type NormalizedErrata\s*=/m);
  assert.match(
    canonicalTypes,
    /export interface ResolvedCard\s*{[\s\S]*?\berrata:\s*NormalizedErrata\[];[\s\S]*?}/m,
  );
});
