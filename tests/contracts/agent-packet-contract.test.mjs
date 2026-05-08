import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "vitest";

import { repoRoot } from "./agent-packet-test-support.mjs";

test("repo guidance documents active-story packet requirements", async () => {
  const agents = await readFile(path.join(repoRoot, "AGENTS.md"), "utf8");
  const packetTemplate = await readFile(
    path.join(repoRoot, "specs/26-agent-packet-template.md"),
    "utf8",
  );
  const workflow = await readFile(
    path.join(repoRoot, "specs/27-spec-driven-story-generation-workflow.md"),
    "utf8",
  );
  const codexIntegration = await readFile(
    path.join(repoRoot, "specs/32-codex-agent-integration.md"),
    "utf8",
  );
  const packageJson = await readFile(
    path.join(repoRoot, "package.json"),
    "utf8",
  );

  assert.match(
    agents,
    /Approved stories may exist without packets until they become active\./,
  );
  assert.match(
    agents,
    /Before implementation starts, before a worker or reviewer subagent is assigned, and before PR handoff begins, generate a current checked-in packet/,
  );
  assert.match(
    agents,
    /Use `pnpm run packets:generate --story <stories\/approved\/\.\.\.yaml> --activate` to build or refresh the packet/,
  );
  assert.match(
    agents,
    /Use `pnpm run packets:complete --story <stories\/approved\/\.\.\.yaml>` after a story is merged/,
  );
  assert.match(
    agents,
    /A cleanup commit containing only the exact file changes produced by `pnpm run packets:complete --story <stories\/approved\/\.\.\.yaml>` or `pnpm run packets:complete-many --story <stories\/approved\/\.\.\.yaml> --story <stories\/approved\/\.\.\.yaml>` does not require a separate reviewer subagent run/i,
  );
  assert.match(
    agents,
    /If cleanup requires any manual edit beyond the packet completion command output, including edits to packet files, `agent-packets\/active\.json`, tooling, tests, fixtures, specs, workflow docs, or story files, run full verification and a separate reviewer subagent before pushing or merging/i,
  );
  assert.match(
    packetTemplate,
    /allow approved stories to sit without packets until they become active, but require a current checked-in packet before implementation assignment, reviewer assignment, or PR handoff/,
  );
  assert.match(
    packetTemplate,
    /complete stories through one packet-tool operation that moves the story to done history, removes the active packet, and clears the completed story from the active packet manifest/,
  );
  assert.match(
    packetTemplate,
    /treat the exact file changes produced by that completion operation as generated lifecycle cleanup that needs repo verification but does not need separate reviewer-subagent review unless any manual edits are added/,
  );
  assert.match(
    workflow,
    /Approved stories may remain packetless while they are dormant backlog items\./,
  );
  assert.match(
    workflow,
    /run the packet completion command to move the completed story to `stories\/done\/`, mark it `done`, remove its active packet, and clear or replace the active-story manifest/,
  );
  assert.match(
    workflow,
    /A commit that contains only the exact file changes produced by the packet completion command is a generated lifecycle cleanup and does not need a separate reviewer-subagent pass/i,
  );
  assert.match(
    codexIntegration,
    /Verify that the active story packet is present and current before worker assignment, reviewer assignment, or PR handoff\./,
  );
  assert.match(codexIntegration, /run the packet completion command/i);
  assert.match(
    codexIntegration,
    /Pure packet-completion cleanup does not require reviewer-subagent review/i,
  );
  assert.match(packageJson, /"packets:complete"/);
  assert.match(packageJson, /"packets:complete-many"/);
});
