# Seatless Custom Lobbies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace direct-seat custom lobby joining with seatless lobby URLs where a local guest identity claims or resumes a server-assigned seat.

**Architecture:** Add a client guest identity helper, change the lobby transport/controller path to join by identity instead of caller-selected `p1`/`p2`, and update the dev match server lobby registry to own seat assignment. Keep match seat tokens as the live gameplay authority after a lobby becomes a match.

**Tech Stack:** TypeScript, React 19, Vite, Vitest, Node HTTP dev server, existing client controller/transport abstractions.

---

## File Structure

- Modify `packages/client/src/session.ts`
  - Add guest identity storage helpers beside existing match seat credential storage.
- Modify `packages/client/src/session.test.ts`
  - Cover guest identity generation, reuse, and clearing.
- Modify `packages/client/src/transport.ts`
  - Replace caller-selected `claimLobbySeat` input with identity-backed `joinLobby`.
- Modify `packages/client/src/transport-http.ts`
  - Call the new seatless lobby join endpoint with guest token authorization.
- Modify `packages/client/src/transport-http.test.ts`
  - Assert no `/seats/<playerId>/claim` lobby URL is emitted.
- Modify `packages/client/src/controller.ts`
  - Start/join lobbies using guest identity and server-assigned player seat.
- Modify `packages/client/src/controller.test.ts`
  - Cover start, seatless join, idempotent rejoin, live lobby transition, and no URL-seat authority.
- Modify `packages/client/src/react/useMatchClient-support.ts`
  - Stop using URL `seat` to choose lobby seats.
  - Add route parsing for `/lobbies/<lobbyId>`.
- Modify `packages/client/src/react/useMatchClient.ts`
  - Load `/lobbies/<lobbyId>` and join via guest identity.
- Modify `packages/client/src/react/use-match-session-actions.ts`
  - Create lobbies without passing a caller-selected player ID.
- Modify `packages/client/src/react/app-route.ts`
  - Treat `/lobbies/<lobbyId>` as a lobbies route.
- Modify `packages/client/src/react/LobbiesPage.tsx`
  - Expose create/share custom lobby affordances without seat URLs.
- Modify `packages/client/src/react/app-route.test.ts`
  - Cover dynamic lobby route parsing.
- Modify `packages/client/src/react/app-shell-pages.test.ts`
  - Cover seatless lobby copy/link behavior.
- Add `packages/client/src/react/seatless-lobby-boundary.test.ts`
  - Source scan preventing lobby URL `seat` authority from returning.
- Modify `packages/match-server/src/dev-http-server.ts`
  - Replace lobby seat-specific claim route with identity-backed join route.
- Modify `packages/match-server/src/dev-http-server.test.ts`
  - Cover first open seat, second identity, same identity rejoin, full lobby, and no token leakage.

---

## Task 1: Guest Identity Store

**Files:**

- Modify: `packages/client/src/session.ts`
- Modify: `packages/client/src/session.test.ts`

- [ ] **Step 1: Write failing guest identity tests**

Append these tests to `packages/client/src/session.test.ts`:

```ts
test("creates and reuses a local guest identity", () => {
  const storage = createMemoryClientStorage();
  const store = createClientSessionStore({ storage });

  const first = store.loadOrCreateGuestIdentity();
  const second = store.loadOrCreateGuestIdentity();

  assert.equal(first.guestToken, second.guestToken);
  assert.match(first.guestToken, /^guest:/u);
});

test("clears guest identity with session state", () => {
  const storage = createMemoryClientStorage();
  const store = createClientSessionStore({ storage });

  const guest = store.loadOrCreateGuestIdentity();
  store.clear();
  const nextGuest = store.loadOrCreateGuestIdentity();

  assert.notEqual(nextGuest.guestToken, guest.guestToken);
});
```

- [ ] **Step 2: Run the session tests and verify RED**

Run:

```bash
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/session.test.ts
```

Expected: FAIL because `loadOrCreateGuestIdentity` does not exist.

- [ ] **Step 3: Add guest identity types and storage**

Modify `packages/client/src/session.ts`:

```ts
export interface ClientGuestIdentity {
  guestToken: string;
}
```

Extend `ClientSessionStore`:

```ts
loadGuestIdentity: () => ClientGuestIdentity | undefined;
loadOrCreateGuestIdentity: () => ClientGuestIdentity;
```

Add key and generator near the existing keys:

```ts
const guestIdentityKey = "optcg:client:guest-identity";

const createGuestToken = (): string => `guest:${crypto.randomUUID()}`;
```

Add loader:

```ts
const loadGuestIdentity = (
  storage: ClientStorage,
): ClientGuestIdentity | undefined => {
  const parsed = parseJsonRecord(storage.getItem(guestIdentityKey));
  const guestToken = parsed?.["guestToken"];
  return guestToken === undefined ? undefined : { guestToken };
};
```

Add store methods inside `createClientSessionStore`:

```ts
  loadGuestIdentity() {
    return loadGuestIdentity(storage);
  },
  loadOrCreateGuestIdentity() {
    const existing = loadGuestIdentity(storage);
    if (existing !== undefined) {
      return existing;
    }
    const guest = { guestToken: createGuestToken() };
    storage.setItem(guestIdentityKey, JSON.stringify(guest));
    return guest;
  },
```

Update `clear()`:

```ts
  clear() {
    storage.removeItem(currentSeatKey);
    storage.removeItem(credentialKey);
    storage.removeItem(guestIdentityKey);
  },
```

- [ ] **Step 4: Run session tests and verify GREEN**

Run:

```bash
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/session.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/session.ts packages/client/src/session.test.ts
git commit -m "Add client guest identity store"
```

---

## Task 2: Server Seatless Lobby Join

**Files:**

- Modify: `packages/match-server/src/dev-http-server.ts`
- Modify: `packages/match-server/src/dev-http-server.test.ts`

- [ ] **Step 1: Write failing server tests for identity-owned lobby joins**

Update `packages/match-server/src/dev-http-server.test.ts` by adding helpers beside the existing lobby helpers:

```ts
const joinDevLobby = async (
  server: DevHttpServer,
  lobbyId: string,
  guestToken: string,
): Promise<{
  lobbyId?: string;
  matchId?: string;
  seat?: { playerId?: string };
  seats?: Record<string, { playerId?: string; claimed?: boolean }>;
  errors?: string[];
}> => {
  const response = await fetch(`${server.url()}/api/lobbies/${lobbyId}/join`, {
    method: "POST",
    headers: { "x-optcg-session-token": guestToken },
  });
  return (await response.json()) as {
    lobbyId?: string;
    matchId?: string;
    seat?: { playerId?: string };
    seats?: Record<string, { playerId?: string; claimed?: boolean }>;
    errors?: string[];
  };
};
```

Add tests:

```ts
test("seatless lobby join assigns first open seat by guest identity", async () => {
  const server = await startDevHttpServer();
  try {
    const created = await createDevLobby(server);

    const first = await joinDevLobby(
      server,
      String(created.lobbyId),
      "guest-a",
    );
    const second = await joinDevLobby(
      server,
      String(created.lobbyId),
      "guest-b",
    );

    assert.equal(first.seat?.playerId, "p1");
    assert.equal(second.seat?.playerId, "p2");
    assert.equal(second.matchId, "dev-local-match-1");
  } finally {
    await server.close();
  }
});

test("seatless lobby join is idempotent for the same guest identity", async () => {
  const server = await startDevHttpServer();
  try {
    const created = await createDevLobby(server);

    const first = await joinDevLobby(
      server,
      String(created.lobbyId),
      "guest-a",
    );
    const second = await joinDevLobby(
      server,
      String(created.lobbyId),
      "guest-a",
    );

    assert.equal(first.seat?.playerId, "p1");
    assert.equal(second.seat?.playerId, "p1");
    assert.equal(second.matchId, undefined);
  } finally {
    await server.close();
  }
});

test("seatless lobby join fails closed when the lobby is full", async () => {
  const server = await startDevHttpServer();
  try {
    const created = await createDevLobby(server);

    await joinDevLobby(server, String(created.lobbyId), "guest-a");
    await joinDevLobby(server, String(created.lobbyId), "guest-b");
    const third = await fetch(
      `${server.url()}/api/lobbies/${String(created.lobbyId)}/join`,
      { method: "POST", headers: { "x-optcg-session-token": "guest-c" } },
    );
    const body = (await third.json()) as { errors?: string[] };

    assert.equal(third.status, 409);
    assert.deepEqual(body.errors, ["Lobby is full."]);
  } finally {
    await server.close();
  }
});

test("lobby join responses do not expose guest tokens", async () => {
  const server = await startDevHttpServer();
  try {
    const created = await createDevLobby(server);

    const joined = await joinDevLobby(
      server,
      String(created.lobbyId),
      "guest-a",
    );

    assert.equal(JSON.stringify(joined).includes("guest-a"), false);
  } finally {
    await server.close();
  }
});
```

- [ ] **Step 2: Run server lobby tests and verify RED**

Run:

```bash
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/dev-http-server.test.ts
```

Expected: FAIL because `/api/lobbies/:id/join` does not exist.

- [ ] **Step 3: Change lobby registry to store identity subjects**

In `packages/match-server/src/dev-http-server.ts`, change `LocalDevLobby` seat shape:

```ts
interface LocalDevLobbySeat {
  playerId: PlayerId;
  subject?: AuthContext["subject"] | undefined;
}

interface LocalDevLobby {
  lobbyId: string;
  seats: Record<string, LocalDevLobbySeat>;
  matchId?: MatchId;
}
```

Update `lobbyResponse` so `claimed` is derived from `subject`:

```ts
{ playerId: seat.playerId, claimed: seat.subject !== undefined }
```

Replace the registry `claimSeat` signature with:

```ts
joinLobby: (lobbyId: string, auth: AuthContext | undefined) =>
  Promise<
    | (CreatedDevLobbyResponse & { seat: { playerId: PlayerId } })
    | "lobbyNotFound"
    | "unauthenticated"
    | "full"
  >;
```

Implement join behavior:

```ts
async joinLobby(lobbyId, auth) {
  if (auth === undefined) {
    return "unauthenticated";
  }
  const lobby = lobbies.get(lobbyId);
  if (lobby === undefined) {
    return "lobbyNotFound";
  }
  const existing = Object.values(lobby.seats).find(
    (seat) =>
      seat.subject !== undefined && subjectsMatch(seat.subject, auth.subject),
  );
  if (existing !== undefined) {
    await ensureMatchWhenReady(lobby);
    return { ...lobbyResponse(lobby), seat: { playerId: existing.playerId } };
  }
  const open = Object.values(lobby.seats).find(
    (seat) => seat.subject === undefined,
  );
  if (open === undefined) {
    return "full";
  }
  open.subject = auth.subject;
  await ensureMatchWhenReady(lobby);
  return { ...lobbyResponse(lobby), seat: { playerId: open.playerId } };
}
```

Import `subjectsMatch` from `./dev-auth.js`.

- [ ] **Step 4: Replace lobby HTTP route**

In `handleApiRequest`, remove the `/api/lobbies/:lobbyId/seats/:playerId/claim`
handler and add:

```ts
const lobbyJoinRoute = /^\/api\/lobbies\/(?<lobbyId>[^/]+)\/join$/u.exec(
  pathname,
);
if (request.method === "POST" && lobbyJoinRoute !== null) {
  const lobbyId = decodeURIComponent(lobbyJoinRoute.groups?.["lobbyId"] ?? "");
  const result = await lobbyRegistry.joinLobby(
    lobbyId,
    authProvider.authenticate(request),
  );
  if (result === "lobbyNotFound") {
    sendJson(response, 404, { errors: [`Lobby ${lobbyId} not found.`] });
    return;
  }
  if (result === "unauthenticated") {
    sendJson(response, 401, { errors: ["Guest identity is required."] });
    return;
  }
  if (result === "full") {
    sendJson(response, 409, { errors: ["Lobby is full."] });
    return;
  }
  broadcastLobbyState(result, lobbyConnections);
  sendJson(response, 200, result);
  return;
}
```

- [ ] **Step 5: Run server lobby tests and verify GREEN**

Run:

```bash
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/dev-http-server.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/match-server/src/dev-http-server.ts packages/match-server/src/dev-http-server.test.ts
git commit -m "Add seatless dev lobby join"
```

---

## Task 3: Client Transport And Controller

**Files:**

- Modify: `packages/client/src/transport.ts`
- Modify: `packages/client/src/transport-http.ts`
- Modify: `packages/client/src/transport-http.test.ts`
- Modify: `packages/client/src/controller.ts`
- Modify: `packages/client/src/controller.test.ts`

- [ ] **Step 1: Write failing HTTP transport tests**

In `packages/client/src/transport-http.test.ts`, replace the primitive lobby claim test with:

```ts
test("creates and joins primitive lobbies without caller-selected seats", async () => {
  const recorder = createRecordingFetch((request) =>
    responseJson({
      lobbyId: "lobby-1",
      seat: { playerId: "p1" },
      seats: {
        p1: { playerId: "p1", claimed: true },
        p2: { playerId: "p2", claimed: false },
      },
      ...(request.url.endsWith("/join") ? { matchId: "match-1" } : {}),
    }),
  );
  const transport = createDevHttpMatchTransport({
    baseUrl: "http://localhost:3000/",
    fetch: recorder.fetch,
  });

  await transport.createLobby();
  const joined = await transport.joinLobby({
    lobbyId: "lobby-1",
    guestToken: "guest-a",
  });
  await transport.loadLobby("lobby-1");

  assert.equal(joined.matchId, "match-1");
  assert.deepEqual(joined.seat, { playerId: "p1" });
  assert.deepEqual(
    recorder.requests.map((request) => request.url),
    [
      "http://localhost:3000/api/lobbies",
      "http://localhost:3000/api/lobbies/lobby-1/join",
      "http://localhost:3000/api/lobbies/lobby-1",
    ],
  );
  assert.equal(
    new Headers(recorder.requests[1]?.init?.headers).get(
      "x-optcg-session-token",
    ),
    "guest-a",
  );
});
```

- [ ] **Step 2: Run transport tests and verify RED**

Run:

```bash
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/transport-http.test.ts
```

Expected: FAIL because `joinLobby` does not exist.

- [ ] **Step 3: Update transport contract**

In `packages/client/src/transport.ts`, replace `claimLobbySeat` with:

```ts
export interface JoinedLobby extends LocalLobby {
  seat: { playerId: PlayerId };
}
```

Then in `MatchTransport`:

```ts
joinLobby: (input: { lobbyId: string; guestToken: string }) =>
  Promise<JoinedLobby>;
```

Remove the `claimLobbySeat` method from `MatchTransport`.

- [ ] **Step 4: Update HTTP transport**

In `packages/client/src/transport-http.ts`, import `JoinedLobby` and replace
`claimLobbySeat` with:

```ts
async joinLobby(input) {
  return postJson<JoinedLobby>(
    lobbyPath(input.lobbyId, "/join"),
    {},
    input.guestToken,
  );
},
```

- [ ] **Step 5: Update controller to use guest identity**

In `packages/client/src/controller.ts`:

Change `LobbyClientState.seat` to keep the assigned player only:

```ts
seat: {
  lobbyId: string;
  playerId: PlayerId;
}
```

Change the controller interface:

```ts
startNewLocalLobby: () => Promise<MatchClientSessionState>;
joinLocalLobby: (input: { lobbyId: string }) =>
  Promise<MatchClientSessionState>;
```

Add helper inside `createMatchClientController`:

```ts
const guestIdentity = (): string =>
  sessionStore.loadOrCreateGuestIdentity().guestToken;
```

Update `startNewLocalLobby`:

```ts
async startNewLocalLobby() {
  const lobby = await transport.createLobby();
  const joinedLobby = await transport.joinLobby({
    lobbyId: lobby.lobbyId,
    guestToken: guestIdentity(),
  });
  return claimMatchIfReady({
    lobbyId: joinedLobby.lobbyId,
    seat: { lobbyId: joinedLobby.lobbyId, playerId: joinedLobby.seat.playerId },
    lobby: joinedLobby,
  });
},
```

Update `joinLocalLobby`:

```ts
async joinLocalLobby(input) {
  const joinedLobby = await transport.joinLobby({
    lobbyId: input.lobbyId,
    guestToken: guestIdentity(),
  });
  return claimMatchIfReady({
    lobbyId: joinedLobby.lobbyId,
    seat: { lobbyId: joinedLobby.lobbyId, playerId: joinedLobby.seat.playerId },
    lobby: joinedLobby,
  });
},
```

Update `claimAndLoad` so lobby-created match seat claims reuse guest token when
no match credential exists:

```ts
const existingSessionToken =
  sessionToken ??
  sessionStore.loadClaimedSeat()?.sessionToken ??
  sessionStore.loadGuestIdentity()?.guestToken;
```

- [ ] **Step 6: Update controller tests**

In `packages/client/src/controller.test.ts`, update fake transport to implement
`joinLobby(input)` and record inputs in `joinedLobbies`.

Add tests:

```ts
test("starts a local lobby by joining with guest identity and assigned seat", async () => {
  const transport = createFakeTransport();
  const sessionStore = createClientSessionStore({
    storage: createMemoryClientStorage(),
  });
  const controller = createMatchClientController({
    transport,
    sessionStore,
  });

  const state = await controller.startNewLocalLobby();

  assert.equal("lobbyId" in state, true);
  assert.equal(transport.joinedLobbies[0]?.lobbyId, "lobby-1");
  assert.match(transport.joinedLobbies[0]?.guestToken ?? "", /^guest:/u);
});

test("joins a local lobby without caller-selected player id", async () => {
  const transport = createFakeTransport();
  const sessionStore = createClientSessionStore({
    storage: createMemoryClientStorage(),
  });
  const controller = createMatchClientController({
    transport,
    sessionStore,
  });

  await controller.joinLocalLobby({ lobbyId: "lobby-1" });

  assert.deepEqual(Object.keys(transport.joinedLobbies[0] ?? {}), [
    "lobbyId",
    "guestToken",
  ]);
});
```

- [ ] **Step 7: Run client controller/transport tests and verify GREEN**

Run:

```bash
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/transport-http.test.ts packages/client/src/controller.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/transport.ts packages/client/src/transport-http.ts packages/client/src/transport-http.test.ts packages/client/src/controller.ts packages/client/src/controller.test.ts
git commit -m "Join custom lobbies by guest identity"
```

---

## Task 4: Route And React Lobby Flow

**Files:**

- Modify: `packages/client/src/react/app-route.ts`
- Modify: `packages/client/src/react/app-route.test.ts`
- Modify: `packages/client/src/react/useMatchClient-support.ts`
- Modify: `packages/client/src/react/useMatchClient.ts`
- Modify: `packages/client/src/react/use-match-session-actions.ts`
- Modify: `packages/client/src/react/LobbiesPage.tsx`
- Modify: `packages/client/src/react/app-shell-pages.test.ts`

- [ ] **Step 1: Write route tests for `/lobbies/<lobbyId>`**

In `packages/client/src/react/app-route.test.ts`, add:

```ts
test("maps concrete lobby URLs to the lobbies route", () => {
  const route = appRouteFromPath("/lobbies/dev-local-lobby-1");

  assert.equal(route.id, "lobbies");
  assert.equal(route.path, "/lobbies/dev-local-lobby-1");
});
```

- [ ] **Step 2: Update route parsing**

In `packages/client/src/react/app-route.ts`, before `routeByPath.get`:

```ts
if (parsed.pathname.startsWith("/lobbies/")) {
  return { id: "lobbies", path: parsed.pathname, search: parsed.search };
}
```

- [ ] **Step 3: Update URL helpers to remove lobby seat authority**

In `packages/client/src/react/useMatchClient-support.ts`:

Remove `seatIdFromUrl` usage for lobby joining. Keep it only for direct match
join compatibility if current direct match URLs still need it.

Add:

```ts
export const lobbyIdFromPathOrUrl = (): string | undefined => {
  const url = new URL(window.location.href);
  const pathMatch = /^\/lobbies\/(?<lobbyId>[^/]+)$/u.exec(url.pathname);
  if (pathMatch !== null) {
    return decodeURIComponent(pathMatch.groups?.["lobbyId"] ?? "");
  }
  const value = url.searchParams.get("lobbyId");
  return value === null ? undefined : value;
};
```

Update `setLobbyLocation`:

```ts
export const setLobbyLocation = (lobbyId: string): void => {
  const url = new URL(window.location.href);
  url.pathname = `/lobbies/${encodeURIComponent(lobbyId)}`;
  url.search = "";
  window.history.replaceState({}, "", url);
};
```

- [ ] **Step 4: Update match client initialization**

In `packages/client/src/react/useMatchClient.ts`:

Replace:

```ts
const urlLobbyId = lobbyIdFromUrl();
const seatId = seatIdFromUrl();
...
: urlLobbyId !== undefined
  ? await controller.joinLocalLobby({ lobbyId: urlLobbyId, playerId: seatId })
```

with:

```ts
const urlLobbyId = lobbyIdFromPathOrUrl();
const seatId = seatIdFromUrl();
...
: urlLobbyId !== undefined
  ? await controller.joinLocalLobby({ lobbyId: urlLobbyId })
```

Keep `seatId` only for direct match join:

```ts
urlMatchId !== undefined
  ? await controller.joinLocalMatch({ matchId: urlMatchId, playerId: seatId })
```

- [ ] **Step 5: Update session actions**

In `packages/client/src/react/use-match-session-actions.ts`, update `createNewMatch`:

```ts
const created = await controller.startNewLocalLobby();
```

Update lobby location call:

```ts
setLobbyLocation(created.lobbyId);
```

Remove the `playerId` argument from all `setLobbyLocation` calls.

- [ ] **Step 6: Update lobby page copy**

In `packages/client/src/react/LobbiesPage.tsx`, make the page clearly seatless:

```tsx
<ShellPageCard
  title="Create Custom Lobby"
  description="Create a shareable lobby link. The server assigns seats when guests join."
  href={appRoutePath("match")}
  label="Create"
/>
```

Use no text suggesting `p1`, `p2`, or seat-specific links.

- [ ] **Step 7: Run route and shell tests**

Run:

```bash
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/react/app-route.test.ts packages/client/src/react/app-shell-pages.test.ts packages/client/src/react/useMatchClient-support.test.ts
```

Expected: PASS after updating any tests that import renamed helpers.

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/react/app-route.ts packages/client/src/react/app-route.test.ts packages/client/src/react/useMatchClient-support.ts packages/client/src/react/useMatchClient.ts packages/client/src/react/use-match-session-actions.ts packages/client/src/react/LobbiesPage.tsx packages/client/src/react/app-shell-pages.test.ts
git commit -m "Route custom lobbies by lobby identity"
```

---

## Task 5: Anti-Regression Source Scans

**Files:**

- Add: `packages/client/src/react/seatless-lobby-boundary.test.ts`
- Modify: `packages/match-server/src/dev-http-server.test.ts` if route scan belongs there instead.

- [ ] **Step 1: Add client source scan**

Create `packages/client/src/react/seatless-lobby-boundary.test.ts`:

```ts
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

const reactSourceDirectory = dirname(fileURLToPath(import.meta.url));
const clientSourceDirectory = join(reactSourceDirectory, "..");

describe("seatless custom lobby boundaries", () => {
  test("react lobby helpers do not use URL seat parameters for lobby joins", async () => {
    const files = [
      "useMatchClient-support.ts",
      "useMatchClient.ts",
      "use-match-session-actions.ts",
    ] as const;
    for (const file of files) {
      const source = await readFile(join(reactSourceDirectory, file), "utf8");

      assert.doesNotMatch(source, /setLobbyLocation\([^)]*playerId/u, file);
      assert.doesNotMatch(source, /joinLocalLobby\(\{[^}]*playerId/u, file);
      assert.doesNotMatch(source, /lobbyId[^;]+seatIdFromUrl/u, file);
    }
  });

  test("client transport does not expose lobby seat claim API", async () => {
    const transport = await readFile(
      join(clientSourceDirectory, "transport.ts"),
      "utf8",
    );
    const http = await readFile(
      join(clientSourceDirectory, "transport-http.ts"),
      "utf8",
    );

    assert.doesNotMatch(transport, /claimLobbySeat/u);
    assert.doesNotMatch(http, /\/api\/lobbies\/.*\/seats\//u);
  });
});
```

- [ ] **Step 2: Add server source scan**

Append to `packages/match-server/src/dev-http-server.test.ts`:

```ts
test("does not expose lobby URL-selected seat claim route", async () => {
  const source = await readFile(
    join(dirname(fileURLToPath(import.meta.url)), "dev-http-server.ts"),
    "utf8",
  );

  assert.doesNotMatch(source, /\/api\/lobbies\/.*\/seats/u);
  assert.doesNotMatch(source, /claimSeat\(lobbyId,\s*playerId/u);
});
```

If the test file does not already import `readFile`, `dirname`, `join`, and
`fileURLToPath`, add those imports.

- [ ] **Step 3: Run boundary tests**

Run:

```bash
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/react/seatless-lobby-boundary.test.ts
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/dev-http-server.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/react/seatless-lobby-boundary.test.ts packages/match-server/src/dev-http-server.test.ts
git commit -m "Prevent direct-seat lobby regressions"
```

---

## Task 6: Verification

**Files:**

- Modify only files needed for formatting, lint, or type fixes.

- [ ] **Step 1: Run focused tests**

Run:

```bash
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/session.test.ts packages/client/src/transport-http.test.ts packages/client/src/controller.test.ts packages/client/src/react/app-route.test.ts packages/client/src/react/app-shell-pages.test.ts packages/client/src/react/seatless-lobby-boundary.test.ts
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/dev-http-server.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run formatting check**

Run:

```bash
corepack pnpm run format:check
```

Expected: PASS. If it fails, run `corepack pnpm exec prettier --write .`, then
rerun the check.

- [ ] **Step 3: Run lint**

Run:

```bash
corepack pnpm lint
```

Expected: PASS.

- [ ] **Step 4: Run typecheck**

Run:

```bash
corepack pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Run client and match-server tests**

Run:

```bash
corepack pnpm --filter @optcg/client test
corepack pnpm --filter @optcg/match-server test
```

Expected: PASS.

- [ ] **Step 6: Run full repo verification**

Run:

```bash
corepack pnpm verify
```

Expected: PASS.

- [ ] **Step 7: Commit verification fixes if needed**

If verification required changes:

```bash
git add packages/client packages/match-server
git commit -m "Verify seatless custom lobbies"
```

If no files changed, skip this commit.

---

## Self-Review Notes

- Spec coverage: seatless URL, guest identity, server-owned seat assignment,
  same-guest rejoin, full lobby failure, match seat token preservation, and
  anti-regression checks are each covered.
- Scope check: no account system, deck selection, engine, parser, gameplay,
  hidden-information, or spectator work is included.
- Type consistency: `guestToken` is the client identity value; `sessionToken`
  remains the match seat credential value.
- Old direct-seat lobby support is removed, not retained as compatibility.
