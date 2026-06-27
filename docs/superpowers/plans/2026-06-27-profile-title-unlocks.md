# Profile Title Unlocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build account-wide unlockable profile titles with deploy-controlled title definitions, admin manual grants, user-selected active titles, and profile/avatar identity display.

**Architecture:** Title definitions and unlock state live in auth-owned database tables. `optcg-auth` owns user profile serialization and active-title selection; `optcg-api-admin` owns protected manual grant/revoke endpoints; `optcg-admin`, `optcg-web`, and `optcg-sim-dev` consume those APIs and render a bounded title style object. Title styling is structured metadata, never raw user CSS.

**Tech Stack:** PostgreSQL migrations in `optcg-db`; Fastify + TypeScript in `optcg-auth` and `optcg-api-admin`; typed browser client in `optcg-auth-client`; React 19 in `optcg-web`, `optcg-admin`, and `optcg-sim-dev`; existing test runners per repo.

---

## Scope Check

This spans five repos, but the parts are coupled by one identity feature:

1. Database schema and catalog rows.
2. User-facing profile/session APIs.
3. Admin manual unlock API and console.
4. Web profile picker and shared title renderer.
5. Sim identity propagation and player-summary display.

Implement as separate commits per repo or subsystem. Do not touch `optcg-api`; its `AGENTS.md` says it does not host admin routes.

Admin JWTs currently expose `req.admin.email`, not an auth `user_id`. Store grant audit as `granted_by_admin_email TEXT NOT NULL`.

## File Map

`optcg-db`

- Create `src/db/migrations/050_profile_title_unlocks.sql`: title catalog, unlock table, selected profile column, seed rows.
- Modify `src/db/schema.ts`: add title row interfaces and profile selected title field.

`optcg-auth`

- Modify `src/auth/serializeUser.ts`: serialize selected title and optionally unlocked title list.
- Modify `src/repos/profiles.ts`: add title lookup/list/update helpers.
- Modify `src/routes/me.ts`: add `PUT /v1/me/profile/title`, include unlocked titles for `/v1/me`.
- Modify `src/schemas/auth.ts`: add title schemas and update route schema.
- Modify `test/auth-routes.test.mjs`: profile title route and serialization coverage.
- Modify `test/docs.test.mjs`: docs include the profile title route.

`optcg-auth-client`

- Modify `src/index.ts`: add `ProfileTitle`, `ProfileTitleStyle`, `updateProfileTitle`.
- Modify `test/client.test.mjs`: request/response coverage.

`optcg-api-admin`

- Create `src/admin/profileTitles.ts`: protected catalog/list/grant/revoke endpoints.
- Modify `src/server.ts`: register `adminProfileTitleRoutes`.
- Modify `src/schemas/admin.ts`: response/request schemas.
- Create `src/admin/profileTitles.test.ts`: admin API coverage.

`optcg-admin`

- Modify `src/App.tsx`: add `/unlocks`.
- Modify `src/components/layout/Sidebar.tsx`: add Unlocks nav item.
- Modify `src/components/layout/AdminLayout.tsx`: add page title.
- Modify `src/api/types.ts`: admin title/user unlock types.
- Modify `src/api/hooks.ts`: title catalog, exact user lookup, grant, revoke hooks.
- Create `src/pages/UnlockManager.tsx`: exact lookup + manual grants/revokes.

`optcg-web`

- Modify `src/api/client.ts`: title types and `updateProfileTitle`.
- Modify `src/pages/AccountPage.tsx`: selected title picker and preview beside avatar.
- Create `src/account/profileTitleStyle.ts`: bounded style-to-CSS helper.
- Add or update tests for title picker/rendering.

`optcg-sim-dev`

- Modify `packages/client/src/transport.ts`: add `PlayerTitleView`.
- Modify `packages/client/src/react/use-sim-auth.ts`: include selected title in `user-json` token.
- Modify `packages/match-server/src/dev-auth.ts`: parse/store title.
- Modify `packages/match-server/src/dev-snapshot-types.ts`: title on player labels.
- Modify `packages/match-server/src/dev-local-match-registry.ts`: preserve title through labels.
- Modify `packages/client/src/view-model.ts`: expose `selfTitle` and `opponentTitle`.
- Modify `packages/client/src/react/PlayerSummaryLabel.tsx`: render title below/near name.
- Update focused tests already created for avatar identity propagation.

---

### Task 1: Database Schema And Seed Catalog

**Files:**

- Create: `optcg-db/src/db/migrations/050_profile_title_unlocks.sql`
- Modify: `optcg-db/src/db/schema.ts`

- [ ] **Step 1: Write migration file**

Create `src/db/migrations/050_profile_title_unlocks.sql`:

```sql
CREATE TABLE IF NOT EXISTS auth.profile_titles (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  unlock_mode TEXT NOT NULL,
  style JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profile_titles_key_format_check
    CHECK (key ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  CONSTRAINT profile_titles_unlock_mode_check
    CHECK (unlock_mode IN ('no_requirement', 'manual')),
  CONSTRAINT profile_titles_label_length_check
    CHECK (char_length(label) BETWEEN 1 AND 64),
  CONSTRAINT profile_titles_style_object_check
    CHECK (jsonb_typeof(style) = 'object')
);

CREATE INDEX IF NOT EXISTS profile_titles_active_sort_idx
  ON auth.profile_titles(active, sort_order, key);

ALTER TABLE auth.user_profiles
  ADD COLUMN IF NOT EXISTS selected_title_key TEXT
    REFERENCES auth.profile_titles(key) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS user_profiles_selected_title_idx
  ON auth.user_profiles(selected_title_key)
  WHERE selected_title_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth.user_title_unlocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title_key TEXT NOT NULL REFERENCES auth.profile_titles(key) ON DELETE RESTRICT,
  granted_by_admin_email TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_title_unlocks_note_length_check
    CHECK (note IS NULL OR char_length(note) <= 500)
);

CREATE UNIQUE INDEX IF NOT EXISTS user_title_unlocks_active_unique_idx
  ON auth.user_title_unlocks(user_id, title_key)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS user_title_unlocks_user_active_idx
  ON auth.user_title_unlocks(user_id, title_key)
  WHERE revoked_at IS NULL;

INSERT INTO auth.profile_titles (key, label, unlock_mode, style, active, sort_order)
VALUES
  (
    'pirate_rookie',
    'Pirate Rookie',
    'no_requirement',
    '{"text_color":"#e8e9ed","font_family":"display","font_weight":700,"animation":"none"}',
    true,
    10
  ),
  (
    'founder_gold',
    'Founder',
    'manual',
    '{"text_color":"#ffd76a","font_family":"display","font_weight":800,"gradient":{"from":"#fff1a8","to":"#d4a94c","angle":90},"glow_color":"#d4a94c","animation":"shine"}',
    true,
    20
  )
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  unlock_mode = EXCLUDED.unlock_mode,
  style = EXCLUDED.style,
  active = EXCLUDED.active,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
```

- [ ] **Step 2: Update schema types**

In `src/db/schema.ts`, add near auth profile types:

```ts
export type AuthProfileTitleUnlockMode = "no_requirement" | "manual";

export interface AuthProfileTitle {
  key: string;
  label: string;
  unlock_mode: AuthProfileTitleUnlockMode;
  style: Record<string, unknown>;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AuthUserTitleUnlock {
  id: string;
  user_id: string;
  title_key: string;
  granted_by_admin_email: string;
  granted_at: string;
  revoked_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}
```

Update `AuthUserProfile`:

```ts
export interface AuthUserProfile {
  user_id: string;
  avatar_card_image_id: string | null;
  avatar_image_source: AuthAvatarImageSource | null;
  avatar_crop_x: string | null;
  avatar_crop_y: string | null;
  avatar_crop_size: string | null;
  selected_title_key: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 3: Verify DB package**

Run:

```powershell
npm run typecheck
npm run build
```

Expected: both commands exit 0.

- [ ] **Step 4: Commit DB changes**

```powershell
git add src/db/migrations/050_profile_title_unlocks.sql src/db/schema.ts
git commit -m "Add profile title unlock schema"
```

---

### Task 2: Auth Profile Title Serialization

**Files:**

- Modify: `optcg-auth/src/auth/serializeUser.ts`
- Modify: `optcg-auth/src/repos/profiles.ts`
- Modify: `optcg-auth/src/schemas/auth.ts`
- Modify: `optcg-auth/test/auth-routes.test.mjs`

- [ ] **Step 1: Write failing serializer tests**

In `test/auth-routes.test.mjs`, add assertions to the existing session/profile tests that expect:

```js
assert.deepEqual(sessionResponse.json().data.user.profile.title, null);
```

Add a new test named `profile serialization includes selected title and unlocked titles` using the fake DB profile rows:

```js
await runTest("profile serialization includes selected title and unlocked titles", async () => {
  const db = new AuthRoutesDb();
  db.users.set("user-auth", {
    id: "user-auth",
    username: "tester",
    display_name: "Tester",
    email: "tester@example.com",
    email_verified_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    selected_title_key: "founder_gold",
    selected_title_label: "Founder",
    selected_title_style: {
      text_color: "#ffd76a",
      font_family: "display",
      font_weight: 800,
      animation: "shine",
    },
  });
  db.profileTitles = [
    {
      key: "pirate_rookie",
      label: "Pirate Rookie",
      unlock_mode: "no_requirement",
      style: { text_color: "#e8e9ed", animation: "none" },
      active: true,
      sort_order: 10,
    },
    {
      key: "founder_gold",
      label: "Founder",
      unlock_mode: "manual",
      style: { text_color: "#ffd76a", animation: "shine" },
      active: true,
      sort_order: 20,
    },
  ];

  const app = buildAuthRoutesTestApp(db);
  const response = await app.inject({
    method: "GET",
    url: "/v1/me",
    headers: { authorization: "Bearer token-user-auth" },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().data.profile.title, {
    key: "founder_gold",
    label: "Founder",
    style: {
      text_color: "#ffd76a",
      font_family: "display",
      font_weight: 800,
      animation: "shine",
    },
  });
  assert.deepEqual(
    response.json().data.profile.unlocked_titles.map((title) => title.key),
    ["pirate_rookie", "founder_gold"],
  );
});
```

Update the `AuthRoutesDb` fake query dispatcher in this test file so title catalog queries return `db.profileTitles` and user rows can expose `selected_title_key`, `selected_title_label`, and `selected_title_style`. Do not change the expected HTTP response shape shown in this step.

- [ ] **Step 2: Run failing auth test**

Run:

```powershell
npm run build
node test/auth-routes.test.mjs
```

Expected: FAIL because `profile.title` and `profile.unlocked_titles` are not serialized yet.

- [ ] **Step 3: Add profile title types and serializer**

In `src/auth/serializeUser.ts`, extend `AuthUserWithProfile`:

```ts
export type ProfileTitleStyle = {
  text_color: string;
  font_family?: "display" | "body" | "mono";
  font_weight?: number;
  gradient?: {
    from: string;
    via?: string;
    to: string;
    angle?: number;
  } | null;
  outline_color?: string | null;
  glow_color?: string | null;
  animation?: "none" | "shine" | "pulse";
};

export type SerializedProfileTitle = {
  key: string;
  label: string;
  style: ProfileTitleStyle;
};

export type AuthUserWithProfile = AuthUser & {
  avatar_card_image_id?: string | null;
  avatar_image_source?: AvatarImageSource | null;
  avatar_crop_x?: number | string | null;
  avatar_crop_y?: number | string | null;
  avatar_crop_size?: number | string | null;
  avatar_render_url?: string | null;
  avatar_scan_url?: string | null;
  selected_title_key?: string | null;
  selected_title_label?: string | null;
  selected_title_style?: unknown;
  unlocked_titles?: SerializedProfileTitle[];
};
```

Add style parsing helpers:

```ts
const TITLE_FONT_FAMILIES = new Set(["display", "body", "mono"]);
const TITLE_ANIMATIONS = new Set(["none", "shine", "pulse"]);

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function serializeTitleStyle(value: unknown): ProfileTitleStyle {
  if (!isRecord(value)) return { text_color: "#e8e9ed", animation: "none" };
  const textColor = readString(value, "text_color") ?? "#e8e9ed";
  const fontFamily = readString(value, "font_family");
  const animation = readString(value, "animation");
  const gradient = isRecord(value.gradient)
    ? {
        from: readString(value.gradient, "from") ?? textColor,
        ...(readString(value.gradient, "via") === undefined ? {} : { via: readString(value.gradient, "via") }),
        to: readString(value.gradient, "to") ?? textColor,
        ...(readNumber(value.gradient, "angle") === undefined ? {} : { angle: readNumber(value.gradient, "angle") }),
      }
    : null;
  return {
    text_color: textColor,
    ...(fontFamily !== undefined && TITLE_FONT_FAMILIES.has(fontFamily) ? { font_family: fontFamily as ProfileTitleStyle["font_family"] } : {}),
    ...(readNumber(value, "font_weight") === undefined ? {} : { font_weight: readNumber(value, "font_weight") }),
    ...(gradient === null ? {} : { gradient }),
    ...(readString(value, "outline_color") === undefined ? {} : { outline_color: readString(value, "outline_color") }),
    ...(readString(value, "glow_color") === undefined ? {} : { glow_color: readString(value, "glow_color") }),
    animation: animation !== undefined && TITLE_ANIMATIONS.has(animation) ? animation as ProfileTitleStyle["animation"] : "none",
  };
}
```

Build selected title inside `serializeUser`:

```ts
const title = user.selected_title_key && user.selected_title_label
  ? {
      key: user.selected_title_key,
      label: user.selected_title_label,
      style: serializeTitleStyle(user.selected_title_style),
    }
  : null;
```

Return:

```ts
profile: {
  avatar,
  title,
  ...(user.unlocked_titles === undefined ? {} : { unlocked_titles: user.unlocked_titles }),
},
```

- [ ] **Step 4: Add repository helpers**

In `src/repos/profiles.ts`, add:

```ts
export type SerializedTitleRow = {
  key: string;
  label: string;
  style: unknown;
};

export async function listUnlockedProfileTitles(runQuery: QueryExecutor, userId: string): Promise<SerializedTitleRow[]> {
  const result = await runQuery<SerializedTitleRow>(
    `
      SELECT pt.key, pt.label, pt.style
      FROM auth.profile_titles pt
      WHERE pt.active IS TRUE
        AND (
          pt.unlock_mode = 'no_requirement'
          OR EXISTS (
            SELECT 1
            FROM auth.user_title_unlocks utu
            WHERE utu.user_id = $1
              AND utu.title_key = pt.key
              AND utu.revoked_at IS NULL
          )
        )
      ORDER BY pt.sort_order ASC, pt.key ASC
    `,
    [userId],
  );
  return result.rows;
}

export async function updateProfileTitle(
  runQuery: QueryExecutor,
  userId: string,
  titleKey: string | null,
): Promise<{ selected_title_key: string | null }> {
  if (titleKey !== null) {
    const allowed = await runQuery<{ key: string }>(
      `
        SELECT pt.key
        FROM auth.profile_titles pt
        WHERE pt.key = $2
          AND pt.active IS TRUE
          AND (
            pt.unlock_mode = 'no_requirement'
            OR EXISTS (
              SELECT 1
              FROM auth.user_title_unlocks utu
              WHERE utu.user_id = $1
                AND utu.title_key = pt.key
                AND utu.revoked_at IS NULL
            )
          )
        LIMIT 1
      `,
      [userId, titleKey],
    );
    if (!allowed.rows[0]) {
      throw badRequest("Selected title is not unlocked.");
    }
  }

  const result = await runQuery<{ selected_title_key: string | null }>(
    `
      INSERT INTO auth.user_profiles (user_id, selected_title_key)
      VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE SET
        selected_title_key = EXCLUDED.selected_title_key,
        updated_at = now()
      RETURNING selected_title_key
    `,
    [userId, titleKey],
  );
  return result.rows[0] ?? { selected_title_key: titleKey };
}
```

- [ ] **Step 5: Update auth schemas**

In `src/schemas/auth.ts`, add `profileTitleSchema`, require `title` in `profile`, and allow `unlocked_titles`:

```ts
const profileTitleStyleSchema = {
  type: "object",
  additionalProperties: true,
  required: ["text_color"],
  properties: {
    text_color: { type: "string" },
    font_family: { type: "string", enum: ["display", "body", "mono"] },
    font_weight: { type: "number" },
    gradient: {
      anyOf: [
        {
          type: "object",
          required: ["from", "to"],
          additionalProperties: false,
          properties: {
            from: { type: "string" },
            via: { type: "string" },
            to: { type: "string" },
            angle: { type: "number" },
          },
        },
        { type: "null" },
      ],
    },
    outline_color: { anyOf: [{ type: "string" }, { type: "null" }] },
    glow_color: { anyOf: [{ type: "string" }, { type: "null" }] },
    animation: { type: "string", enum: ["none", "shine", "pulse"] },
  },
} as const;

const profileTitleSchema = {
  type: "object",
  required: ["key", "label", "style"],
  additionalProperties: false,
  properties: {
    key: { type: "string" },
    label: { type: "string" },
    style: profileTitleStyleSchema,
  },
} as const;
```

Add route schema:

```ts
export const updateProfileTitleRouteSchema = {
  body: {
    type: "object",
    required: ["title_key"],
    additionalProperties: false,
    properties: {
      title_key: { anyOf: [{ type: "string" }, { type: "null" }] },
    },
  },
  response: {
    200: dataResponseSchema({
      type: "object",
      required: ["user"],
      additionalProperties: false,
      properties: { user: userSchema },
    }),
    400: errorResponseSchema,
    401: errorResponseSchema,
  },
} as const;
```

- [ ] **Step 6: Run auth tests**

Run:

```powershell
npm test
```

Expected: all auth tests pass.

- [ ] **Step 7: Commit auth serialization**

```powershell
git add src/auth/serializeUser.ts src/repos/profiles.ts src/schemas/auth.ts test/auth-routes.test.mjs test/docs.test.mjs
git commit -m "Add profile title serialization"
```

---

### Task 3: Auth Profile Title Update Route

**Files:**

- Modify: `optcg-auth/src/routes/me.ts`
- Modify: `optcg-auth/test/auth-routes.test.mjs`

- [ ] **Step 1: Add failing route tests**

Add tests:

```js
await runTest("profile title update selects unlocked title", async () => {
  const db = new AuthRoutesDb();
  db.profileTitles = [{ key: "pirate_rookie", label: "Pirate Rookie", unlock_mode: "no_requirement", style: { text_color: "#e8e9ed" }, active: true, sort_order: 10 }];
  const app = buildAuthRoutesTestApp(db);
  const response = await app.inject({
    method: "PUT",
    url: "/v1/me/profile/title",
    headers: { authorization: "Bearer token-user-auth" },
    payload: { title_key: "pirate_rookie" },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.user.profile.title.key, "pirate_rookie");
});

await runTest("profile title update rejects locked manual title", async () => {
  const db = new AuthRoutesDb();
  db.profileTitles = [{ key: "founder_gold", label: "Founder", unlock_mode: "manual", style: { text_color: "#ffd76a" }, active: true, sort_order: 20 }];
  const app = buildAuthRoutesTestApp(db);
  const response = await app.inject({
    method: "PUT",
    url: "/v1/me/profile/title",
    headers: { authorization: "Bearer token-user-auth" },
    payload: { title_key: "founder_gold" },
  });
  assert.equal(response.statusCode, 400);
});

await runTest("profile title update clears selected title", async () => {
  const db = new AuthRoutesDb();
  const app = buildAuthRoutesTestApp(db);
  const response = await app.inject({
    method: "PUT",
    url: "/v1/me/profile/title",
    headers: { authorization: "Bearer token-user-auth" },
    payload: { title_key: null },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.user.profile.title, null);
});
```

- [ ] **Step 2: Verify failing route tests**

Run:

```powershell
npm run build
node test/auth-routes.test.mjs
```

Expected: FAIL because route is not registered.

- [ ] **Step 3: Implement route**

In `src/routes/me.ts`, update imports:

```ts
import { listUnlockedProfileTitles, updateProfileAvatar, updateProfileTitle } from "../repos/profiles.js";
import { meRouteSchema, updateProfileAvatarRouteSchema, updateProfileTitleRouteSchema } from "../schemas/auth.js";
import { serializeTitleStyle } from "../auth/serializeUser.js";
```

Update `/me` handler:

```ts
app.get("/me", {
  preHandler: requireAuth(runQuery),
  schema: meRouteSchema,
}, async (request) => {
  const unlockedRows = await listUnlockedProfileTitles(runQuery, request.auth!.user.id);
  return {
    data: serializeUser({
      ...request.auth!.user,
      unlocked_titles: unlockedRows.map((title) => ({
        key: title.key,
        label: title.label,
        style: serializeTitleStyle(title.style),
      })),
    }),
  };
});
```

Add `PUT` handler:

```ts
app.put("/me/profile/title", {
  preHandler: requireAuth(runQuery),
  schema: updateProfileTitleRouteSchema,
}, async (request) => {
  const body = request.body as { title_key: string | null };
  const profile = await updateProfileTitle(runQuery, request.auth!.user.id, body.title_key);
  const unlockedRows = await listUnlockedProfileTitles(runQuery, request.auth!.user.id);
  const selected = unlockedRows.find((title) => title.key === profile.selected_title_key);
  return {
    data: {
      user: serializeUser({
        ...request.auth!.user,
        selected_title_key: selected?.key ?? null,
        selected_title_label: selected?.label ?? null,
        selected_title_style: selected?.style ?? null,
        unlocked_titles: unlockedRows.map((title) => ({
          key: title.key,
          label: title.label,
          style: serializeTitleStyle(title.style),
        })),
      }),
    },
  };
});
```

- [ ] **Step 4: Run auth verification**

Run:

```powershell
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit auth route**

```powershell
git add src/routes/me.ts src/schemas/auth.ts test/auth-routes.test.mjs test/docs.test.mjs
git commit -m "Add profile title selection route"
```

---

### Task 4: Auth Client Title Types

**Files:**

- Modify: `optcg-auth-client/src/index.ts`
- Modify: `optcg-auth-client/test/client.test.mjs`

- [ ] **Step 1: Add failing client test**

Add:

```js
test("updateProfileTitle puts selected title key", async () => {
  const requests = [];
  const client = createAuthClient({
    baseUrl: "https://auth.example",
    fetch: async (url, init) => {
      requests.push({ url: String(url), init });
      return jsonResponse({
        data: {
          user: {
            id: "user-1",
            username: "tester",
            display_name: "Tester",
            email: null,
            email_verified: false,
            profile: {
              avatar: null,
              title: {
                key: "pirate_rookie",
                label: "Pirate Rookie",
                style: { text_color: "#e8e9ed", animation: "none" },
              },
            },
          },
        },
      });
    },
  });

  const response = await client.updateProfileTitle({ title_key: "pirate_rookie" });

  assert.equal(requests[0].url, "https://auth.example/v1/me/profile/title");
  assert.equal(requests[0].init.method, "PUT");
  assert.equal(requests[0].init.body, JSON.stringify({ title_key: "pirate_rookie" }));
  assert.equal(response.data.user.profile.title.key, "pirate_rookie");
});
```

- [ ] **Step 2: Run failing client test**

Run:

```powershell
npm test
```

Expected: FAIL because `updateProfileTitle` is missing.

- [ ] **Step 3: Add exported types and helper**

In `src/index.ts`, add:

```ts
export type ProfileTitleStyle = {
  text_color: string;
  font_family?: "display" | "body" | "mono";
  font_weight?: number;
  gradient?: {
    from: string;
    via?: string;
    to: string;
    angle?: number;
  } | null;
  outline_color?: string | null;
  glow_color?: string | null;
  animation?: "none" | "shine" | "pulse";
};

export type ProfileTitle = {
  key: string;
  label: string;
  style: ProfileTitleStyle;
};
```

Update `AuthUser.profile`:

```ts
profile: {
  avatar: ProfileAvatar | null;
  title: ProfileTitle | null;
  unlocked_titles?: ProfileTitle[];
};
```

Add:

```ts
export type UpdateProfileTitleInput = {
  title_key: string | null;
};

export type UpdateProfileTitleResponse = {
  data: {
    user: AuthUser;
  };
};

export function updateProfileTitle(
  input: UpdateProfileTitleInput,
  options: AuthRequestOptions = {},
) {
  return authPut<UpdateProfileTitleResponse>("/me/profile/title", input, options);
}
```

Add to `createAuthClient` return object:

```ts
updateProfileTitle(input: UpdateProfileTitleInput, requestOptions: AuthRequestOptions = {}) {
  return updateProfileTitle(input, { ...options, ...requestOptions });
},
```

- [ ] **Step 4: Run client verification**

Run:

```powershell
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit auth-client changes**

```powershell
git add src/index.ts test/client.test.mjs
git commit -m "Add profile title auth client"
```

---

### Task 5: Admin API Unlock Manager Endpoints

**Files:**

- Create: `optcg-api-admin/src/admin/profileTitles.ts`
- Create: `optcg-api-admin/src/admin/profileTitles.test.ts`
- Modify: `optcg-api-admin/src/schemas/admin.ts`
- Modify: `optcg-api-admin/src/server.ts`

- [ ] **Step 1: Add failing admin API tests**

Create `src/admin/profileTitles.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { adminProfileTitleRoutes } from "./profileTitles.js";

type QueryCall = { sql: string; params?: unknown[] };

function createQueryExecutor(rowsByPattern: Array<{ pattern: RegExp; rows: unknown[] }>) {
  const calls: QueryCall[] = [];
  const queryExecutor = async <T>(sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    const match = rowsByPattern.find((entry) => entry.pattern.test(sql));
    return { rows: (match?.rows ?? []) as T[] };
  };
  return { calls, queryExecutor };
}

test("admin profile title routes resolve a user and list unlocks", async () => {
  const db = createQueryExecutor([
    { pattern: /FROM auth\.users/u, rows: [{ id: "user-1", username: "tester", display_name: "Tester", email: "tester@example.com", selected_title_key: "pirate_rookie" }] },
    { pattern: /FROM auth\.profile_titles/u, rows: [{ key: "pirate_rookie", label: "Pirate Rookie", unlock_mode: "no_requirement", style: { text_color: "#e8e9ed" }, active: true, sort_order: 10 }] },
  ]);
  const app = Fastify();
  app.decorateRequest("admin", null);
  app.addHook("onRequest", async (request) => {
    request.admin = { email: "admin@example.com" };
  });
  await app.register(adminProfileTitleRoutes, { queryExecutor: db.queryExecutor });

  const response = await app.inject({ method: "GET", url: "/profile-titles/users/tester@example.com" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.user.email, "tester@example.com");
  assert.equal(response.json().data.titles[0].key, "pirate_rookie");
});

test("admin profile title routes grant manual title with admin email", async () => {
  const db = createQueryExecutor([
    { pattern: /FROM auth\.users/u, rows: [{ id: "user-1", username: "tester", display_name: "Tester", email: "tester@example.com", selected_title_key: null }] },
    { pattern: /FROM auth\.profile_titles/u, rows: [{ key: "founder_gold", label: "Founder", unlock_mode: "manual", style: { text_color: "#ffd76a" }, active: true, sort_order: 20 }] },
    { pattern: /INSERT INTO auth\.user_title_unlocks/u, rows: [{ id: "unlock-1" }] },
  ]);
  const app = Fastify();
  app.decorateRequest("admin", null);
  app.addHook("onRequest", async (request) => {
    request.admin = { email: "admin@example.com" };
  });
  await app.register(adminProfileTitleRoutes, { queryExecutor: db.queryExecutor });

  const response = await app.inject({
    method: "POST",
    url: "/profile-titles/users/tester/title-unlocks",
    payload: { title_key: "founder_gold", note: "Launch grant" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(db.calls.some((call) => call.params?.includes("admin@example.com")), true);
});
```

- [ ] **Step 2: Run failing admin API tests**

Run:

```powershell
npm run build
node --test dist/admin/profileTitles.test.js
```

Expected: FAIL because `profileTitles.ts` does not exist.

- [ ] **Step 3: Implement admin route**

Create `src/admin/profileTitles.ts`:

```ts
import { FastifyInstance } from "fastify";
import { query } from "optcg-db/db/client.js";
import { adminError, getErrorMessage, replyWithError } from "./errors.js";
import {
  adminGrantProfileTitleRouteSchema,
  adminProfileTitleUserRouteSchema,
  adminRevokeProfileTitleRouteSchema,
  adminProfileTitleCatalogRouteSchema,
} from "../schemas/admin.js";

type QueryExecutor = typeof query;

type Options = {
  queryExecutor?: QueryExecutor;
};

type AdminTitleRow = {
  key: string;
  label: string;
  unlock_mode: "no_requirement" | "manual";
  style: Record<string, unknown>;
  active: boolean;
  sort_order: number;
};

type AdminUserRow = {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  selected_title_key: string | null;
};

const userWhereSql = `
  u.id::text = $1
  OR lower(u.username) = lower($1)
  OR lower(u.email) = lower($1)
`;

async function resolveUser(runQuery: QueryExecutor, identity: string): Promise<AdminUserRow | null> {
  const result = await runQuery<AdminUserRow>(
    `
      SELECT
        u.id,
        u.username,
        u.display_name,
        u.email,
        up.selected_title_key
      FROM auth.users u
      LEFT JOIN auth.user_profiles up ON up.user_id = u.id
      WHERE ${userWhereSql}
      LIMIT 1
    `,
    [identity],
  );
  return result.rows[0] ?? null;
}

async function listTitlesForUser(runQuery: QueryExecutor, userId: string): Promise<AdminTitleRow[]> {
  const result = await runQuery<AdminTitleRow>(
    `
      SELECT
        pt.key,
        pt.label,
        pt.unlock_mode,
        pt.style,
        pt.active,
        pt.sort_order,
        EXISTS (
          SELECT 1
          FROM auth.user_title_unlocks utu
          WHERE utu.user_id = $1
            AND utu.title_key = pt.key
            AND utu.revoked_at IS NULL
        ) AS unlocked
      FROM auth.profile_titles pt
      ORDER BY pt.sort_order ASC, pt.key ASC
    `,
    [userId],
  );
  return result.rows;
}

export async function adminProfileTitleRoutes(app: FastifyInstance, options: Options = {}) {
  const runQuery = options.queryExecutor ?? query;

  app.get("/profile-titles", { schema: adminProfileTitleCatalogRouteSchema }, async () => ({
    data: (await runQuery<AdminTitleRow>(
      `SELECT key, label, unlock_mode, style, active, sort_order FROM auth.profile_titles ORDER BY sort_order ASC, key ASC`,
    )).rows,
  }));

  app.get("/profile-titles/users/:identity", { schema: adminProfileTitleUserRouteSchema }, async (request, reply) => {
    const { identity } = request.params as { identity: string };
    const user = await resolveUser(runQuery, identity);
    if (!user) return replyWithError(reply, 404, "User not found");
    const titles = await listTitlesForUser(runQuery, user.id);
    return { data: { user, titles } };
  });

  app.post("/profile-titles/users/:identity/title-unlocks", { schema: adminGrantProfileTitleRouteSchema }, async (request, reply) => {
    const { identity } = request.params as { identity: string };
    const body = request.body as { title_key?: unknown; note?: unknown };
    if (typeof body.title_key !== "string" || body.title_key.trim().length === 0) {
      return replyWithError(reply, 400, "title_key is required");
    }
    const user = await resolveUser(runQuery, identity);
    if (!user) return replyWithError(reply, 404, "User not found");
    const adminEmail = request.admin?.email;
    if (!adminEmail) return reply.code(401).send(adminError(401, "Missing admin identity"));

    try {
      await runQuery(
        `
          INSERT INTO auth.user_title_unlocks (user_id, title_key, granted_by_admin_email, note)
          SELECT $1, pt.key, $3, $4
          FROM auth.profile_titles pt
          WHERE pt.key = $2
            AND pt.active IS TRUE
            AND pt.unlock_mode = 'manual'
          ON CONFLICT (user_id, title_key) WHERE revoked_at IS NULL
          DO UPDATE SET
            granted_by_admin_email = EXCLUDED.granted_by_admin_email,
            note = EXCLUDED.note,
            updated_at = now()
        `,
        [user.id, body.title_key.trim(), adminEmail, body.note == null ? null : String(body.note)],
      );
    } catch (error) {
      return replyWithError(reply, 400, getErrorMessage(error));
    }
    return { data: { ok: true } };
  });

  app.delete("/profile-titles/users/:identity/title-unlocks/:titleKey", { schema: adminRevokeProfileTitleRouteSchema }, async (request, reply) => {
    const { identity, titleKey } = request.params as { identity: string; titleKey: string };
    const user = await resolveUser(runQuery, identity);
    if (!user) return replyWithError(reply, 404, "User not found");
    await runQuery(
      `
        UPDATE auth.user_title_unlocks
        SET revoked_at = COALESCE(revoked_at, now()), updated_at = now()
        WHERE user_id = $1
          AND title_key = $2
          AND revoked_at IS NULL
      `,
      [user.id, titleKey],
    );
    await runQuery(
      `
        UPDATE auth.user_profiles
        SET selected_title_key = NULL, updated_at = now()
        WHERE user_id = $1
          AND selected_title_key = $2
      `,
      [user.id, titleKey],
    );
    return { data: { ok: true } };
  });
}
```

- [ ] **Step 4: Add schemas and registration**

In `src/server.ts`, import and register:

```ts
import { adminProfileTitleRoutes } from "./admin/profileTitles.js";
```

Inside protected admin route registration:

```ts
protectedAdminApp.register(adminProfileTitleRoutes);
```

In `src/schemas/admin.ts`, add route schemas with `security: adminSecurity`, exact params, and response envelopes matching the bodies in Step 3.

- [ ] **Step 5: Run admin API verification**

Run:

```powershell
npm test
npm run typecheck
```

Expected: both pass.

- [ ] **Step 6: Commit admin API changes**

```powershell
git add src/admin/profileTitles.ts src/admin/profileTitles.test.ts src/schemas/admin.ts src/server.ts
git commit -m "Add admin profile title unlock routes"
```

---

### Task 6: Admin Console Unlock Manager

**Files:**

- Modify: `optcg-admin/src/App.tsx`
- Modify: `optcg-admin/src/components/layout/Sidebar.tsx`
- Modify: `optcg-admin/src/components/layout/AdminLayout.tsx`
- Modify: `optcg-admin/src/api/types.ts`
- Modify: `optcg-admin/src/api/hooks.ts`
- Create: `optcg-admin/src/pages/UnlockManager.tsx`

- [ ] **Step 1: Add API types**

In `src/api/types.ts`, add:

```ts
export interface ProfileTitleStyle {
  text_color: string;
  font_family?: "display" | "body" | "mono";
  font_weight?: number;
  gradient?: {
    from: string;
    via?: string;
    to: string;
    angle?: number;
  } | null;
  outline_color?: string | null;
  glow_color?: string | null;
  animation?: "none" | "shine" | "pulse";
}

export interface AdminProfileTitle {
  key: string;
  label: string;
  unlock_mode: "no_requirement" | "manual";
  style: ProfileTitleStyle;
  active: boolean;
  sort_order: number;
  unlocked?: boolean;
}

export interface AdminProfileTitleUser {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  selected_title_key: string | null;
}

export interface AdminProfileTitleUserResponse {
  data: {
    user: AdminProfileTitleUser;
    titles: AdminProfileTitle[];
  };
}

export interface AdminProfileTitleCatalogResponse {
  data: AdminProfileTitle[];
}
```

- [ ] **Step 2: Add React Query hooks**

In `src/api/hooks.ts`, extend `queryKeys`:

```ts
profileTitleCatalog: ["profile-title-catalog"] as const,
profileTitleUser: (identity: string) => ["profile-title-user", identity] as const,
```

Add:

```ts
export function useProfileTitleCatalog() {
  return useQuery({
    queryKey: queryKeys.profileTitleCatalog,
    queryFn: () => adminFetch<AdminProfileTitleCatalogResponse>("/profile-titles"),
  });
}

export function useProfileTitleUser(identity: string) {
  return useQuery({
    queryKey: queryKeys.profileTitleUser(identity),
    queryFn: () => adminFetch<AdminProfileTitleUserResponse>(`/profile-titles/users/${encodeURIComponent(identity)}`),
    enabled: identity.trim().length > 0,
  });
}

export function useGrantProfileTitleMutation(identity: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { title_key: string; note?: string | null }) =>
      adminFetch<MutationOkResponse>(`/profile-titles/users/${encodeURIComponent(identity)}/title-unlocks`, {
        method: "POST",
        body: input,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.profileTitleUser(identity) });
    },
  });
}

export function useRevokeProfileTitleMutation(identity: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (titleKey: string) =>
      adminFetch<MutationOkResponse>(
        `/profile-titles/users/${encodeURIComponent(identity)}/title-unlocks/${encodeURIComponent(titleKey)}`,
        { method: "DELETE" },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.profileTitleUser(identity) });
    },
  });
}
```

- [ ] **Step 3: Create page**

Create `src/pages/UnlockManager.tsx`:

```tsx
import { useMemo, useState } from "react";
import { useGrantProfileTitleMutation, useProfileTitleCatalog, useProfileTitleUser, useRevokeProfileTitleMutation } from "../api/hooks";
import { Button } from "../components/shared/Button";
import { TextAreaField, TextField } from "../components/shared/Form";
import { StatusBadge } from "../components/shared/StatusBadge";

export function UnlockManagerPage() {
  const [identityDraft, setIdentityDraft] = useState("");
  const [identity, setIdentity] = useState("");
  const [titleKey, setTitleKey] = useState("");
  const [note, setNote] = useState("");
  const catalogQuery = useProfileTitleCatalog();
  const userQuery = useProfileTitleUser(identity);
  const grantTitle = useGrantProfileTitleMutation(identity);
  const revokeTitle = useRevokeProfileTitleMutation(identity);

  const manualTitles = useMemo(
    () => (catalogQuery.data?.data ?? []).filter((title) => title.unlock_mode === "manual" && title.active),
    [catalogQuery.data],
  );

  async function handleGrant() {
    await grantTitle.mutateAsync({ title_key: titleKey, note: note.trim() || null });
    setNote("");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-bg-card p-5">
        <h2 className="font-display text-xl text-text-primary">Unlock Manager</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <TextField label="Exact user ID, email, or username" onChange={(event) => setIdentityDraft(event.target.value)} value={identityDraft} />
          <Button disabled={!identityDraft.trim()} onClick={() => setIdentity(identityDraft.trim())} type="button">Load User</Button>
        </div>
      </section>

      {userQuery.data ? (
        <section className="rounded-lg border border-border bg-bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-lg text-text-primary">{userQuery.data.data.user.display_name}</h3>
              <p className="text-sm text-text-secondary">{userQuery.data.data.user.email ?? userQuery.data.data.user.username}</p>
            </div>
            <StatusBadge tone="accent">Active: {userQuery.data.data.user.selected_title_key ?? "None"}</StatusBadge>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)_auto]">
            <label className="grid gap-1 text-sm text-text-secondary">
              Manual title
              <select className="rounded border border-border bg-bg-input px-3 py-2 text-text-primary" onChange={(event) => setTitleKey(event.target.value)} value={titleKey}>
                <option value="">Select title</option>
                {manualTitles.map((title) => <option key={title.key} value={title.key}>{title.label} ({title.key})</option>)}
              </select>
            </label>
            <TextAreaField label="Note" onChange={(event) => setNote(event.target.value)} value={note} />
            <Button disabled={!titleKey || grantTitle.isPending} onClick={() => void handleGrant()} type="button">Grant</Button>
          </div>

          <div className="mt-6 overflow-hidden rounded border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-bg-secondary text-text-muted">
                <tr><th className="px-3 py-2">Title</th><th className="px-3 py-2">Mode</th><th className="px-3 py-2">State</th><th className="px-3 py-2" /></tr>
              </thead>
              <tbody>
                {userQuery.data.data.titles.map((title) => (
                  <tr key={title.key} className="border-t border-border">
                    <td className="px-3 py-2 text-text-primary">{title.label} <span className="text-text-muted">({title.key})</span></td>
                    <td className="px-3 py-2 text-text-secondary">{title.unlock_mode}</td>
                    <td className="px-3 py-2">{title.unlocked || title.unlock_mode === "no_requirement" ? <StatusBadge tone="success">Available</StatusBadge> : <StatusBadge tone="muted">Locked</StatusBadge>}</td>
                    <td className="px-3 py-2 text-right">
                      {title.unlock_mode === "manual" && title.unlocked ? (
                        <Button disabled={revokeTitle.isPending} onClick={() => void revokeTitle.mutateAsync(title.key)} tone="danger" type="button">Revoke</Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Register route and nav**

In `src/App.tsx`, import page and add:

```tsx
<Route path="/unlocks" element={<UnlockManagerPage />} />
```

In `src/components/layout/Sidebar.tsx`, add:

```ts
{ to: "/unlocks", label: "Unlocks" },
```

In `src/components/layout/AdminLayout.tsx`, add page title:

```ts
"/unlocks": "Unlock Manager",
```

- [ ] **Step 5: Run admin UI verification**

Run:

```powershell
npm run build
```

Expected: build exits 0.

- [ ] **Step 6: Commit admin UI**

```powershell
git add src/App.tsx src/components/layout/Sidebar.tsx src/components/layout/AdminLayout.tsx src/api/types.ts src/api/hooks.ts src/pages/UnlockManager.tsx
git commit -m "Add title unlock manager page"
```

---

### Task 7: Web Profile Title Picker

**Files:**

- Modify: `optcg-web/src/api/client.ts`
- Create: `optcg-web/src/account/profileTitleStyle.ts`
- Modify: `optcg-web/src/pages/AccountPage.tsx`

- [ ] **Step 1: Add API types and client helper**

In `src/api/client.ts`, add profile title types matching `optcg-auth-client`, extend auth profile shape, and add:

```ts
export async function updateProfileTitle(input: { title_key: string | null }) {
  return authPut<UpdateProfileTitleResponse>("/me/profile/title", input);
}
```

- [ ] **Step 2: Add style helper**

Create `src/account/profileTitleStyle.ts`:

```ts
import type { CSSProperties } from "react";
import type { AuthProfileTitleStyle } from "../api/client";

const hexColorPattern = /^#[0-9a-f]{3,8}$/i;

function safeColor(value: string | null | undefined, fallback: string) {
  return value && hexColorPattern.test(value) ? value : fallback;
}

export function profileTitleStyle(style: AuthProfileTitleStyle | null | undefined): CSSProperties {
  if (!style) return {};
  const color = safeColor(style.text_color, "#e8e9ed");
  const fontWeight = typeof style.font_weight === "number" ? style.font_weight : 700;
  if (style.gradient) {
    const angle = typeof style.gradient.angle === "number" ? style.gradient.angle : 90;
    const from = safeColor(style.gradient.from, color);
    const via = safeColor(style.gradient.via ?? null, "");
    const to = safeColor(style.gradient.to, color);
    return {
      color,
      fontWeight,
      backgroundImage: via
        ? `linear-gradient(${angle}deg, ${from}, ${via}, ${to})`
        : `linear-gradient(${angle}deg, ${from}, ${to})`,
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      WebkitTextFillColor: "transparent",
      textShadow: style.glow_color ? `0 0 12px ${safeColor(style.glow_color, color)}` : undefined,
    };
  }
  return {
    color,
    fontWeight,
    textShadow: style.glow_color ? `0 0 12px ${safeColor(style.glow_color, color)}` : undefined,
  };
}
```

- [ ] **Step 3: Add account page picker**

In `src/pages/AccountPage.tsx`, import:

```ts
import { updateProfileTitle } from "../api/client";
import { profileTitleStyle } from "../account/profileTitleStyle";
```

Add state:

```ts
const [selectedTitleKey, setSelectedTitleKey] = useState<string | null>(authSession.user.profile.title?.key ?? null);
const unlockedTitles = authSession.user.profile.unlocked_titles ?? [];
```

Add save handler:

```ts
async function handleSaveTitle() {
  setSaving(true);
  setError(null);
  try {
    const response = await updateProfileTitle({ title_key: selectedTitleKey });
    setAuthSession((current) => current === null ? current : { ...current, user: response.data.user });
  } catch (saveError) {
    setError(saveError instanceof Error ? saveError.message : "Could not save title.");
  } finally {
    setSaving(false);
  }
}
```

Add UI near avatar preview:

```tsx
<section className="grid gap-3 rounded-lg border border-border bg-bg-secondary p-4">
  <h2 className="font-display text-lg text-text-primary">Profile title</h2>
  <div className="flex items-center gap-3">
    <AvatarPreview avatar={authSession.user.profile.avatar} label={`${displayName} avatar`} className="h-14 w-14" />
    <div>
      <div className="text-text-primary">{displayName}</div>
      {authSession.user.profile.title ? (
        <div className="text-sm" style={profileTitleStyle(authSession.user.profile.title.style)}>
          {authSession.user.profile.title.label}
        </div>
      ) : (
        <div className="text-sm text-text-muted">No title selected</div>
      )}
    </div>
  </div>
  <select
    className="rounded border border-border bg-bg-input px-3 py-2 text-text-primary"
    onChange={(event) => setSelectedTitleKey(event.target.value || null)}
    value={selectedTitleKey ?? ""}
  >
    <option value="">No title</option>
    {unlockedTitles.map((title) => (
      <option key={title.key} value={title.key}>{title.label}</option>
    ))}
  </select>
  <button
    className="rounded-md bg-accent px-4 py-2 font-display text-sm font-semibold text-bg-primary disabled:cursor-not-allowed disabled:opacity-60"
    disabled={saving}
    onClick={() => void handleSaveTitle()}
    type="button"
  >
    Save title
  </button>
</section>
```

- [ ] **Step 4: Run web verification**

Run:

```powershell
npm run lint
npm run test
npm run build
```

Expected: all pass.

- [ ] **Step 5: Commit web title picker**

```powershell
git add src/api/client.ts src/account/profileTitleStyle.ts src/pages/AccountPage.tsx
git commit -m "Add profile title picker"
```

---

### Task 8: Sim Title Identity Propagation

**Files:**

- Modify: `optcg-sim-dev/packages/client/src/transport.ts`
- Modify: `optcg-sim-dev/packages/client/src/react/use-sim-auth.ts`
- Modify: `optcg-sim-dev/packages/client/src/react/use-sim-auth.test.ts`
- Modify: `optcg-sim-dev/packages/match-server/src/dev-auth.ts`
- Modify: `optcg-sim-dev/packages/match-server/src/dev-auth.test.ts`
- Modify: `optcg-sim-dev/packages/match-server/src/dev-snapshot-types.ts`
- Modify: `optcg-sim-dev/packages/match-server/src/dev-local-match-registry.ts`
- Modify: `optcg-sim-dev/packages/match-server/src/dev-match-connection-state.test.ts`
- Modify: `optcg-sim-dev/packages/client/src/view-model.ts`
- Modify: `optcg-sim-dev/packages/client/src/view-model.test.ts`
- Modify: `optcg-sim-dev/packages/client/src/react/PlayerSummaryLabel.tsx`
- Modify: `optcg-sim-dev/packages/client/src/react/PlayerSummaryLabel.test.ts`
- Modify: `optcg-sim-dev/packages/client/src/react/BoardLayout.tsx`

- [ ] **Step 1: Add failing token/parser/view tests**

Extend existing avatar tests to expect:

```ts
title: {
  key: "founder_gold",
  label: "Founder",
  style: { text_color: "#ffd76a", animation: "shine" },
}
```

In `use-sim-auth.test.ts`, add title under `session.user.profile.title` and assert the decoded `user-json` token includes `title`.

In `dev-auth.test.ts`, pass `title` to `createDevUserSessionToken` and assert `parseDevSessionToken` returns it.

In `view-model.test.ts`, add `playerLabels[p1].title` and assert `model.selfTitle`.

In `PlayerSummaryLabel.test.ts`, render with `title` prop and assert markup contains `Founder`.

- [ ] **Step 2: Run failing focused sim tests**

Run:

```powershell
corepack pnpm exec vitest run packages/client/src/react/use-sim-auth.test.ts packages/match-server/src/dev-auth.test.ts packages/client/src/view-model.test.ts packages/client/src/react/PlayerSummaryLabel.test.ts
```

Expected: FAIL because title fields are not wired.

- [ ] **Step 3: Add transport/view types**

In `packages/client/src/transport.ts`:

```ts
export interface PlayerTitleView {
  key: string;
  label: string;
  style: {
    text_color: string;
    font_family?: "display" | "body" | "mono";
    font_weight?: number;
    gradient?: { from: string; via?: string; to: string; angle?: number } | null;
    outline_color?: string | null;
    glow_color?: string | null;
    animation?: "none" | "shine" | "pulse";
  };
}
```

Add `title?: PlayerTitleView` to `MatchSnapshot.playerLabels` entries.

In `packages/client/src/view-model.ts`, add `selfTitle?: PlayerTitleView`, `opponentTitle?: PlayerTitleView`, helper:

```ts
const playerTitle = (snapshot: MatchSnapshot, playerId: PlayerId): PlayerTitleView | undefined =>
  snapshot.playerLabels?.[playerId]?.title;
```

- [ ] **Step 4: Add auth subject token support**

In `packages/match-server/src/dev-auth.ts`, add:

```ts
export interface PlayerTitleView {
  readonly key: string;
  readonly label: string;
  readonly style: Record<string, unknown>;
}
```

Add `title?: PlayerTitleView` to `AuthSubject`, `createDevUserSessionToken`, JSON payload parser, and `avatarFromUnknown`-style validator.

In `packages/client/src/react/use-sim-auth.ts`, map:

```ts
const sessionTitle = (session: SimAuthSession): PlayerTitleView | undefined =>
  session.user.profile?.title === null || session.user.profile?.title === undefined
    ? undefined
    : {
        key: session.user.profile.title.key,
        label: session.user.profile.title.label,
        style: session.user.profile.title.style,
      };
```

Include `title` in the JSON token payload.

- [ ] **Step 5: Preserve labels and render title**

In `dev-local-match-registry.ts`, include `title = seat.subject?.title` in `playerLabelsFromSeats` and `refreshSeatSubject`.

In `dev-snapshot-types.ts`, add `title`.

In `BoardLayout.tsx`, pass `title={board.selfTitle}` and `title={board.opponentTitle}`.

In `PlayerSummaryLabel.tsx`, add `title?: PlayerTitleView`; render:

```tsx
{title === undefined ? null : (
  <span className="player-summary-title" style={playerTitleStyle(title.style)}>
    {title.label}
  </span>
)}
```

Add local bounded `playerTitleStyle` helper. Reuse the same color/gradient validation approach from web.

- [ ] **Step 6: Run sim verification**

Run:

```powershell
corepack pnpm exec vitest run packages/client/src/react/use-sim-auth.test.ts packages/match-server/src/dev-auth.test.ts packages/match-server/src/dev-match-connection-state.test.ts packages/client/src/view-model.test.ts packages/client/src/react/PlayerSummaryLabel.test.ts
corepack pnpm run typecheck
```

Expected: all pass. If full `@optcg/client` test suite still has unrelated failures from branch state, report them separately and keep focused tests green.

- [ ] **Step 7: Commit sim changes**

```powershell
git add packages/client/src/transport.ts packages/client/src/react/use-sim-auth.ts packages/client/src/react/use-sim-auth.test.ts packages/match-server/src/dev-auth.ts packages/match-server/src/dev-auth.test.ts packages/match-server/src/dev-snapshot-types.ts packages/match-server/src/dev-local-match-registry.ts packages/match-server/src/dev-match-connection-state.test.ts packages/client/src/view-model.ts packages/client/src/view-model.test.ts packages/client/src/react/PlayerSummaryLabel.tsx packages/client/src/react/PlayerSummaryLabel.test.ts packages/client/src/react/BoardLayout.tsx
git commit -m "Show selected profile titles in sim"
```

---

### Task 9: End-To-End Verification And Release Prep

**Files:**

- No new source files required.
- Use each repo's package scripts.

- [ ] **Step 1: Run repo checks**

Run in each repo:

`optcg-db`

```powershell
npm run typecheck
npm run build
```

`optcg-auth`

```powershell
npm test
```

`optcg-auth-client`

```powershell
npm test
```

`optcg-api-admin`

```powershell
npm test
npm run typecheck
```

`optcg-admin`

```powershell
npm run build
```

`optcg-web`

```powershell
npm run lint
npm run test
npm run build
```

`optcg-sim-dev`

```powershell
corepack pnpm run typecheck
corepack pnpm --filter @optcg/match-server test
corepack pnpm exec vitest run packages/client/src/react/use-sim-auth.test.ts packages/match-server/src/dev-auth.test.ts packages/match-server/src/dev-match-connection-state.test.ts packages/client/src/view-model.test.ts packages/client/src/react/PlayerSummaryLabel.test.ts
```

- [ ] **Step 2: Check API compatibility**

Confirm public `optcg-api` is untouched. Confirm auth profile changes are additive:

- existing `profile.avatar` remains present.
- new `profile.title` is required in auth response schema.
- new `profile.unlocked_titles` is only present where account/profile needs it, or documented if included in every session.

- [ ] **Step 3: Commit any final test fixes**

If verification required small title-related test expectation updates in the planned test files, commit them:

```powershell
git add optcg-auth/test/auth-routes.test.mjs optcg-auth-client/test/client.test.mjs optcg-api-admin/src/admin/profileTitles.test.ts optcg-web/src/pages/AccountPage.test.tsx optcg-sim-dev/packages/client/src/react/use-sim-auth.test.ts optcg-sim-dev/packages/match-server/src/dev-auth.test.ts optcg-sim-dev/packages/match-server/src/dev-match-connection-state.test.ts optcg-sim-dev/packages/client/src/view-model.test.ts optcg-sim-dev/packages/client/src/react/PlayerSummaryLabel.test.ts
git commit -m "test: update profile title expectations"
```

- [ ] **Step 4: Deployment notes**

Before pushing/deploying, document these operational requirements in the final handoff:

- `optcg-db` migration `050_profile_title_unlocks.sql` must run before auth/admin endpoints are deployed.
- If consumers need new published `optcg-db` or `optcg-auth-client` packages, publish/update those packages before deploying dependent services.
- Admin console deployment remains commit-driven through GitHub Actions; do not manually sync S3 unless explicitly asked.
