# Card Fixture Capture

Use the `@optcg/cards` fixture capture helper when a story needs a small, reviewed set of real Poneglyph-shaped card detail fixtures. The helper is package-local and intended for explicit card IDs only; it does not update representative manifests, overlays, gameplay support, or deck validation policy.

Run a validation-only capture first:

```powershell
corepack pnpm --filter @optcg/cards capture:fixture -- --card OP05-091 --dry-run
```

Capture one or more explicit cards after review of the intended files:

```powershell
corepack pnpm --filter @optcg/cards capture:fixture -- --card OP05-091 --card OP01-060
```

The default output directory is `fixtures/poneglyph/cards` from the repository root. Use `--out-dir <path>` for a temporary review directory, `--cards OP05-091,OP01-060` for comma-separated input, `--base-url <url>` for a non-default Poneglyph endpoint, and `--lang <lang>` when the source endpoint requires an explicit language.

The helper validates every fetched detail through the checked-in Poneglyph schema before writing any file. If a request fails, a requested card is missing, or any returned detail is invalid, no fixture files are written for that batch. Output is deterministic JSON with sorted object keys and a stable filename of `<card_number>.<slugified-name>.json`.

Tests for the helper must stay hermetic. Do not require live Poneglyph in CI; inject a fake fetch implementation and use checked-in Poneglyph-shaped fixtures for expected card details.

## Target-Effect Fixture Guardrail

Do not promote a real card to target-effect `implemented-dsl` support unless a
checked-in validated Poneglyph detail payload, reviewed printed text, support
metadata, `sourceTextHash`, `behaviorHash`, and effect-definition registry entry
all support the exact target behavior under review.

If the checked-in real fixtures do not honestly support the behavior, record the
blocker in `stories/ambiguities/`, keep the real card unsupported or absent from
the supported overlay, and use synthetic engine-core data for the narrow runtime
primitive coverage.
