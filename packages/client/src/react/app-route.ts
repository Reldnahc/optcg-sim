export type AppRouteId =
  | "dashboard"
  | "lobbies"
  | "match"
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
] as const satisfies readonly AppRouteDefinition[];

const routeByPath = new Map<string, AppRouteDefinition>(
  appRoutes.map((route) => [route.path, route]),
);

export const appRouteFromPath = (pathWithSearch: string): AppRouteState => {
  const parsed = new URL(pathWithSearch, "http://localhost");
  if (parsed.pathname === "/" && parsed.searchParams.has("matchId")) {
    return {
      id: "match",
      path: parsed.pathname,
      search: parsed.search,
    };
  }

  const route = routeByPath.get(parsed.pathname);
  if (
    parsed.pathname.startsWith("/lobbies/") ||
    /^\/r\/[0-9a-z]{4}$/u.test(parsed.pathname)
  ) {
    return {
      id: "lobbies",
      path: parsed.pathname,
      search: parsed.search,
    };
  }
  if (/^\/replays\/[^/]+$/u.test(parsed.pathname)) {
    return {
      id: "replay",
      path: parsed.pathname,
      search: parsed.search,
    };
  }
  return {
    id: route?.id ?? "notFound",
    path: parsed.pathname,
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
