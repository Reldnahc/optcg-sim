export type AppRouteId =
  | "dashboard"
  | "play"
  | "lobbies"
  | "match"
  | "notFound";

export interface AppRouteDefinition {
  id: Exclude<AppRouteId, "notFound">;
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
  { id: "play", path: "/play", label: "Play" },
  { id: "lobbies", path: "/lobbies", label: "Lobbies" },
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
  if (parsed.pathname.startsWith("/lobbies/")) {
    return {
      id: "lobbies",
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

export const appRoutePath = (id: Exclude<AppRouteId, "notFound">): string => {
  const route = appRoutes.find((candidate) => candidate.id === id);
  if (route === undefined) {
    throw new Error(`Unknown app route ${id}.`);
  }
  return route.path;
};

export const isShellRoute = (id: AppRouteId): boolean => id !== "match";
