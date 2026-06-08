import { createMatchHttpServer } from "./match-http-server.js";

const port = Number.parseInt(process.env["PORT"] ?? "5177", 10);
const host = process.env["HOST"] ?? "127.0.0.1";
const server = await createMatchHttpServer();

await server.listen(port, host);
process.stdout.write(`OPTCG match server listening at ${server.url()}\n`);
