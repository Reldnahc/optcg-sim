import { createMatchHttpServer } from "./match-http-server.js";

const commaSeparatedEnvironmentList = (value: string | undefined): string[] =>
  value
    ?.split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0) ?? [];

const port = Number.parseInt(process.env["PORT"] ?? "5177", 10);
const host = process.env["HOST"] ?? "127.0.0.1";
const server = await createMatchHttpServer({
  allowedBrowserOrigins: commaSeparatedEnvironmentList(
    process.env["PONEGLYPH_SIM_BROWSER_ORIGINS"],
  ),
  allowTemplateMatches: false,
  createDefaultMatch: false,
  ...(process.env["REDIS_URL"] === undefined
    ? {}
    : { redisUrl: process.env["REDIS_URL"] }),
  ...(process.env["PONEGLYPH_SIM_STATIC_DIR"] === undefined
    ? {}
    : { staticAssetsDirectory: process.env["PONEGLYPH_SIM_STATIC_DIR"] }),
});

await server.listen(port, host);
process.stdout.write(`OPTCG match server listening at ${server.url()}\n`);
