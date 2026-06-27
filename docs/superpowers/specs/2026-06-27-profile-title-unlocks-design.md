# Profile Title Unlocks Design

## Goal

Add account-wide unlockable profile titles. Titles are the only unlock-gated
profile customization; other cosmetics remain broadly available. A user can
choose one active title on their profile page, and any identity block that shows
their avatar can also show the selected title.

## Scope

This design spans:

- `optcg-auth`: title catalog, unlock storage, profile serialization, user and
  admin APIs.
- `optcg-auth-client`: typed profile title shapes and client helpers.
- `optcg-web`: account/profile title picker and identity rendering.
- `optcg-admin`: unlock manager for manual grants and revokes.
- `optcg-sim`: title propagation through the same identity path used for
  avatars.

No gameplay rules, public card API shapes, or non-title cosmetics are in scope.

## Data Model

Titles live in auth-owned tables, separate from the open cosmetics system.

`auth.profile_titles` is the deploy-controlled catalog:

- `key`: stable unique key such as `founder_gold`.
- `label`: visible title text. Multiple keys may share the same label.
- `unlock_mode`: `no_requirement` or `manual`.
- `style`: structured style metadata.
- `active`: whether the title can be selected or newly granted.
- `sort_order`, `created_at`, `updated_at`.

`auth.user_title_unlocks` stores user entitlements:

- `user_id`.
- `title_key`.
- `granted_by_admin_user_id`.
- `granted_at`.
- `revoked_at`.
- optional `note`.

`auth.user_profiles` stores the selected active title:

- `selected_title_key nullable`.

The API must only serialize `selected_title_key` as active when the title exists,
is active, and either has `unlock_mode = 'no_requirement'` or the user has a
non-revoked unlock row. If an active selection becomes invalid, profile reads
return `title: null` rather than leaking stale or revoked state.

`no_requirement` titles are available to every authenticated user without a
`user_title_unlocks` row. `manual` titles require an active unlock row.

## Title Style

Style is catalog-controlled and structured. Clients must not evaluate raw CSS
from the database.

Recommended API shape:

```ts
type ProfileTitleStyle = {
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
```

Clients convert the structured style into bounded classes and inline styles.
Unknown or invalid style values fail closed to a plain title. Admin can preview
style but cannot edit title definitions.

## User APIs

Authenticated profile/session responses include the selected title:

```ts
profile: {
  avatar: ProfileAvatar | null;
  title: ProfileTitle | null;
}
```

The account/profile page also needs the unlocked title list:

```ts
profile: {
  avatar: ProfileAvatar | null;
  title: ProfileTitle | null;
  unlocked_titles: ProfileTitle[];
}
```

The profile title update endpoint:

- `PUT /v1/me/profile/title`
- body: `{ title_key: string | null }`
- response: updated user/profile.

Validation:

- `null` clears the selected title.
- non-null keys must exist, be active, and either be `no_requirement` or
  unlocked for the authenticated user.
- locked, revoked, inactive, or unknown keys return a 400-level validation
  error.

## Admin Unlock Manager

The admin console gets an `Unlocks` page.

Capabilities:

- Resolve a user by exact email, username, or user ID.
- Show that user's currently unlocked titles and active selected title.
- Grant a deploy-seeded `manual` title by key.
- Revoke an unlocked title.
- Store `granted_by`, `granted_at`, `revoked_at`, and optional note.

Admin cannot create or edit title catalog rows. Catalog changes happen through
deploy-controlled migrations or seed scripts.

Admin API endpoints should be scoped under `/admin`, follow existing JWT auth,
and return typed response bodies consistent with other admin routes.

## Display Flow

Titles should appear anywhere the product renders a user identity block with a
profile image.

Initial display surfaces:

- Web account/profile page.
- Sim player summary near avatar, name, timer, and connection status.

Sim propagation follows the avatar identity path:

1. auth session includes selected title.
2. sim client encodes selected title in the local auth token.
3. match server stores it on `AuthSubject`.
4. snapshots expose it through `playerLabels`.
5. client view model projects `selfTitle` and `opponentTitle`.
6. `PlayerSummaryLabel` renders it with bounded catalog styling.

The selected title is snapshotted for the match session in the same way as the
current avatar work; mid-game profile changes do not need to live-update.

## Testing

Auth tests:

- serialize selected title and unlocked title list.
- reject selecting locked, revoked, inactive, or unknown titles.
- clear selected title with `null`.
- grant and revoke titles through admin endpoints.

Client tests:

- auth-client types include profile title fields.
- web account page renders unlocked title options and saves selection.
- title renderer fails closed on invalid style metadata.

Admin tests:

- exact user lookup.
- grant by title key.
- revoke by title key.
- admin UI cannot create title definitions.

Sim tests:

- sim auth token includes selected title.
- match server parses and stores title on auth subject.
- connection-status updates preserve title in `playerLabels`.
- board view model projects titles.
- player summary renders avatar, name, selected title, timer, and connection
  status without requiring the title.

## Rollout

1. Add schema and seed one or two `no_requirement` and `manual` titles.
2. Extend auth serialization and user title update API.
3. Add admin unlock manager APIs and UI.
4. Add web profile title picker.
5. Extend sim identity propagation and player summary display.

Each step should be independently testable. Existing users start with no
selected title, but can immediately select any active `no_requirement` title.
