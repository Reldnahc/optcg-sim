# Replay Selector Page Design

## Goal

Add an in-app replay selector page where users can choose a completed replay and
open the existing replay viewer.

## Route

`/replays` is a shell route rendered inside `AppShell`. It is separate from the
dashboard for now so replay browsing does not mix with match creation.

Existing detail routes keep their current behavior:

- `/replays` lists available replay summaries.
- `/replays/:matchId` opens the replay viewer for one match.

## Client Data

Extend the replay client with `listReplays()`, backed by `GET /api/replays`.
The method returns replay summaries using the same shape already returned by the
server replay list route.

## Page Behavior

The selector page should support:

- loading state while summaries are fetched
- error state when the replay list request fails
- empty state when no replays are available
- ready state with replay summary rows

Each ready row links to `/replays/:matchId`.

## Replay Row Content

Each replay summary should show enough information to choose a match without
opening every detail page:

- match id
- format
- status
- player display names and results
- started and ended timestamps
- turn count
- action count

## Non-Goals

- Do not redesign the existing replay viewer.
- Do not add search, filters, pagination, or sorting in this slice.
- Do not change replay authorization behavior.
- Do not add dashboard navigation unless a later request asks for it.

## Testing

Add focused tests for:

- replay client list fetching
- route recognition for `/replays`
- selector ready, empty, loading, and error rendering
