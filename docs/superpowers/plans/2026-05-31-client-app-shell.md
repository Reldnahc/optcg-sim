# Client App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production-shaped client app shell with a dashboard at `/`, route modules for Play, Lobbies, Decks, Profile, and a match route that mounts the existing match board.

**Architecture:** Introduce a small client-side route model and an `AppRoot` that chooses between shell pages and the existing `MatchApp`. Keep shell navigation/page layout separate from match-board internals. The shell is presentational plus route selection only; current match/lobby session logic stays in `MatchApp` and its controller hooks.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, existing plain CSS files under `packages/client/src/react/styles`.

---

## File Structure

- Create `packages/client/src/react/app-route.ts`
  - Owns route IDs, path parsing, navigation helpers, and route metadata.
- Create `packages/client/src/react/AppRoot.tsx`
  - Top-level router component mounted by `main.tsx`.
  - Renders `MatchApp` only for the match route.
- Create `packages/client/src/react/AppShell.tsx`
  - Shared app chrome for dashboard/play/lobbies/decks/profile/not-found pages.
- Create `packages/client/src/react/ShellPageCard.tsx`
  - Small reusable card/link component for dashboard and entry pages.
- Create `packages/client/src/react/DashboardPage.tsx`
  - Dashboard cards for Play, Lobbies, Decks, Profile.
- Create `packages/client/src/react/PlayPage.tsx`
  - Ranked/unranked future-service states and dev play entry link.
- Create `packages/client/src/react/LobbiesPage.tsx`
  - Custom lobby entry page with current dev-lobby link semantics.
- Create `packages/client/src/react/DecksPage.tsx`
  - Static future-integration page for the Poneglyph deck builder.
- Create `packages/client/src/react/ProfilePage.tsx`
  - Static future-integration page for Poneglyph identity/profile.
- Create `packages/client/src/react/NotFoundPage.tsx`
  - Unknown route fallback.
- Create `packages/client/src/react/styles/app-shell-pages.css`
  - Shell/page-only styles. Do not move playmat or board styles here.
- Modify `packages/client/src/react/main.tsx`
  - Mount `AppRoot` instead of `MatchApp`.
  - Import the new shell page stylesheet.
- Test `packages/client/src/react/app-route.test.ts`
  - Route parsing and path construction.
- Test `packages/client/src/react/app-root.test.tsx`
  - AppRoot route rendering and match route delegation.
- Test `packages/client/src/react/app-shell-pages.test.tsx`
  - Shell page rendering.
- Test `packages/client/src/react/app-shell-boundary.test.ts`
  - Source scan preventing shell files from importing server/engine modules.

---

## Task 1: Route Model

**Files:**

- Create: `packages/client/src/react/app-route.ts`
- Test: `packages/client/src/react/app-route.test.ts`

- [ ] **Step 1: Write the failing route tests**

Create `packages/client/src/react/app-route.test.ts`:

```ts
import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import {
  appRouteFromPath,
  appRoutePath,
  appRoutes,
  isShellRoute,
} from "./app-route.js";

describe("client app routes", () => {
  test("maps public shell paths to route ids", () => {
    assert.equal(appRouteFromPath("/").id, "dashboard");
    assert.equal(appRouteFromPath("/play").id, "play");
    assert.equal(appRouteFromPath("/lobbies").id, "lobbies");
    assert.equal(appRouteFromPath("/decks").id, "decks");
    assert.equal(appRouteFromPath("/profile").id, "profile");
    assert.equal(appRouteFromPath("/match").id, "match");
  });

  test("preserves query strings for the match route", () => {
    const route = appRouteFromPath("/match?matchId=abc&seat=p2");

    assert.equal(route.id, "match");
    assert.equal(route.search, "?matchId=abc&seat=p2");
  });

  test("preserves existing root match links with match or lobby query params", () => {
    assert.equal(appRouteFromPath("/?matchId=abc&seat=p1").id, "match");
    assert.equal(appRouteFromPath("/?lobbyId=abc&seat=p2").id, "match");
  });

  test("returns notFound for unknown paths", () => {
    const route = appRouteFromPath("/missing");

    assert.equal(route.id, "notFound");
    assert.equal(route.path, "/missing");
  });

  test("builds canonical app paths", () => {
    assert.equal(appRoutePath("dashboard"), "/");
    assert.equal(appRoutePath("play"), "/play");
    assert.equal(appRoutePath("lobbies"), "/lobbies");
    assert.equal(appRoutePath("decks"), "/decks");
    assert.equal(appRoutePath("profile"), "/profile");
    assert.equal(appRoutePath("match"), "/match");
  });

  test("separates shell routes from the match-board route", () => {
    assert.equal(isShellRoute("dashboard"), true);
    assert.equal(isShellRoute("play"), true);
    assert.equal(isShellRoute("lobbies"), true);
    assert.equal(isShellRoute("decks"), true);
    assert.equal(isShellRoute("profile"), true);
    assert.equal(isShellRoute("notFound"), true);
    assert.equal(isShellRoute("match"), false);
    assert.deepEqual(
      appRoutes.map((route) => route.id),
      ["dashboard", "play", "lobbies", "decks", "profile", "match"],
    );
  });
});
```

- [ ] **Step 2: Run the route test and verify RED**

Run:

```bash
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/react/app-route.test.ts
```

Expected: FAIL because `./app-route.js` does not exist.

- [ ] **Step 3: Implement the route model**

Create `packages/client/src/react/app-route.ts`:

```ts
export type AppRouteId =
  | "dashboard"
  | "play"
  | "lobbies"
  | "decks"
  | "profile"
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
  { id: "decks", path: "/decks", label: "Decks" },
  { id: "profile", path: "/profile", label: "Profile" },
  { id: "match", path: "/match", label: "Match" },
] as const satisfies readonly AppRouteDefinition[];

const routeByPath = new Map<string, AppRouteDefinition>(
  appRoutes.map((route) => [route.path, route]),
);

export const appRouteFromPath = (pathWithSearch: string): AppRouteState => {
  const parsed = new URL(pathWithSearch, "http://localhost");
  if (
    parsed.pathname === "/" &&
    (parsed.searchParams.has("matchId") || parsed.searchParams.has("lobbyId"))
  ) {
    return {
      id: "match",
      path: parsed.pathname,
      search: parsed.search,
    };
  }
  const route = routeByPath.get(parsed.pathname);
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
```

- [ ] **Step 4: Run the route test and verify GREEN**

Run:

```bash
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/react/app-route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/react/app-route.ts packages/client/src/react/app-route.test.ts
git commit -m "Add client app route model"
```

---

## Task 2: Shell Components And Pages

**Files:**

- Create: `packages/client/src/react/AppShell.tsx`
- Create: `packages/client/src/react/ShellPageCard.tsx`
- Create: `packages/client/src/react/DashboardPage.tsx`
- Create: `packages/client/src/react/PlayPage.tsx`
- Create: `packages/client/src/react/LobbiesPage.tsx`
- Create: `packages/client/src/react/DecksPage.tsx`
- Create: `packages/client/src/react/ProfilePage.tsx`
- Create: `packages/client/src/react/NotFoundPage.tsx`
- Create: `packages/client/src/react/app-shell-pages.test.tsx`
- Create: `packages/client/src/react/styles/app-shell-pages.css`

- [ ] **Step 1: Write the failing page rendering tests**

Create `packages/client/src/react/app-shell-pages.test.tsx`:

```ts
import { strict as assert } from "node:assert";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import { AppShell } from "./AppShell.js";
import { DashboardPage } from "./DashboardPage.js";
import { DecksPage } from "./DecksPage.js";
import { LobbiesPage } from "./LobbiesPage.js";
import { NotFoundPage } from "./NotFoundPage.js";
import { PlayPage } from "./PlayPage.js";
import { ProfilePage } from "./ProfilePage.js";

describe("client app shell pages", () => {
  test("dashboard exposes the primary navigation entries", () => {
    const html = renderToStaticMarkup(
      <AppShell activeRouteId="dashboard">
        <DashboardPage />
      </AppShell>,
    );

    assert.match(html, /Play/u);
    assert.match(html, /Custom Lobbies/u);
    assert.match(html, /Decks/u);
    assert.match(html, /Profile/u);
  });

  test("play page keeps future-service queue states separate from dev play", () => {
    const html = renderToStaticMarkup(
      <AppShell activeRouteId="play">
        <PlayPage />
      </AppShell>,
    );

    assert.match(html, /Ranked Queue/u);
    assert.match(html, /Unranked Queue/u);
    assert.match(html, /Dev Match/u);
  });

  test("lobbies page exposes current custom lobby entry", () => {
    const html = renderToStaticMarkup(
      <AppShell activeRouteId="lobbies">
        <LobbiesPage />
      </AppShell>,
    );

    assert.match(html, /Create Custom Lobby/u);
    assert.match(html, /Join Custom Lobby/u);
  });

  test("deck and profile pages describe future integrations honestly", () => {
    const deckHtml = renderToStaticMarkup(
      <AppShell activeRouteId="decks">
        <DecksPage />
      </AppShell>,
    );
    const profileHtml = renderToStaticMarkup(
      <AppShell activeRouteId="profile">
        <ProfilePage />
      </AppShell>,
    );

    assert.match(deckHtml, /Poneglyph deck builder/u);
    assert.match(profileHtml, /Poneglyph account/u);
  });

  test("not-found page links back to the dashboard", () => {
    const html = renderToStaticMarkup(
      <AppShell activeRouteId="notFound">
        <NotFoundPage path="/missing" />
      </AppShell>,
    );

    assert.match(html, /Page not found/u);
    assert.match(html, /href="\/"/u);
  });
});
```

- [ ] **Step 2: Run the page tests and verify RED**

Run:

```bash
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/react/app-shell-pages.test.tsx
```

Expected: FAIL because the shell/page modules do not exist.

- [ ] **Step 3: Implement `ShellPageCard`**

Create `packages/client/src/react/ShellPageCard.tsx`:

```tsx
export interface ShellPageCardProps {
  title: string;
  description: string;
  href?: string | undefined;
  label?: string | undefined;
  disabled?: boolean | undefined;
}

export const ShellPageCard = ({
  title,
  description,
  href,
  label = "Open",
  disabled = false,
}: ShellPageCardProps): React.JSX.Element => (
  <article className={`shell-page-card ${disabled ? "is-disabled" : ""}`}>
    <h3>{title}</h3>
    <p>{description}</p>
    {disabled || href === undefined ? (
      <span className="shell-card-action is-disabled">{label}</span>
    ) : (
      <a className="shell-card-action" href={href}>
        {label}
      </a>
    )}
  </article>
);
```

- [ ] **Step 4: Implement `AppShell`**

Create `packages/client/src/react/AppShell.tsx`:

```tsx
import { appRoutePath, appRoutes, type AppRouteId } from "./app-route.js";

export interface AppShellProps {
  activeRouteId: AppRouteId;
  children: React.ReactNode;
}

const navRoutes = appRoutes.filter((route) => route.id !== "match");

export const AppShell = ({
  activeRouteId,
  children,
}: AppShellProps): React.JSX.Element => (
  <div className="client-app-shell">
    <header className="client-shell-header">
      <a className="client-shell-brand" href={appRoutePath("dashboard")}>
        Poneglyph Sim
      </a>
      <nav className="client-shell-nav" aria-label="Primary">
        {navRoutes.map((route) => (
          <a
            key={route.id}
            className={route.id === activeRouteId ? "is-active" : ""}
            href={route.path}
          >
            {route.label}
          </a>
        ))}
      </nav>
    </header>
    <main className="client-shell-main">{children}</main>
  </div>
);
```

- [ ] **Step 5: Implement page modules**

Create `packages/client/src/react/DashboardPage.tsx`:

```tsx
import { appRoutePath } from "./app-route.js";
import { ShellPageCard } from "./ShellPageCard.js";

export const DashboardPage = (): React.JSX.Element => (
  <section className="shell-page">
    <div className="shell-page-heading">
      <h1>Dashboard</h1>
      <p>Choose a play flow, manage decks, or review account state.</p>
    </div>
    <div className="shell-card-grid">
      <ShellPageCard
        title="Play"
        description="Enter queue flows or launch a development match."
        href={appRoutePath("play")}
        label="Go to Play"
      />
      <ShellPageCard
        title="Custom Lobbies"
        description="Create or join custom games with the current local lobby flow."
        href={appRoutePath("lobbies")}
        label="Open Lobbies"
      />
      <ShellPageCard
        title="Decks"
        description="Future home for the Poneglyph deck builder."
        href={appRoutePath("decks")}
        label="View Decks"
      />
      <ShellPageCard
        title="Profile"
        description="Future account, identity, and player settings."
        href={appRoutePath("profile")}
        label="View Profile"
      />
    </div>
  </section>
);
```

Create `packages/client/src/react/PlayPage.tsx`:

```tsx
import { appRoutePath } from "./app-route.js";
import { ShellPageCard } from "./ShellPageCard.js";

export const PlayPage = (): React.JSX.Element => (
  <section className="shell-page">
    <div className="shell-page-heading">
      <h1>Play</h1>
      <p>
        Queue entry will live here once deck and account validation are wired.
      </p>
    </div>
    <div className="shell-card-grid">
      <ShellPageCard
        title="Ranked Queue"
        description="Requires production accounts, deck validation, and ladder policy."
        label="Unavailable"
        disabled
      />
      <ShellPageCard
        title="Unranked Queue"
        description="Requires queue tickets and server-side deck validation."
        label="Unavailable"
        disabled
      />
      <ShellPageCard
        title="Dev Match"
        description="Open the current match board for local simulator testing."
        href={appRoutePath("match")}
        label="Open Match"
      />
    </div>
  </section>
);
```

Create `packages/client/src/react/LobbiesPage.tsx`:

```tsx
import { appRoutePath } from "./app-route.js";
import { ShellPageCard } from "./ShellPageCard.js";

export const LobbiesPage = (): React.JSX.Element => (
  <section className="shell-page">
    <div className="shell-page-heading">
      <h1>Custom Lobbies</h1>
      <p>
        Use the current local lobby flow while production lobby services evolve.
      </p>
    </div>
    <div className="shell-card-grid">
      <ShellPageCard
        title="Create Custom Lobby"
        description="Start the current dev lobby flow from the match board."
        href={appRoutePath("match")}
        label="Create"
      />
      <ShellPageCard
        title="Join Custom Lobby"
        description="Open an existing lobby link with lobbyId and seat query parameters."
        href={appRoutePath("match")}
        label="Join"
      />
    </div>
  </section>
);
```

Create `packages/client/src/react/DecksPage.tsx`:

```tsx
export const DecksPage = (): React.JSX.Element => (
  <section className="shell-page">
    <div className="shell-page-heading">
      <h1>Decks</h1>
      <p>
        The Poneglyph deck builder will live here after account and deck APIs
        are connected.
      </p>
    </div>
  </section>
);
```

Create `packages/client/src/react/ProfilePage.tsx`:

```tsx
export const ProfilePage = (): React.JSX.Element => (
  <section className="shell-page">
    <div className="shell-page-heading">
      <h1>Profile</h1>
      <p>
        Poneglyph account identity, player settings, and linked simulator state
        will live here.
      </p>
    </div>
  </section>
);
```

Create `packages/client/src/react/NotFoundPage.tsx`:

```tsx
import { appRoutePath } from "./app-route.js";

export interface NotFoundPageProps {
  path: string;
}

export const NotFoundPage = ({
  path,
}: NotFoundPageProps): React.JSX.Element => (
  <section className="shell-page">
    <div className="shell-page-heading">
      <h1>Page not found</h1>
      <p>No simulator page exists at {path}.</p>
      <a className="shell-card-action" href={appRoutePath("dashboard")}>
        Back to dashboard
      </a>
    </div>
  </section>
);
```

- [ ] **Step 6: Add shell page styles**

Create `packages/client/src/react/styles/app-shell-pages.css`:

```css
.client-app-shell {
  min-height: 100vh;
  background: #161817;
  color: rgba(255, 255, 255, 0.88);
}

.client-shell-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 14px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(20, 22, 21, 0.96);
}

.client-shell-brand {
  color: #ffffff;
  font-size: 18px;
  font-weight: 700;
  text-decoration: none;
}

.client-shell-nav {
  display: flex;
  align-items: center;
  gap: 8px;
}

.client-shell-nav a {
  padding: 8px 10px;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 14px;
  text-decoration: none;
}

.client-shell-nav a:hover,
.client-shell-nav a.is-active {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.client-shell-main {
  width: min(1120px, calc(100vw - 48px));
  margin: 0 auto;
  padding: 32px 0;
}

.shell-page {
  display: grid;
  gap: 24px;
}

.shell-page-heading {
  display: grid;
  gap: 8px;
}

.shell-page-heading h1 {
  margin: 0;
  font-size: 32px;
  line-height: 1.1;
}

.shell-page-heading p {
  max-width: 720px;
  margin: 0;
  color: rgba(255, 255, 255, 0.68);
  font-size: 15px;
  line-height: 1.45;
}

.shell-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

.shell-page-card {
  display: grid;
  min-height: 148px;
  align-content: start;
  gap: 12px;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.055);
}

.shell-page-card h3 {
  margin: 0;
  color: #ffffff;
  font-size: 17px;
}

.shell-page-card p {
  margin: 0;
  color: rgba(255, 255, 255, 0.68);
  font-size: 14px;
  line-height: 1.4;
}

.shell-card-action {
  justify-self: start;
  align-self: end;
  margin-top: auto;
  padding: 8px 10px;
  border-radius: 6px;
  background: #4fd37a;
  color: #071109;
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
}

.shell-card-action.is-disabled,
.shell-page-card.is-disabled .shell-card-action {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.48);
}
```

- [ ] **Step 7: Run the page tests and verify GREEN**

Run:

```bash
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/react/app-shell-pages.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/react/AppShell.tsx packages/client/src/react/ShellPageCard.tsx packages/client/src/react/DashboardPage.tsx packages/client/src/react/PlayPage.tsx packages/client/src/react/LobbiesPage.tsx packages/client/src/react/DecksPage.tsx packages/client/src/react/ProfilePage.tsx packages/client/src/react/NotFoundPage.tsx packages/client/src/react/styles/app-shell-pages.css packages/client/src/react/app-shell-pages.test.tsx
git commit -m "Add client app shell pages"
```

---

## Task 3: App Root Wiring

**Files:**

- Create: `packages/client/src/react/AppRoot.tsx`
- Modify: `packages/client/src/react/main.tsx`
- Test: `packages/client/src/react/app-root.test.tsx`

- [ ] **Step 1: Write the failing app root tests**

Create `packages/client/src/react/app-root.test.tsx`:

```ts
import { strict as assert } from "node:assert";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import { AppRoot } from "./AppRoot.js";

describe("client app root", () => {
  test("renders the dashboard at the root path", () => {
    const html = renderToStaticMarkup(<AppRoot path="/" />);

    assert.match(html, /Dashboard/u);
    assert.match(html, /Go to Play/u);
  });

  test("renders each shell route", () => {
    assert.match(renderToStaticMarkup(<AppRoot path="/play" />), /Ranked Queue/u);
    assert.match(
      renderToStaticMarkup(<AppRoot path="/lobbies" />),
      /Create Custom Lobby/u,
    );
    assert.match(
      renderToStaticMarkup(<AppRoot path="/decks" />),
      /Poneglyph deck builder/u,
    );
    assert.match(
      renderToStaticMarkup(<AppRoot path="/profile" />),
      /Poneglyph account/u,
    );
  });

  test("renders not-found for unknown routes", () => {
    const html = renderToStaticMarkup(<AppRoot path="/missing" />);

    assert.match(html, /Page not found/u);
    assert.match(html, /\/missing/u);
  });

  test("delegates the match route without rendering shell dashboard", () => {
    const html = renderToStaticMarkup(
      <AppRoot
        matchSurface={<div data-testid="match-surface">Match board</div>}
        path="/match?matchId=abc&seat=p1"
      />,
    );

    assert.match(html, /data-app-route="match"/u);
    assert.match(html, /data-testid="match-surface"/u);
    assert.doesNotMatch(html, /Dashboard/u);
  });
});
```

- [ ] **Step 2: Run the app root test and verify RED**

Run:

```bash
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/react/app-root.test.tsx
```

Expected: FAIL because `AppRoot` does not exist.

- [ ] **Step 3: Implement `AppRoot`**

Create `packages/client/src/react/AppRoot.tsx`:

```tsx
import { AppShell } from "./AppShell.js";
import { appRouteFromPath } from "./app-route.js";
import { DashboardPage } from "./DashboardPage.js";
import { DecksPage } from "./DecksPage.js";
import { LobbiesPage } from "./LobbiesPage.js";
import { MatchApp } from "./MatchApp.js";
import { NotFoundPage } from "./NotFoundPage.js";
import { PlayPage } from "./PlayPage.js";
import { ProfilePage } from "./ProfilePage.js";

export interface AppRootProps {
  path?: string | undefined;
  matchSurface?: React.ReactNode | undefined;
}

export const AppRoot = ({
  path,
  matchSurface,
}: AppRootProps): React.JSX.Element => {
  const route = appRouteFromPath(
    path ?? `${window.location.pathname}${window.location.search}`,
  );
  if (route.id === "match") {
    return <div data-app-route="match">{matchSurface ?? <MatchApp />}</div>;
  }

  const page =
    route.id === "dashboard" ? (
      <DashboardPage />
    ) : route.id === "play" ? (
      <PlayPage />
    ) : route.id === "lobbies" ? (
      <LobbiesPage />
    ) : route.id === "decks" ? (
      <DecksPage />
    ) : route.id === "profile" ? (
      <ProfilePage />
    ) : (
      <NotFoundPage path={route.path} />
    );

  return <AppShell activeRouteId={route.id}>{page}</AppShell>;
};
```

- [ ] **Step 4: Update `main.tsx`**

Modify `packages/client/src/react/main.tsx`:

```tsx
import { createRoot } from "react-dom/client";
import { AppRoot } from "./AppRoot.js";
import "./styles.css";
import "./styles/app-shell.css";
import "./styles/app-shell-pages.css";
import "./styles/count-badge.css";
import "./styles/playmat.css";
import "./styles/zone.css";
import "./styles/card.css";
import "./styles/card-preview-window.css";
import "./styles/action-log-window.css";
import "./styles/controls.css";
import "./styles/modal-frame.css";
import "./styles/floating-window.css";
import "./styles/tabbed-floating-window.css";
import "./styles/decision-modal.css";
import "./styles/collection-modal.css";
import "./styles/reveal-window.css";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Missing root element.");
}

createRoot(root).render(<AppRoot />);
```

- [ ] **Step 5: Run the app root test and verify GREEN**

Run:

```bash
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/react/app-root.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/react/AppRoot.tsx packages/client/src/react/main.tsx packages/client/src/react/app-root.test.tsx
git commit -m "Wire client app root routes"
```

---

## Task 4: Boundary And Regression Tests

**Files:**

- Create: `packages/client/src/react/app-shell-boundary.test.ts`
- Modify: route/page tests only if needed for exact behavior discovered during implementation.

- [ ] **Step 1: Write shell boundary source scan**

Create `packages/client/src/react/app-shell-boundary.test.ts`:

```ts
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, test } from "vitest";

const sourceDirectory = join(process.cwd(), "packages/client/src/react");

const shellFiles = [
  "AppRoot.tsx",
  "AppShell.tsx",
  "DashboardPage.tsx",
  "PlayPage.tsx",
  "LobbiesPage.tsx",
  "DecksPage.tsx",
  "ProfilePage.tsx",
  "NotFoundPage.tsx",
  "ShellPageCard.tsx",
  "app-route.ts",
] as const;

describe("client app shell boundaries", () => {
  test("shell files do not import server or engine modules", async () => {
    for (const file of shellFiles) {
      const source = await readFile(join(sourceDirectory, file), "utf8");

      assert.doesNotMatch(source, /@optcg\/engine-core/u, file);
      assert.doesNotMatch(source, /@optcg\/match-server/u, file);
      assert.doesNotMatch(source, /\.\.\/\.\.\/match-server/u, file);
      assert.doesNotMatch(source, /\.\.\/\.\.\/engine-core/u, file);
    }
  });

  test("only AppRoot imports the match board surface", async () => {
    for (const file of shellFiles.filter(
      (candidate) => candidate !== "AppRoot.tsx",
    )) {
      const source = await readFile(join(sourceDirectory, file), "utf8");

      assert.doesNotMatch(source, /MatchApp/u, file);
    }
  });
});
```

- [ ] **Step 2: Run boundary test and verify GREEN**

Run:

```bash
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/react/app-shell-boundary.test.ts
```

Expected: PASS after Tasks 1-3 are implemented.

- [ ] **Step 3: Run focused client shell tests**

Run:

```bash
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/react/app-route.test.ts packages/client/src/react/app-shell-pages.test.tsx packages/client/src/react/app-root.test.tsx packages/client/src/react/app-shell-boundary.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/react/app-shell-boundary.test.ts
git commit -m "Add client app shell boundary tests"
```

---

## Task 5: Verification And Cleanup

**Files:**

- Modify only files required by formatting, lint, or type fixes.

- [ ] **Step 1: Run formatting check**

Run:

```bash
corepack pnpm run format:check
```

Expected: PASS. If it fails, run:

```bash
corepack pnpm exec prettier --write packages/client/src/react
```

Then rerun `corepack pnpm run format:check`.

- [ ] **Step 2: Run lint**

Run:

```bash
corepack pnpm lint
```

Expected: PASS. Fix only shell/client issues introduced by this plan.

- [ ] **Step 3: Run typecheck**

Run:

```bash
corepack pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Run client tests**

Run:

```bash
corepack pnpm --filter @optcg/client test
```

Expected: PASS.

- [ ] **Step 5: Run full repo verification**

Run:

```bash
corepack pnpm verify
```

Expected: PASS.

- [ ] **Step 6: Final cleanup commit if needed**

Only if Steps 1-5 required additional fixes:

```bash
git add packages/client/src/react
git commit -m "Verify client app shell"
```

If no files changed, skip this commit.

---

## Self-Review Notes

- Spec coverage: dashboard route, Play/Lobbies/Decks/Profile routes, Match route, match-board isolation, unknown route, boundary tests, and verification are each covered by a task.
- Scope check: no production auth, deck CRUD, queue backend, match engine, parser, or gameplay work is included.
- Type consistency: route IDs are defined once in `app-route.ts`; page and shell components consume those IDs through `AppRouteId` and `appRoutePath`.
