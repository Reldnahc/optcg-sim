import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, relative, resolve, sep } from "node:path";

const contentTypes = new Map<string, string>([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".wav", "audio/wav"],
]);

const isInsideDirectory = (
  baseDirectory: string,
  filePath: string,
): boolean => {
  const path = relative(baseDirectory, filePath);
  return (
    path.length === 0 || (!path.startsWith("..") && !path.includes(`..${sep}`))
  );
};

const contentTypeForPath = (path: string): string =>
  contentTypes.get(extname(path)) ?? "application/octet-stream";

const staticAssetPath = async (
  root: string,
  relativePath: string,
): Promise<string | undefined> => {
  const filePath = resolve(root, relativePath);
  if (!isInsideDirectory(root, filePath)) {
    return undefined;
  }
  const fileStat = await stat(filePath).catch(() => undefined);
  if (fileStat !== undefined && fileStat.isFile()) {
    return filePath;
  }
  if (extname(relativePath).length > 0) {
    return undefined;
  }
  const fallbackPath = resolve(root, "index.html");
  const fallbackStat = await stat(fallbackPath).catch(() => undefined);
  return fallbackStat !== undefined && fallbackStat.isFile()
    ? fallbackPath
    : undefined;
};

export const serveStaticAssets = async (
  request: IncomingMessage,
  response: ServerResponse,
  staticDirectory: string,
): Promise<boolean> => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return false;
  }

  const url = new URL(request.url ?? "/", "http://localhost");
  const requestedPath = decodeURIComponent(url.pathname);
  const relativePath =
    requestedPath === "/" ? "index.html" : requestedPath.replace(/^\/+/u, "");
  const root = resolve(staticDirectory);
  const filePath = await staticAssetPath(root, relativePath);
  if (filePath === undefined) {
    return false;
  }
  const fileStat = await stat(filePath);

  response.writeHead(200, {
    "cache-control":
      filePath === resolve(root, "index.html")
        ? "no-cache"
        : "public, max-age=31536000, immutable",
    "content-length": String(fileStat.size),
    "content-type": contentTypeForPath(filePath),
  });
  if (request.method === "HEAD") {
    response.end();
    return true;
  }
  createReadStream(filePath).pipe(response);
  return true;
};

export const serveStaticAssetsOrNotFound = async (
  request: IncomingMessage,
  response: ServerResponse,
  staticDirectory: string | undefined,
  handleNotFound: () => Promise<void>,
): Promise<void> => {
  if (
    staticDirectory !== undefined &&
    (await serveStaticAssets(request, response, staticDirectory))
  ) {
    return;
  }
  await handleNotFound();
};
