import { createDevHttpServer } from "./dev-http-server.js";

const port = Number.parseInt(process.env["PORT"] ?? "5177", 10);
const server = createDevHttpServer();

await server.listen(port);
process.stdout.write(`OPTGC dev match UI listening at ${server.url()}\n`);
