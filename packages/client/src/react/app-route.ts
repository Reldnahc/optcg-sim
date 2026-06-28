export type AppRouteId =
  | "dashboard"
  | "lobbies"
  | "match"
  | "replayList"
  | "replay"
  | "notFound";

export interface AppRouteDefinition {
  id: Exclude<AppRouteId, "lobbies" | "notFound">;
  path: string;
  label: string;
}

export interface AppRouteState {
  id: AppRouteId;
  path: string;
  search: string;
}

export const appRoutes = [
  { id: "dashboard", path: "/", label: "Home" },
  { id: "match", path: "/match", label: "Match" },
  { id: "replayList", path: "/replays", label: "Replays" },
] as const satisfies readonly AppRouteDefinition[];

const routeByPath = new Map<string, AppRouteDefinition>(
  appRoutes.map((route) => [route.path, route]),
);

const normalizeBasePath = (basePath: string): string => {
  if (basePath === "" || basePath === "/") {
    return "/";
  }
  return `/${basePath.replace(/^\/+|\/+$/gu, "")}`;
};

const stripBasePath = (pathname: string, basePath: string): string => {
  const normalizedBase = normalizeBasePath(basePath);
  if (normalizedBase === "/") {
    return pathname;
  }
  if (pathname === normalizedBase) {
    return "/";
  }
  return pathname.startsWith(`${normalizedBase}/`)
    ? pathname.slice(normalizedBase.length)
    : pathname;
};

export const appRouteFromPath = (
  pathWithSearch: string,
  basePath = import.meta.env.BASE_URL,
): AppRouteState => {
  const parsed = new URL(pathWithSearch, "http://localhost");
  const pathname = stripBasePath(parsed.pathname, basePath);
  if (pathname === "/" && parsed.searchParams.has("matchId")) {
    return {
      id: "match",
      path: pathname,
      search: parsed.search,
    };
  }

  const route = routeByPath.get(pathname);
  if (
    pathname.startsWith("/lobbies/") ||
    /^\/r\/[0-9a-z]{4}$/u.test(pathname)
  ) {
    return {
      id: "lobbies",
      path: pathname,
      search: parsed.search,
    };
  }
  if (/^\/replays\/[^/]+$/u.test(pathname)) {
    return {
      id: "replay",
      path: pathname,
      search: parsed.search,
    };
  }
  return {
    id: route?.id ?? "notFound",
    path: pathname,
    search: parsed.search,
  };
};

export const appRoutePath = (
  id: Exclude<AppRouteId, "lobbies" | "replay" | "notFound">,
): string => {
  const route = appRoutes.find((candidate) => candidate.id === id);
  if (route === undefined) {
    throw new Error(`Unknown app route ${id}.`);
  }
  return route.path;
};

export const isShellRoute = (id: AppRouteId): boolean =>
  id !== "match" && id !== "replay";
