import path from "node:path";

import { createServer } from "vite";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const server = await createServer({
  appType: "custom",
  configFile: false,
  logLevel: "silent",
  root: repoRoot,
  server: { hmr: false, middlewareMode: true },
});

try {
  const module = await server.ssrLoadModule("/packages/cli/src/boot.ts");
  const result = module.bootFixtureMatch();
  process.stdout.write(`${JSON.stringify(result.summary)}\n`);
} finally {
  await server.close();
}
