import { createDevHttpServer } from "./dev-http-server.js";

const port = Number.parseInt(process.env["PORT"] ?? "5177", 10);
const server = await createDevHttpServer();

await server.listen(port);
process.stdout.write(`OPTGC dev match server listening at ${server.url()}\n`);
