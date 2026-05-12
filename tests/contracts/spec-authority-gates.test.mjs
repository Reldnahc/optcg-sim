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

async function readText(relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

function assertContainsWords(text, phrase) {
  const pattern = phrase
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll(" ", "\\s+");
  assert.match(text, new RegExp(pattern));
}

function assertMandatoryCodeStandardLink(text) {
  assert.match(
    text,
    /`docs\/code-standard\.md` (?:is|as) mandatory implementation guidance/,
  );
}

function extractSection(text, sectionRef, nextSectionRef) {
  const startMarker = `Section Ref: \`${sectionRef}\``;
  const start = text.indexOf(startMarker);
  assert.notEqual(start, -1, `missing section ${sectionRef}`);

  const endMarker = `Section Ref: \`${nextSectionRef}\``;
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing following section ${nextSectionRef}`);

  return text.slice(start, end);
}

function extractSectionToEnd(text, sectionRef) {
  const startMarker = `Section Ref: \`${sectionRef}\``;
  const start = text.indexOf(startMarker);
  assert.notEqual(start, -1, `missing section ${sectionRef}`);

  return text.slice(start);
}

test("spec authority index separates canonical and historical files", async () => {
  const index = await readText("specs/README.md");

  assert.match(index, /## Canonical authority index/);
  assert.match(
    index,
    /GameState\/events\/decisions[\s\S]*03-game-state-events-decisions\.md/,
  );
  assert.match(
    index,
    /Effect DSL[\s\S]*05-effect-dsl-reference\.md[\s\S]*contracts\/effect-dsl\.schema\.json/,
  );
  assert.match(
    index,
    /terminal engine milestone[\s\S]*12-roadmap\.md[\s\S]*15-implementation-kickoff\.md/,
  );
  assert.match(index, /workflow[\s\S]*AGENTS\.md[\s\S]*docs\/workflow\//);
  assert.match(
    index,
    /Historical\/explanatory[\s\S]*16-typescript-interface-draft\.md/,
  );
});

test("TypeScript interface draft is historical and non-normative", async () => {
  const draft = await readText("specs/16-typescript-interface-draft.md");

  assert.match(draft, /^status:\s+"historical"$/m);
  assert.match(draft, /\bnon-normative\b/i);
  assert.match(
    draft,
    /must not use this draft over `contracts\/canonical-types\.ts` or package source types/i,
  );
  assert.doesNotMatch(draft, /^status:\s+"canonical"$/m);
});

test("code standard guide is mandatory implementation guidance", async () => {
  const agents = await readText("AGENTS.md");
  const storyExecution = await readText("docs/workflow/story-execution.md");
  const codeStandard = await readText("docs/code-standard.md");

  assert.match(codeStandard, /^# Code Standard Guide$/m);
  assertMandatoryCodeStandardLink(agents);
  assertMandatoryCodeStandardLink(storyExecution);
});

test("event specs require append-order strictly increasing event sequences", async () => {
  const eventsSpec = await readText("specs/03-game-state-events-decisions.md");

  assert.match(
    eventsSpec,
    /EngineResult\.events from one accepted transition must be strictly increasing/,
  );
  assert.match(
    eventsSpec,
    /final `state\.eventJournal` must be strictly increasing/,
  );
  assert.match(
    eventsSpec,
    /Event `seq` values must be allocated by append order/,
  );
  assert.match(
    eventsSpec,
    /must not create multiple events in one `push` call when event IDs or seq values depend on `events\.length`/,
  );
});

test("Effect DSL policy classifies schema-supported and planned primitives", async () => {
  const dslSpec = await readText("specs/05-effect-dsl-reference.md");

  assert.match(
    dslSpec,
    /contracts\/effect-dsl\.schema\.json` is the executable JSON fixture contract/,
  );
  assert.match(dslSpec, /Schema-supported fixture subset/);
  assert.match(
    dslSpec,
    /Planned\/not fixture-authorable until schema coverage exists/,
  );
  assertContainsWords(
    dslSpec,
    "new fixture-authorable primitives must add schema coverage and validation fixtures",
  );

  for (const supportedPrimitive of [
    "trigger: onPlay",
    "condition: yourTurn",
    "condition: attachedDonCount",
    "cost: restDon",
    "effect: draw",
    "effect: ko",
    "effect: modifyPower",
    "effect: sequence",
    "effect: custom",
  ]) {
    assert.match(dslSpec, new RegExp(supportedPrimitive));
  }

  for (const plannedPrimitive of [
    "effect: drawUpTo",
    "effect: search",
    "effect: revealTop",
    "effect: playSelected",
    "effect: replacement",
    "condition: fieldCount",
    "cost: returnDon",
  ]) {
    assert.match(dslSpec, new RegExp(plannedPrimitive));
  }
});

test("engine mechanics spec preserves parenthetical explanatory note authority", async () => {
  const engineSpec = await readText("specs/02-engine-mechanics.md");
  const explanatoryNotes = extractSectionToEnd(
    engineSpec,
    "02-engine-mechanics.s045",
  );

  for (const requiredText of [
    "Comprehensive Rules 2-8-4",
    "parenthetical explanatory notes",
    "keyword effects and other card effects",
    "do not influence gameplay",
    "support and classification logic may ignore parenthetical explanatory notes when deciding whether remaining printed text requires simulator implementation",
    "must not mutate raw Poneglyph text",
    "normalized `ResolvedCard.effectText`",
    "manifest display text",
    "PlayerView card text",
    "`sourceTextHash`",
    "`behaviorHash`",
    "reviewed printed-text evidence",
    "simulator overlay, keyword behavior table, effect DSL definitions, custom handlers, rulings, support status, and card-specific tests remain the gameplay implementation authority",
  ]) {
    assertContainsWords(explanatoryNotes, requiredText);
  }
});

test("specs define generated card support from complete parse and runtime capabilities", async () => {
  const overview = await readText("specs/00-project-overview.md");
  const architecture = await readText("specs/01-system-architecture.md");
  const effectRuntime = await readText("specs/04-effect-runtime.md");
  const dslSpec = await readText("specs/05-effect-dsl-reference.md");
  const cardPolicy = await readText("specs/09-card-data-and-support-policy.md");
  const testingSpec = await readText("specs/11-testing-quality.md");
  const roadmap = await readText("specs/12-roadmap.md");
  const examples = await readText("specs/20-card-implementation-examples.md");

  const cardSupport = extractSection(
    overview,
    "00-project-overview.s014",
    "00-project-overview.s015",
  );
  const sourceData = extractSectionToEnd(overview, "00-project-overview.s020");
  const topology = extractSection(
    architecture,
    "01-system-architecture.s023",
    "01-system-architecture.s024",
  );
  const runtimeSupport = extractSection(
    effectRuntime,
    "04-effect-runtime.s005",
    "04-effect-runtime.s006",
  );
  const textToDsl = extractSection(
    dslSpec,
    "05-effect-dsl-reference.s022",
    "05-effect-dsl-reference.s023",
  );
  const generatedSupport = extractSection(
    cardPolicy,
    "09-card-data-and-support-policy.s016",
    "09-card-data-and-support-policy.s017",
  );
  const cardDataTests = extractSection(
    testingSpec,
    "11-testing-quality.s020",
    "11-testing-quality.s021",
  );
  const milestoneFive = extractSection(
    roadmap,
    "12-roadmap.s009",
    "12-roadmap.s010",
  );
  const implementationExamplesPurpose = extractSection(
    examples,
    "20-card-implementation-examples.s002",
    "20-card-implementation-examples.s003",
  );

  for (const requiredText of [
    "certified parser rule",
    "completely parses the card's gameplay-relevant text",
    "runtime capability matrix confirms every parsed component is currently supported",
    "Partial, ambiguous, stale, or capability-missing parses remain unsupported for normal play",
  ]) {
    assertContainsWords(cardSupport, requiredText);
  }

  for (const requiredText of [
    "generated support index",
    "complete parsed behavior is playable in normal modes",
  ]) {
    assertContainsWords(sourceData, requiredText);
  }

  for (const requiredText of [
    "certified parser rules may generate complete parsed effect definitions",
    "runtime capability matrix gates generated support status",
    "not from a manual per-card allowlist or manual card-to-mechanic map",
    "any unparsed, ambiguous, stale, unsupported, or capability-missing component keeps the card unsupported in normal play",
  ]) {
    assertContainsWords(topology, requiredText);
  }

  for (const requiredText of [
    "runtime must expose or consume a capability matrix",
    "keyword bodies, DSL primitives, trigger timings, decision types, replacement processes, visibility modes, target shapes, costs, and custom handlers",
    "Multiple parsed effects from one card compose into one generated `EffectDefinition`",
    "the entire generated support record fails closed for normal play",
  ]) {
    assertContainsWords(runtimeSupport, requiredText);
  }

  for (const requiredText of [
    "Generated DSL from Poneglyph printed card text when certified parser rules produce a complete parse and runtime capability checks pass",
    "Once a parser rule is certified, matching complete-parse cards may be generated without a manual per-card allowlist or manual card-to-mechanic map",
    "Partial parse output may be reported for coverage progress, but it must not make the card playable in normal modes",
    "Bandai or Poneglyph wording drift must invalidate the affected parse/hash evidence or downgrade support",
  ]) {
    assertContainsWords(textToDsl, requiredText);
  }

  for (const requiredText of [
    "Common-template card support is generated from complete parsing plus runtime capability checks",
    "must not depend on a manual per-card allowlist or a manual card-to-mechanic map",
    "Complete parse means every gameplay-relevant part of a card is parsed",
    "runtime capability matrix records which generated components the current engine can execute",
    "generated support index maps Poneglyph card IDs and source hashes to generated `EffectDefinition` IDs",
    "Multiple parsed effects for one card compose into one generated `EffectDefinition`",
    "Partial support reporting is allowed and encouraged for progress tracking",
    "Partial support does not make a card playable in normal modes",
    "Generated support fails closed",
    "New parser rules, ambiguous parse classes, custom handlers, and wording or ruling ambiguity require review",
  ]) {
    assertContainsWords(generatedSupport, requiredText);
  }

  for (const requiredText of [
    "CD-009 generated support index accepts only complete-parse cards whose every parsed component is covered by the runtime capability matrix",
    "CD-010 partial, ambiguous, stale, unparsed, unsupported, or capability-missing generated support reports do not make cards playable in normal modes",
    "CD-011 certified parser-rule fixtures auto-support matching complete-parse common-template cards without a manual per-card allowlist",
  ]) {
    assertContainsWords(cardDataTests, requiredText);
  }

  for (const requiredText of [
    "Complete-parse generated support index and runtime capability matrix",
    "Complete-parse common-template cards can be supported by certified parser rules without manual per-card mapping",
    "Partial, stale, ambiguous, unparsed, or capability-missing generated support remains rejected in normal play",
  ]) {
    assertContainsWords(milestoneFive, requiredText);
  }

  for (const requiredText of [
    "parser-rule certification fixtures",
    "A complete parser rule may auto-support matching common-template cards only when it parses the entire gameplay-relevant text",
    "not evidence for a manual per-card allowlist or partial support",
  ]) {
    assertContainsWords(implementationExamplesPurpose, requiredText);
  }
});

test("Milestone 1 exit gates require full vanilla CLI, local smoke hash reconstruction, sequencing, and real filterStateForPlayer tests", async () => {
  const roadmap = await readText("specs/12-roadmap.md");
  const kickoff = await readText("specs/15-implementation-kickoff.md");
  const roadmapMilestoneOne = extractSection(
    roadmap,
    "12-roadmap.s005",
    "12-roadmap.s006",
  );
  const roadmapMilestoneSix = extractSection(
    roadmap,
    "12-roadmap.s010",
    "12-roadmap.s011",
  );
  const kickoffDone = extractSection(
    kickoff,
    "15-implementation-kickoff.s011",
    "15-implementation-kickoff.s012",
  );
  const milestoneOneGateTexts = [roadmapMilestoneOne, kickoffDone];

  for (const requiredGate of [
    "CLI can play a complete vanilla match through normal legal actions",
    "Character play from hand exists",
    "Stage play from hand exists",
    "DON!! attach/refresh works",
    "Attacks against Leader and rested Character work",
    "Damage, life-to-hand, K.O., deck-out, and concession endings work",
    "Every accepted action has stable state hash output",
    "Event journal seq is strictly increasing",
    "Local deterministic CLI command/decision script smoke from fixture boot reproduces script-defined state-hash checkpoints and final hash",
    "without requiring production ReplayCheckpoint artifacts",
    "production `filterStateForPlayer` hidden-info tests consume real engine output",
  ]) {
    for (const text of milestoneOneGateTexts) {
      assertContainsWords(text, requiredGate);
    }
  }

  for (const text of milestoneOneGateTexts) {
    assertContainsWords(
      text,
      "Milestone 1 does not include server, client, Poneglyph live adapter, Redis, ranked",
    );
    assertContainsWords(text, "broad card pool work");
    assertContainsWords(
      text,
      "production ReplayLog, ReplayHeader, persisted replay storage, rollback, recovery, version migration, or replay viewer",
    );
    assert.doesNotMatch(text, /Golden replay reconstructs final hash/);
    assert.doesNotMatch(text, /Completed match replay final hash matches/);
  }

  assertContainsWords(
    roadmapMilestoneSix,
    "Completed match replay final hash matches",
  );
});

test("CLI runner spec authorizes optional strict command-script failure semantics only for local developer CLI", async () => {
  const kickoff = await readText("specs/15-implementation-kickoff.md");
  const cliRunner = extractSection(
    kickoff,
    "15-implementation-kickoff.s007",
    "15-implementation-kickoff.s008",
  );

  for (const requiredText of [
    "command-script mode may support an optional strict flag using the exact form `--command-script <script> --strict`",
    "strict mode, command parse errors must exit nonzero",
    "strict mode, engine or CLI dispatch errors must exit nonzero",
    "diagnostics must be deterministic and useful",
    "stderr must include the failed command and error reason",
    "stdout command-result output for the failed command must remain available",
    "Non-strict command-script behavior remains unchanged unless a later spec section changes it",
    "Interactive developer behavior remains unchanged",
    "This is local/developer CLI behavior only, not match server protocol behavior",
  ]) {
    assertContainsWords(cliRunner, requiredText);
  }

  for (const excludedScope of [
    "match server protocol",
    "browser client",
    "replay schema",
    "hidden-information filtering",
    "database contracts",
  ]) {
    assertContainsWords(cliRunner, excludedScope);
  }
});

test("content publication policy spec authorizes MIT source repository publication without public simulator launch", async () => {
  const publicationPolicy = await readText(
    "specs/13-content-publication-policy.md",
  );
  const publication = extractSectionToEnd(
    publicationPolicy,
    "13-content-publication-policy.s013",
  );

  for (const requiredText of [
    "repository's own source code, specifications, documentation, tests, and tooling may be licensed under the MIT License when a root `LICENSE` file is present",
    "source repository may be made public on GitHub after the root `LICENSE` file and README license note land",
    "Source repository publication is not a public simulator launch",
    "public alpha",
    "public gameplay availability",
    "package publication",
    "deployment",
    "production service availability",
    "Neither the MIT source license nor making the repository public grants rights to redistribute, add, license, or use third-party card names, card text, images, set symbols, trademarks, logos, or other third-party content",
    "follow-up license implementation story must use an explicitly human-confirmed copyright holder and year",
  ]) {
    assertContainsWords(publication, requiredText);
  }
});

test("specs authorize only a narrow post-merge packet cleanup bypass", async () => {
  const toolingSpec = await readText(
    "specs/23-repo-tooling-and-enforcement.md",
  );
  const workflowSpec = await readText(
    "specs/27-spec-driven-story-generation-workflow.md",
  );
  const codexSpec = await readText("specs/32-codex-agent-integration.md");

  const mergeGates = extractSection(
    toolingSpec,
    "23-repo-tooling-and-enforcement.s016",
    "23-repo-tooling-and-enforcement.s017",
  );
  const completionChecks = extractSection(
    workflowSpec,
    "27-spec-driven-story-generation-workflow.s015",
    "27-spec-driven-story-generation-workflow.s016",
  );
  const mergeGateRecommendation = extractSection(
    codexSpec,
    "32-codex-agent-integration.s013",
    "32-codex-agent-integration.s014",
  );

  for (const requiredText of [
    "Ordinary protected-branch changes still require a pull request, at least one human review, and passing required checks",
    "dedicated GitHub App actor `optcg-packet-cleanup[bot]`",
    "workflow `.github/workflows/post-merge-packet-cleanup.yml`",
    "token `POST_MERGE_PACKET_CLEANUP_TOKEN`",
    "only to push exact packet-completion command output to `main` after a reviewed pull request has merged",
    "must not be available to arbitrary GitHub Actions workflows, human users, broad admin roles, implementation changes, docs changes, tooling changes, or ordinary development pushes",
  ]) {
    assertContainsWords(mergeGates, requiredText);
  }

  for (const requiredText of [
    "Post-merge cleanup metadata is a reviewed cleanup request, not standalone authority to mutate story state",
    "must bind the requested cleanup to reviewed pull-request evidence, the merge state, trusted checked-in approved story files, current packet evidence, and, for parent cleanup, included substory evidence",
    "fail closed when cleanup metadata is absent, malformed, stale, unbound to reviewed evidence, or names a story that is not eligible for completion",
    "The cleanup workflow must check out trusted `main` or default-branch code, not unreviewed pull-request branch code",
    "must not open a cleanup pull request",
    "Manual fallback is only for operational failure",
    "Branch deletion may run only after packet lifecycle cleanup succeeds and only for associated merged, unprotected story or substory branches",
  ]) {
    assertContainsWords(completionChecks, requiredText);
    assertContainsWords(mergeGateRecommendation, requiredText);
  }

  for (const requiredText of [
    "packet-completion cleanup may use cleanup-scoped lifecycle verification instead of full repo verification before the direct cleanup push",
    "Cleanup-scoped lifecycle verification must prove metadata binding, packet-completion output, story lifecycle state, active packet state, and committed story metadata remain valid",
    "that includes any manual edit beyond packet-completion output still requires full repo verification and the normal reviewer-subagent path before push or merge",
  ]) {
    assertContainsWords(mergeGates, requiredText);
    assertContainsWords(completionChecks, requiredText);
    assertContainsWords(mergeGateRecommendation, requiredText);
  }

  for (const prohibitedPattern of [
    /arbitrary GitHub Actions workflows to bypass branch protection/i,
    /human users .* use this cleanup bypass/i,
  ]) {
    assert.doesNotMatch(completionChecks, prohibitedPattern);
    assert.doesNotMatch(mergeGateRecommendation, prohibitedPattern);
  }
});

test("root license and README scope MIT source publication to repository-owned material", async () => {
  const license = await readText("LICENSE");
  const readme = await readText("README.md");

  for (const requiredLicenseText of [
    "MIT License",
    "Copyright (c) 2026 Chandler Lee",
    "Permission is hereby granted, free of charge, to any person obtaining a copy",
    'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND',
  ]) {
    assertContainsWords(license, requiredLicenseText);
  }

  for (const requiredReadmeText of [
    "## License",
    "repository's own source code, specifications, documentation, tests, and tooling are licensed under the MIT License",
    "[LICENSE](LICENSE)",
    "does not grant rights to third-party card names, card text, images, trademarks, logos, or other third-party content",
  ]) {
    assertContainsWords(readme, requiredReadmeText);
  }
});

test("root disclaimer states unofficial third-party content ownership boundary", async () => {
  const disclaimer = await readText("DISCLAIMER.md");
  const readme = await readText("README.md");

  for (const requiredDisclaimerText of [
    "This project is unofficial",
    "not affiliated with, endorsed by, sponsored by, or approved by any ONE PIECE or ONE PIECE Card Game rightsholder",
    "does not own or claim rights to ONE PIECE, the ONE PIECE Card Game, related game assets, card names, card text, card images, artwork, characters, logos, trademarks, or other third-party content",
    "Third-party names, images, text, and marks remain the property of their respective owners",
  ]) {
    assertContainsWords(disclaimer, requiredDisclaimerText);
  }

  for (const requiredReadmeText of [
    "## Disclaimer",
    "[DISCLAIMER.md](DISCLAIMER.md)",
  ]) {
    assertContainsWords(readme, requiredReadmeText);
  }

  assert.doesNotMatch(disclaimer, /set symbols/i);
  assert.doesNotMatch(readme, /set symbols/i);
});
