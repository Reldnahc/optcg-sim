# Replay Selector Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/replays` in-app selector page that lists available replay summaries and links to the existing replay viewer.

**Architecture:** Extend the existing replay client with a list method, add a shell route for `/replays`, and create a focused React selector page with loading, error, empty, and ready states. Keep replay detail playback unchanged.

**Tech Stack:** TypeScript, React, existing app routing, existing replay HTTP API, Vitest, Prettier, ESLint.

---

### Task 1: Replay Client List API

**Files:**

- Modify: `packages/client/src/replay-client.ts`
- Test: `packages/client/src/replay-client.test.ts`

- [ ] Write a failing test named `lists replay summaries` in `packages/client/src/replay-client.test.ts`.

```ts
test("lists replay summaries", async () => {
  const requests: string[] = [];
  const client = createReplayClient({
    baseUrl: "https://sim.example/",
    fetch: (input) => {
      requests.push(
        input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.toString()
            : input,
      );
      return Promise.resolve(
        new Response(
          JSON.stringify({
            replays: [
              {
                matchId: "match-1",
                status: "completed",
                gameType: "dev",
                formatId: "dev",
                lobbyId: "lobby-1",
                winnerUserId: null,
                winnerSeatId: "p1",
                startedAt: "2026-06-13T00:00:00.000Z",
                endedAt: "2026-06-13T00:10:00.000Z",
                turnCount: 4,
                actionCount: 2,
                players: [],
              },
            ],
          }),
        ),
      );
    },
  });

  const replays = await client.listReplays();

  assert.deepEqual(requests, ["https://sim.example/api/replays"]);
  assert.equal(replays.length, 1);
  assert.equal(replays[0]?.matchId, "match-1");
});
```

- [ ] Run `npm.cmd run test -- packages/client/src/replay-client.test.ts`.

Expected: fail because `listReplays` does not exist.

- [ ] Add `ReplaySummary` and `listReplays()` to `packages/client/src/replay-client.ts`.

```ts
export type ReplaySummary = Omit<ReplayDetail, "replay">;

export interface ReplayClient {
  readonly getReplay: (matchId: MatchId | string) => Promise<ReplayDetail>;
  readonly listReplays: () => Promise<readonly ReplaySummary[]>;
}
```

Inside `createReplayClient`, add:

```ts
async listReplays() {
  const response = await fetchImpl(`${root}/api/replays`);
  const body = await readJson<{ replays: readonly ReplaySummary[] }>(response);
  return body.replays;
},
```

- [ ] Run `npm.cmd run test -- packages/client/src/replay-client.test.ts`.

Expected: pass.

### Task 2: Replay Selector Route And Page

**Files:**

- Modify: `packages/client/src/react/app-route.ts`
- Modify: `packages/client/src/react/app-route.test.ts`
- Modify: `packages/client/src/react/AppRoot.tsx`
- Modify: `packages/client/src/react/app-root.test.ts`
- Create: `packages/client/src/react/ReplaySelectorPage.tsx`
- Create: `packages/client/src/react/ReplaySelectorPage.test.ts`
- Modify: `packages/client/src/react/styles/app-shell-pages.css`

- [ ] Write failing route tests proving `/replays` maps to `replayList`, `/replays/match-1` still maps to `replay`, and `isShellRoute("replayList")` is true.

- [ ] Write failing page render tests in `ReplaySelectorPage.test.ts` for loading, error, empty, and ready states.

Ready-state assertions should include:

```ts
assert.match(html, /Replay Library/u);
assert.match(html, /match-1/u);
assert.match(html, /Winner/u);
assert.match(html, /Loser/u);
assert.match(html, /href="\/replays\/match-1"/u);
```

- [ ] Run:

```powershell
npm.cmd run test -- packages/client/src/react/app-route.test.ts packages/client/src/react/app-root.test.ts packages/client/src/react/ReplaySelectorPage.test.ts
```

Expected: fail because the route and component do not exist yet.

- [ ] Add `replayList` to `AppRouteId`, `appRoutes`, and `appRoutePath` support in `app-route.ts`.

Use:

```ts
| "replayList"
```

and:

```ts
{ id: "replayList", path: "/replays", label: "Replays" }
```

Keep `/replays/:matchId` detection before the fallback return.

- [ ] Add `ReplaySelectorPageView` and `ReplaySelectorPage`.

The view props should be:

```ts
type ReplaySelectorStatus = "loading" | "ready" | "error";

export interface ReplaySelectorPageViewProps {
  readonly status: ReplaySelectorStatus;
  readonly replays: readonly ReplaySummary[];
  readonly error?: string | undefined;
}
```

The stateful page should call `createReplayClient({ baseUrl: window.location.origin })`, then `client.listReplays()`, and should cancel stale async work the same way `ReplayViewerPage` does.

- [ ] Wire `AppRootContent` so `route.id === "replayList"` renders `<ReplaySelectorPage />` inside `AppShell`.

- [ ] Add focused CSS for `.replay-selector-page`, `.replay-selector-list`, `.replay-selector-card`, `.replay-selector-meta`, and `.replay-selector-players` in `app-shell-pages.css`.

- [ ] Run the route and selector tests again.

Expected: pass.

### Task 3: Verification And Commit

**Files:**

- All touched files

- [ ] Run focused replay tests:

```powershell
npm.cmd run test -- packages/client/src/replay-client.test.ts packages/client/src/react/app-route.test.ts packages/client/src/react/app-root.test.ts packages/client/src/react/ReplaySelectorPage.test.ts packages/client/src/react/ReplayViewerPage.test.ts packages/client/src/react/replay-match-client.test.ts
```

- [ ] Run `npm.cmd run typecheck`.

- [ ] Run `npm.cmd run lint`.

- [ ] Run `npm.cmd run format:check`.

- [ ] Commit:

```powershell
git add packages/client/src/replay-client.ts packages/client/src/replay-client.test.ts packages/client/src/react/app-route.ts packages/client/src/react/app-route.test.ts packages/client/src/react/AppRoot.tsx packages/client/src/react/app-root.test.ts packages/client/src/react/ReplaySelectorPage.tsx packages/client/src/react/ReplaySelectorPage.test.ts packages/client/src/react/styles/app-shell-pages.css
git commit -m "feat: add replay selector page"
```
