import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach } from "vitest";

export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

export const storyPath = path.join(
  repoRoot,
  "tests/fixtures/stories/INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
);

const tempDirs = [];

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((tempDir) => rm(tempDir, { recursive: true, force: true })),
  );
});

export async function makeTempDir() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "optcg-agent-packets-"));
  tempDirs.push(tempDir);
  return tempDir;
}

export function runPacketTool(args, options = {}) {
  return spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      path.join(repoRoot, "tools/build-agent-packet.ts"),
      ...args,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      ...options,
    },
  );
}
