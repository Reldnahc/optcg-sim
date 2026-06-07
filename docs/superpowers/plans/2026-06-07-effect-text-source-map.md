# Effect Text Source Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a trustworthy full-stack effect presentation pipeline that maps exact printed card text character ranges to parser primitives, runtime execution, public views, and client highlights.

**Architecture:** The parser owns character ranges into original printed `effectText` and `triggerText`; effect DSL/runtime objects carry stable presentation references, not rewritten text. The engine exposes only public active span references and public target links, while the client renders original text with `optcg-card-rules` and decorates ranges without interpreting gameplay text.

**Tech Stack:** TypeScript strict mode, pnpm workspaces, Vitest, React 19, `optcg-card-rules`, existing `@optcg/types`, `@optcg/cards`, `@optcg/engine-core`, `@optcg/match-server`, and `@optcg/client` packages.

---

## Scope And Boundaries

This plan intentionally builds correctness before visual polish. The first end-to-end slice highlights source text for an On Play sequence with a cost, a `Then,` connector, and a target decision. Later tasks expand coverage to choose-one bullets, optional costs, conditions, and richer visual states.

Source maps are presentation metadata only. They must never certify support. Existing primitive evidence, DSL shape, source hash, and runtime capability checks remain the support authority.

Hidden information remains fail-closed. Public views may expose span IDs for visible source cards and public effect text. They must not expose hidden hand card identities, private search candidates, private selected cards, or replay-only runtime frame internals.

The user explicitly permits reading `packages/cards` and implementing there once parser decomposition is complete. During execution, check `git status --short` before every commit and stage only files touched for the current task.

---

## File Structure

### Shared Types

- Create `packages/types/src/effect-presentation.ts`
  - Defines source map, span, active-span, and target-link contracts.
- Modify `packages/types/src/index.ts`
  - Exports the new type module.
- Modify `packages/types/src/card-metadata.ts`
  - Adds optional source maps to `ResolvedCard`.
- Modify `packages/types/src/effects.ts`
  - Adds optional presentation refs to `EffectBlock` and `SequencedEffect`.
- Modify `packages/types/src/events.ts`
  - Adds optional presentation refs to public event payload helper types only if needed by tests.
- Modify `packages/types/src/view.ts`
  - Adds public active presentation data to `PublicDecisionPresentation` and `PlayerView`.
- Test `packages/types/src/effect-presentation.test.ts`
- Test `packages/types/src/card-metadata.test.ts`
- Test `packages/types/src/effects.test.ts`
- Test `packages/types/src/view.test.ts`

### Cards Parser Source Plumbing

- Create `packages/cards/src/source-slices.ts`
  - Owns ranged text helpers: trim, consume prefix, regex group matching, line splitting, delimiter splitting.
- Modify `packages/cards/src/types.ts`
  - Adds optional `source` to parse input/result types and optional `presentationSpans` to parse results.
- Modify `packages/cards/src/effect-text-lines.ts`
  - Adds ranged gameplay-line extraction alongside existing string extraction.
- Modify `packages/cards/src/orchestrator.ts`
  - Creates root source slices and merges parser spans into parsed lines.
- Modify `packages/cards/src/expression-parser.ts`
  - Propagates source slices through connectors and sequence segment parsing.
- Modify `packages/cards/src/connectors/then.ts`
- Modify `packages/cards/src/connectors/and.ts`
- Modify `packages/cards/src/connectors/sentence.ts`
  - Return ranged segment slices and connector spans.
- Modify `packages/cards/src/entry-points/*`
- Modify `packages/cards/src/markers/*`
- Modify `packages/cards/src/costs/*`
- Modify `packages/cards/src/segments/costed-effect.ts`
- Modify `packages/cards/src/segments/optional-costed-effect.ts`
- Modify `packages/cards/src/segments/composed-expression.ts`
- Modify `packages/cards/src/segments/choose-one.ts`
  - Adds first-wave spans for entry, marker, cost, condition, body, connector, choice header, and bullet options.
- Test `packages/cards/src/source-slices.test.ts`
- Test `packages/cards/src/effect-text-lines.test.ts`
- Test `packages/cards/src/card-effect-line-parser-source-map.test.ts`
- Test `packages/cards/src/card-effect-multiline-choice-parser.test.ts`
- Test existing connector tests.

### Card Repository And Support Reports

- Modify `packages/cards/src/card-repository.ts`
  - Stores parser source maps on resolved cards when generated support is present.
- Modify `packages/cards/src/support-probe-report.ts`
  - Adds optional span diagnostics for parser support work without changing default raw unsupported output.
- Test `packages/cards/src/card-repository.test.ts`
- Test `packages/cards/src/support-probe.test.ts`

### Engine Runtime Presentation Refs

- Modify `packages/engine-core/src/effect-runtime-queue/results.ts`
  - Adds presentation refs to `effectQueued` events where source card is public-safe.
- Modify `packages/engine-core/src/action-results.ts`
  - Adds presentation refs to `effectResolved` event payloads.
- Modify `packages/engine-core/src/effect-runtime-sequence/paths.ts`
- Modify `packages/engine-core/src/effect-runtime-sequence/runner.ts`
- Modify `packages/engine-core/src/effect-runtime-sequence/frame-decisions.ts`
  - Resolves `effectPath` plus segment index to span IDs for sequence pauses.
- Modify primitive decision creators as needed:
  - `packages/engine-core/src/runtime/primitives/target.ts`
  - `packages/engine-core/src/runtime/primitives/target-ko.ts`
  - `packages/engine-core/src/runtime/primitives/trash-from-hand.ts`
  - `packages/engine-core/src/effect-runtime-sequence/select-targets.ts`
  - `packages/engine-core/src/effect-runtime-sequence/select-cards.ts`
  - `packages/engine-core/src/effect-runtime-sequence/draw-upto.ts`
  - `packages/engine-core/src/effect-runtime-sequence/search-reveal.ts`
- Test `packages/engine-core/src/effect-runtime-presentation.test.ts`
- Test `packages/engine-core/src/effect-runtime-sequence/frames.test.ts`
- Test `packages/engine-core/src/runtime/primitives/target.test.ts`

### Public View Filtering

- Modify `packages/engine-core/src/view/public-decision-presentation.ts`
- Modify `packages/engine-core/src/view/public-decision-source.ts`
- Modify `packages/engine-core/src/view/filter-state-for-player.ts`
  - Projects only public-safe source maps, active span IDs, and public target links.
- Test `packages/engine-core/src/view/filter-state-effect-presentation.test.ts`
- Test `packages/engine-core/src/view/filter-state-for-player.real-states-baseline.test.ts`
- Test hidden-info suites for no private leaks.

### Match Server Projection

- Modify `packages/match-server/src/dev-snapshot-types.ts`
- Modify `packages/match-server/src/local-card-catalog.ts`
  - Sends source maps alongside `effectText` and `triggerText`.
- Modify `packages/client/src/transport.ts`
  - Mirrors catalog and public-view presentation types on the client transport boundary.
- Test `packages/match-server/src/local-card-catalog.test.ts`
- Test `packages/client/src/transport*.test.ts` if type fixtures require updates.

### Client Rendering And Correctness UX

- Modify `packages/client/package.json`
  - Add `optcg-card-rules`.
- Modify client style entrypoint, likely `packages/client/src/react/styles/app-shell.css` or app root import file
  - Import `optcg-card-rules/styles.css` once.
- Create `packages/client/src/react/effect-text-ranges.ts`
  - Converts source maps plus active span IDs into renderable highlight ranges.
- Create `packages/client/src/react/EffectRulesText.tsx`
  - Wraps `CardRulesText` and applies span highlight classes.
- Create `packages/client/src/react/use-effect-spotlight.ts`
  - Maintains minimum dwell, pending-decision pinning, and post-resolution grace.
- Create `packages/client/src/react/EffectSpotlight.tsx`
  - Displays card art, title, styled rules text, and active highlights.
- Modify `packages/client/src/react/CardPreviewWindow.tsx`
  - Uses `EffectRulesText` for normal preview text without active highlights.
- Modify `packages/client/src/react/MatchApp.tsx` or current match shell owner
  - Mounts `EffectSpotlight`.
- Modify `packages/client/src/react/use-match-app-session.ts`
  - Provides active presentation data and card catalog entries to the spotlight.
- Test `packages/client/src/react/effect-text-ranges.test.ts`
- Test `packages/client/src/react/effect-rules-text.test.tsx`
- Test `packages/client/src/react/use-effect-spotlight.test.ts`
- Test `packages/client/src/react/effect-spotlight.test.tsx`

---

## Shared Naming Rules

Use stable, deterministic IDs so engine/runtime paths can correlate with parser spans:

```ts
type EffectTextSpanId =
  | `span:${string}`
  | `span:${string}:${number}`
  | `span:${string}:${number}:${number}`;
```

Prefer span IDs shaped by DSL role and path:

```ts
span:entry
span:marker:oncePerTurn
span:cost:returnDon
span:condition:activation
span:sequence:0:body
span:sequence:1:connector
span:sequence:1:body
span:choice:0:option
span:choice:1:option
```

Do not use parser rule names, shape IDs, card IDs, or runtime capability IDs as support authority. They may appear only as diagnostics.

---

## Task 1: Add Shared Effect Presentation Types

**Files:**

- Create: `packages/types/src/effect-presentation.ts`
- Modify: `packages/types/src/index.ts`
- Test: `packages/types/src/effect-presentation.test.ts`

- [ ] **Step 1: Write the failing type test**

Create `packages/types/src/effect-presentation.test.ts`:

```ts
import { expect, test } from "vitest";
import type {
  ActiveEffectTextPresentation,
  EffectTextSourceMap,
  EffectTextSpan,
  EffectTextTargetLink,
} from "./effect-presentation.js";
import type { CardRef, InstanceId } from "./index.js";

test("effect presentation source map describes exact original text ranges", () => {
  const span: EffectTextSpan = {
    id: "span:sequence:1:body",
    role: "body",
    start: 35,
    end: 64,
    text: "K.O. up to 1 Character.",
    primitiveEvidence: ["instruction:ko"],
    effectPath: ["effect", "sequence"],
    sequenceIndex: 1,
  };
  const map: EffectTextSourceMap = {
    textKind: "effect",
    sourceText: "[On Play] Draw 1 card. Then, K.O. up to 1 Character.",
    spans: [span],
  };
  expect(map.spans[0]?.start).toBe(35);
  expect(map.spans[0]?.end).toBe(64);
});

test("active presentation links public targets to exact span ids", () => {
  const target: CardRef = {
    instanceId: "target-1" as InstanceId,
    cardId: "OP00-001",
    playerId: "p2",
  };
  const link: EffectTextTargetLink = {
    spanId: "span:sequence:1:body",
    cards: [target],
    relation: "selectedTarget",
  };
  const active: ActiveEffectTextPresentation = {
    source: {
      instanceId: "source-1" as InstanceId,
      cardId: "OP00-002",
      playerId: "p1",
    },
    activeSpanIds: ["span:sequence:1:body"],
    targetLinks: [link],
  };
  expect(active.targetLinks[0]?.cards[0]?.instanceId).toBe("target-1");
});
```

- [ ] **Step 2: Run the failing type test**

Run:

```powershell
corepack pnpm exec vitest run packages/types/src/effect-presentation.test.ts
```

Expected: fail because `effect-presentation.js` does not exist.

- [ ] **Step 3: Add shared presentation types**

Create `packages/types/src/effect-presentation.ts`:

```ts
import type { CardRef } from "./card-metadata.js";

export type EffectTextDocumentKind = "effect" | "trigger";

export type EffectTextSpanRole =
  | "line"
  | "entry"
  | "marker"
  | "cost"
  | "condition"
  | "choice"
  | "choiceOption"
  | "connector"
  | "body"
  | "target"
  | "filter"
  | "duration";

export type EffectTextSpanId = `span:${string}`;

export interface EffectTextSpan {
  readonly id: EffectTextSpanId;
  readonly role: EffectTextSpanRole;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly primitiveEvidence?: readonly string[];
  readonly effectBlockId?: string;
  readonly effectPath?: readonly string[];
  readonly sequenceIndex?: number;
  readonly parentSpanId?: EffectTextSpanId;
}

export interface EffectTextSourceMap {
  readonly textKind: EffectTextDocumentKind;
  readonly sourceText: string;
  readonly spans: readonly EffectTextSpan[];
}

export interface EffectTextPresentationRef {
  readonly textKind: EffectTextDocumentKind;
  readonly spanIds: readonly EffectTextSpanId[];
}

export interface EffectTextTargetLink {
  readonly spanId: EffectTextSpanId;
  readonly cards: readonly CardRef[];
  readonly relation: "candidateTarget" | "selectedTarget" | "affectedCard";
}

export interface ActiveEffectTextPresentation {
  readonly source: CardRef;
  readonly textKind?: EffectTextDocumentKind;
  readonly activeSpanIds: readonly EffectTextSpanId[];
  readonly targetLinks?: readonly EffectTextTargetLink[];
}
```

Modify `packages/types/src/index.ts`:

```ts
export type * from "./effect-presentation.js";
```

- [ ] **Step 4: Run the type test**

Run:

```powershell
corepack pnpm exec vitest run packages/types/src/effect-presentation.test.ts
```

Expected: pass.

- [ ] **Step 5: Run package typecheck**

Run:

```powershell
corepack pnpm exec tsc -p packages/types/tsconfig.json --noEmit
```

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add packages/types/src/effect-presentation.ts packages/types/src/effect-presentation.test.ts packages/types/src/index.ts
git commit -m "Add effect text presentation types"
```

---

## Task 2: Attach Source Maps To Card And Effect Contracts

**Files:**

- Modify: `packages/types/src/card-metadata.ts`
- Modify: `packages/types/src/effects.ts`
- Modify: `packages/types/src/view.ts`
- Test: `packages/types/src/card-metadata.test.ts`
- Test: `packages/types/src/effects.test.ts`
- Test: `packages/types/src/view.test.ts`

- [ ] **Step 1: Write failing type contract tests**

Add to `packages/types/src/card-metadata.test.ts`:

```ts
import type { EffectTextSourceMap } from "./effect-presentation.js";

test("resolved card can carry effect and trigger source maps", () => {
  const map: EffectTextSourceMap = {
    textKind: "effect",
    sourceText: "[On Play] Draw 1 card.",
    spans: [
      {
        id: "span:body:draw",
        role: "body",
        start: 10,
        end: 22,
        text: "Draw 1 card.",
      },
    ],
  };
  const card: ResolvedCard = {
    cardId: "OP00-001",
    language: "en",
    name: "Test",
    category: "character",
    set: "TEST",
    setName: "Test",
    released: true,
    colors: ["red"],
    attributes: [],
    types: [],
    effectText: map.sourceText,
    printedKeywords: [],
    variants: [],
    legality: {},
    officialFaq: [],
    errata: [],
    sourceTextHash: "hash",
    behaviorHash: "behavior",
    effectTextSourceMap: map,
    support: {
      cardId: "OP00-001",
      status: "implemented-dsl",
      tested: true,
      rulesVersion: "rules",
      cardDataVersion: "cards",
      sourceTextHash: "hash",
      behaviorHash: "behavior",
    },
  };
  expect(card.effectTextSourceMap?.spans[0]?.id).toBe("span:body:draw");
});
```

Add to `packages/types/src/effects.test.ts`:

```ts
test("effect blocks and sequence segments can carry presentation refs", () => {
  const block: EffectBlock = {
    id: "effect-1" as EffectId,
    category: "auto",
    trigger: { type: "onPlay" },
    sourcePresencePolicy: "mustRemainInSameZone",
    presentation: {
      textKind: "effect",
      spanIds: ["span:entry", "span:body:draw"],
    },
    effect: {
      type: "sequence",
      effects: [
        {
          id: "draw",
          connector: "always",
          presentation: {
            textKind: "effect",
            spanIds: ["span:body:draw"],
          },
          effect: { type: "draw", player: "self", count: 1 },
        },
      ],
    },
  };
  expect(block.presentation?.spanIds).toContain("span:entry");
});
```

Add to `packages/types/src/view.test.ts`:

```ts
test("public decision presentation can expose active effect text spans", () => {
  const presentation: PublicDecisionPresentation = {
    title: "Choose target",
    instruction: "Choose a target.",
    effectText: "[On Play] K.O. up to 1 Character.",
    activeEffectText: {
      source: cardRef("source", "player"),
      textKind: "effect",
      activeSpanIds: ["span:body:ko"],
    },
  };
  expect(presentation.activeEffectText?.activeSpanIds).toEqual([
    "span:body:ko",
  ]);
});
```

- [ ] **Step 2: Run failing tests**

Run:

```powershell
corepack pnpm exec vitest run packages/types/src/card-metadata.test.ts packages/types/src/effects.test.ts packages/types/src/view.test.ts
```

Expected: fail on missing properties.

- [ ] **Step 3: Add optional properties to shared contracts**

Modify `packages/types/src/card-metadata.ts`:

```ts
import type { EffectTextSourceMap } from "./effect-presentation.js";
```

Add to `ResolvedCard`:

```ts
effectTextSourceMap?: EffectTextSourceMap;
triggerTextSourceMap?: EffectTextSourceMap;
```

Modify `packages/types/src/effects.ts`:

```ts
import type { EffectTextPresentationRef } from "./effect-presentation.js";
```

Add to `SequencedEffect`:

```ts
presentation?: EffectTextPresentationRef;
```

Add to `EffectBlock`:

```ts
presentation?: EffectTextPresentationRef;
```

Modify `packages/types/src/view.ts`:

```ts
import type {
  ActiveEffectTextPresentation,
  EffectTextSourceMap,
} from "./effect-presentation.js";
```

Add to `PublicDecisionPresentation`:

```ts
effectTextSourceMap?: EffectTextSourceMap;
activeEffectText?: ActiveEffectTextPresentation;
```

Add to `PlayerView`:

```ts
activeEffectText?: ActiveEffectTextPresentation;
```

- [ ] **Step 4: Run tests and typecheck**

Run:

```powershell
corepack pnpm exec vitest run packages/types/src/card-metadata.test.ts packages/types/src/effects.test.ts packages/types/src/view.test.ts
corepack pnpm exec tsc -p packages/types/tsconfig.json --noEmit
```

Expected: both pass.

- [ ] **Step 5: Commit**

```powershell
git add packages/types/src/card-metadata.ts packages/types/src/card-metadata.test.ts packages/types/src/effects.ts packages/types/src/effects.test.ts packages/types/src/view.ts packages/types/src/view.test.ts
git commit -m "Thread effect presentation contracts through shared types"
```

---

## Task 3: Add Source Slice Parser Helpers

**Files:**

- Create: `packages/cards/src/source-slices.ts`
- Modify: `packages/cards/src/types.ts`
- Test: `packages/cards/src/source-slices.test.ts`

- [ ] **Step 1: Write failing source-slice tests**

Create `packages/cards/src/source-slices.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  consumeSourcePrefix,
  createSourceSlice,
  splitSourceByDelimiter,
  sourceSpan,
  trimSource,
} from "./source-slices.js";

describe("source slice helpers", () => {
  it("trims parser text while preserving raw character offsets", () => {
    const source = createSourceSlice("  [On Play] Draw 1 card.  ");
    const trimmed = trimSource(source);
    expect(trimmed.text).toBe("[On Play] Draw 1 card.");
    expect(trimmed.start).toBe(2);
    expect(trimmed.end).toBe(24);
    expect(trimmed.rawText).toBe("[On Play] Draw 1 card.");
  });

  it("consumes a prefix and returns the remaining ranged slice", () => {
    const source = createSourceSlice("[On Play] Draw 1 card.");
    const consumed = consumeSourcePrefix(source, "[On Play]");
    expect(consumed?.consumed.text).toBe("[On Play]");
    expect(consumed?.rest.text).toBe("Draw 1 card.");
    expect(consumed?.rest.start).toBe(10);
  });

  it("splits on Then while preserving delimiter spans", () => {
    const source = createSourceSlice(
      "Draw 1 card. Then, K.O. up to 1 Character.",
    );
    const split = splitSourceByDelimiter(source, /\s+Then,\s+/u, "then");
    expect(split?.segments.map((segment) => segment.text)).toEqual([
      "Draw 1 card.",
      "K.O. up to 1 Character.",
    ]);
    expect(split?.delimiters[0]?.text).toBe("Then,");
    expect(split?.delimiters[0]?.start).toBe(13);
  });

  it("creates a span from a slice", () => {
    const source = createSourceSlice("[On Play] Draw 1 card.");
    const span = sourceSpan("span:entry", "entry", source, ["entry:onPlay"]);
    expect(span.start).toBe(0);
    expect(span.end).toBe(22);
    expect(span.primitiveEvidence).toEqual(["entry:onPlay"]);
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
corepack pnpm exec vitest run packages/cards/src/source-slices.test.ts
```

Expected: fail because helper module does not exist.

- [ ] **Step 3: Implement helper module**

Create `packages/cards/src/source-slices.ts`:

```ts
import type {
  EffectTextSpan,
  EffectTextSpanId,
  EffectTextSpanRole,
} from "@optcg/types";
import type { PrimitiveEvidence } from "./types.js";

export interface SourceSlice {
  readonly text: string;
  readonly rawText: string;
  readonly start: number;
  readonly end: number;
}

export interface SourceDelimiter {
  readonly id: string;
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export const createSourceSlice = (text: string): SourceSlice => ({
  text,
  rawText: text,
  start: 0,
  end: text.length,
});

export const trimSource = (source: SourceSlice): SourceSlice => {
  const leading = /^\s*/u.exec(source.rawText)?.[0].length ?? 0;
  const trailing = /\s*$/u.exec(source.rawText)?.[0].length ?? 0;
  const rawText = source.rawText.slice(
    leading,
    source.rawText.length - trailing,
  );
  return {
    text: rawText.trim(),
    rawText,
    start: source.start + leading,
    end: source.end - trailing,
  };
};

export const consumeSourcePrefix = (
  source: SourceSlice,
  prefix: string,
):
  | { readonly consumed: SourceSlice; readonly rest: SourceSlice }
  | undefined => {
  const trimmed = trimSource(source);
  if (!trimmed.rawText.startsWith(prefix)) {
    return undefined;
  }
  const consumedRaw = trimmed.rawText.slice(0, prefix.length);
  const restRaw = trimmed.rawText.slice(prefix.length);
  return {
    consumed: {
      text: consumedRaw.trim(),
      rawText: consumedRaw,
      start: trimmed.start,
      end: trimmed.start + consumedRaw.length,
    },
    rest: trimSource({
      text: restRaw,
      rawText: restRaw,
      start: trimmed.start + prefix.length,
      end: trimmed.end,
    }),
  };
};

export const splitSourceByDelimiter = (
  source: SourceSlice,
  pattern: RegExp,
  delimiterId: string,
):
  | {
      readonly segments: readonly SourceSlice[];
      readonly delimiters: readonly SourceDelimiter[];
    }
  | undefined => {
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);
  const segments: SourceSlice[] = [];
  const delimiters: SourceDelimiter[] = [];
  let lastIndex = 0;
  for (const match of source.rawText.matchAll(regex)) {
    const index = match.index;
    const delimiterRaw = match[0];
    if (index === undefined || delimiterRaw.length === 0) {
      continue;
    }
    const segmentRaw = source.rawText.slice(lastIndex, index);
    const segment = trimSource({
      text: segmentRaw,
      rawText: segmentRaw,
      start: source.start + lastIndex,
      end: source.start + index,
    });
    if (segment.text.length > 0) {
      segments.push(segment);
    }
    const delimiterTrimmed = trimSource({
      text: delimiterRaw,
      rawText: delimiterRaw,
      start: source.start + index,
      end: source.start + index + delimiterRaw.length,
    });
    delimiters.push({
      id: delimiterId,
      text: delimiterTrimmed.text,
      start: delimiterTrimmed.start,
      end: delimiterTrimmed.end,
    });
    lastIndex = index + delimiterRaw.length;
  }
  const finalRaw = source.rawText.slice(lastIndex);
  const finalSegment = trimSource({
    text: finalRaw,
    rawText: finalRaw,
    start: source.start + lastIndex,
    end: source.end,
  });
  if (finalSegment.text.length > 0) {
    segments.push(finalSegment);
  }
  return segments.length > 1 ? { segments, delimiters } : undefined;
};

export const sourceSpan = (
  id: EffectTextSpanId,
  role: EffectTextSpanRole,
  source: SourceSlice,
  evidence?: readonly PrimitiveEvidence[],
): EffectTextSpan => ({
  id,
  role,
  start: source.start,
  end: source.end,
  text: source.rawText,
  ...(evidence === undefined || evidence.length === 0
    ? {}
    : { primitiveEvidence: evidence }),
});
```

Modify `packages/cards/src/types.ts`:

```ts
import type { EffectTextSpan } from "@optcg/types";
import type { SourceSlice } from "./source-slices.js";
```

Add optional properties:

```ts
export interface ParseInput {
  readonly text: string;
  readonly source?: SourceSlice;
  readonly entryPoint?: EntryPointParseResult["node"];
}
```

Add to parse result interfaces:

```ts
readonly presentationSpans?: readonly EffectTextSpan[];
```

Add to `ConnectorParseResult`:

```ts
readonly sourceSegments?: readonly SourceSlice[];
readonly connectorSpans?: readonly EffectTextSpan[];
```

- [ ] **Step 4: Run helper tests and typecheck cards**

Run:

```powershell
corepack pnpm exec vitest run packages/cards/src/source-slices.test.ts
corepack pnpm exec tsc -p packages/cards/tsconfig.json --noEmit
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add packages/cards/src/source-slices.ts packages/cards/src/source-slices.test.ts packages/cards/src/types.ts
git commit -m "Add parser source slice helpers"
```

---

## Task 4: Preserve Original Ranges Through Gameplay Line Extraction

**Files:**

- Modify: `packages/cards/src/effect-text-lines.ts`
- Test: `packages/cards/src/effect-text-lines.test.ts`

- [ ] **Step 1: Add failing ranged line tests**

Add to `packages/cards/src/effect-text-lines.test.ts`:

```ts
import { gameplayLineSlicesFromTextParts } from "./effect-text-lines.js";

it("preserves ranges while grouping choose-one blocks and trailing Then lines", () => {
  const text = `[Main] Choose one:
• Draw 2 cards.
• Rest up to 1 Character.
Then, draw 1 card.`;
  const lines = gameplayLineSlicesFromTextParts([text]);
  expect(lines).toHaveLength(1);
  expect(lines[0]?.text).toBe(text);
  expect(lines[0]?.start).toBe(0);
  expect(lines[0]?.end).toBe(text.length);
});

it("preserves ranges when joining detached effect headers", () => {
  const text = `[On Play]
Draw 1 card.`;
  const lines = gameplayLineSlicesFromTextParts([text]);
  expect(lines).toHaveLength(1);
  expect(lines[0]?.text).toBe("[On Play] Draw 1 card.");
  expect(lines[0]?.rawText).toBe(text);
  expect(lines[0]?.start).toBe(0);
  expect(lines[0]?.end).toBe(text.length);
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
corepack pnpm exec vitest run packages/cards/src/effect-text-lines.test.ts
```

Expected: fail because ranged extractor does not exist.

- [ ] **Step 3: Implement ranged line extraction**

Modify `packages/cards/src/effect-text-lines.ts`:

```ts
import type { SourceSlice } from "./source-slices.js";
import { createSourceSlice, trimSource } from "./source-slices.js";
```

Add:

```ts
export const gameplayLineSlicesFromTextParts = (
  parts: readonly (string | null | undefined)[],
): SourceSlice[] =>
  groupChooseOneBlockSlices(
    joinDetachedEffectHeaderSlices(
      parts.flatMap((text) => rangedNonReminderLines(text ?? "")),
    ),
  );

const rangedNonReminderLines = (text: string): SourceSlice[] => {
  const root = createSourceSlice(text);
  const lines: SourceSlice[] = [];
  const pattern = /[^\r\n]+/gu;
  for (const match of root.rawText.matchAll(pattern)) {
    const index = match.index;
    const rawText = match[0];
    if (index === undefined) continue;
    const trimmed = trimSource({
      text: rawText,
      rawText,
      start: index,
      end: index + rawText.length,
    });
    if (trimmed.text.length > 0 && !isParentheticalReminderLine(trimmed.text)) {
      lines.push(trimmed);
    }
  }
  return lines;
};

const joinSlices = (
  slices: readonly SourceSlice[],
  text: string,
): SourceSlice => ({
  text,
  rawText: slices.map((slice) => slice.rawText).join("\n"),
  start: slices[0]?.start ?? 0,
  end: slices[slices.length - 1]?.end ?? 0,
});
```

Implement `joinDetachedEffectHeaderSlices` and `groupChooseOneBlockSlices` as ranged equivalents of the existing string functions, using `joinSlices(...)` and preserving the current `gameplayLinesFromTextParts(...)` behavior by deriving strings from the ranged function:

```ts
export const gameplayLinesFromTextParts = (
  parts: readonly (string | null | undefined)[],
): string[] =>
  gameplayLineSlicesFromTextParts(parts).map((slice) => slice.text);
```

- [ ] **Step 4: Run tests**

Run:

```powershell
corepack pnpm exec vitest run packages/cards/src/effect-text-lines.test.ts
corepack pnpm exec vitest run packages/cards/src/support-probe.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add packages/cards/src/effect-text-lines.ts packages/cards/src/effect-text-lines.test.ts
git commit -m "Preserve source ranges for gameplay text lines"
```

---

## Task 5: Propagate Source Slices Through Parser Orchestration

**Files:**

- Modify: `packages/cards/src/orchestrator.ts`
- Modify: `packages/cards/src/card-effect-line-parser/index.ts`
- Test: `packages/cards/src/card-effect-line-parser-source-map.test.ts`

- [ ] **Step 1: Write failing parser source-map test**

Create `packages/cards/src/card-effect-line-parser-source-map.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseCardEffectLinesDetailed } from "./card-effect-line-parser/index.js";

describe("card effect parser source maps", () => {
  it("emits exact source text and top-level spans for a simple On Play line", () => {
    const text = "[On Play] Draw 1 card.";
    const result = parseCardEffectLinesDetailed(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = result.value[0];
    if (parsed === undefined || !("block" in parsed)) {
      throw new Error("Expected runtime effect line.");
    }
    expect(parsed.sourceMap?.sourceText).toBe(text);
    expect(parsed.sourceMap?.spans.map((span) => span.role)).toContain("entry");
    expect(parsed.sourceMap?.spans.map((span) => span.role)).toContain("body");
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
corepack pnpm exec vitest run packages/cards/src/card-effect-line-parser-source-map.test.ts
```

Expected: fail because `sourceMap` is missing.

- [ ] **Step 3: Add parsed-line source map contract**

Modify `packages/cards/src/types.ts`:

```ts
import type { EffectTextSourceMap } from "@optcg/types";
```

Add to `ParsedRuntimeEffectLine`:

```ts
readonly sourceMap?: EffectTextSourceMap;
```

- [ ] **Step 4: Create root source maps in orchestrator**

Modify `packages/cards/src/orchestrator.ts` to create `SourceSlice` when no source is present:

```ts
import { createSourceSlice, sourceSpan } from "./source-slices.js";
```

At parse entry:

```ts
const rootSource = input.source ?? createSourceSlice(text);
```

When pushing a parsed runtime line, merge spans from entry/markers/expression:

```ts
const spans = [
  ...leadingMarkerParse.presentationSpans,
  ...entryPoint.presentationSpans,
  ...markerParse.presentationSpans,
  ...expression.presentationSpans,
];
```

Add:

```ts
sourceMap:
  spans.length === 0
    ? undefined
    : {
        textKind: entryPoint.node.trigger.type === "trigger" ? "trigger" : "effect",
        sourceText: rootSource.rawText,
        spans,
      },
```

- [ ] **Step 5: Run focused parser source-map test**

Run:

```powershell
corepack pnpm exec vitest run packages/cards/src/card-effect-line-parser-source-map.test.ts
```

Expected: still fail until entry/body spans are added in later tasks, but type errors should be gone.

- [ ] **Step 6: Commit only if tests pass**

This task should not be committed until Task 6 adds enough spans for the focused test to pass. Continue to Task 6 before committing.

---

## Task 6: Emit Entry, Marker, Connector, And Body Spans In Shared Parser Plumbing

**Files:**

- Modify: `packages/cards/src/entry-points/*`
- Modify: `packages/cards/src/markers/*`
- Modify: `packages/cards/src/connectors/then.ts`
- Modify: `packages/cards/src/connectors/and.ts`
- Modify: `packages/cards/src/connectors/sentence.ts`
- Modify: `packages/cards/src/expression-parser.ts`
- Modify: `packages/cards/src/segments/synthetic.ts`
- Test: `packages/cards/src/card-effect-line-parser-source-map.test.ts`
- Test: `packages/cards/src/connectors/*.test.ts`

- [ ] **Step 1: Add expected span assertions**

Extend `packages/cards/src/card-effect-line-parser-source-map.test.ts`:

```ts
it("emits connector and sequence body spans for Then-separated effects", () => {
  const text =
    "[On Play] Draw 1 card. Then, K.O. up to 1 of your opponent's Characters with a cost of 2 or less.";
  const result = parseCardEffectLinesDetailed(text);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const parsed = result.value[0];
  if (parsed === undefined || !("block" in parsed)) {
    throw new Error("Expected runtime effect line.");
  }
  const spans = parsed.sourceMap?.spans ?? [];
  expect(
    spans.some((span) => span.role === "connector" && span.text === "Then,"),
  ).toBe(true);
  expect(spans.some((span) => span.id === "span:sequence:0:body")).toBe(true);
  expect(spans.some((span) => span.id === "span:sequence:1:body")).toBe(true);
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
corepack pnpm exec vitest run packages/cards/src/card-effect-line-parser-source-map.test.ts
```

Expected: fail because spans are absent.

- [ ] **Step 3: Update connector parsers**

Modify each connector parser to call `splitSourceByDelimiter(input.source ?? createSourceSlice(input.text), ...)` and return:

```ts
return {
  segments: split.segments.map((segment) => segment.text),
  sourceSegments: split.segments,
  connectors: split.segments.map((_, index) =>
    index === 0 ? "always" : "then",
  ),
  connectorSpans: split.delimiters.map((delimiter, index) => ({
    id: `span:connector:${delimiter.id}:${String(index)}`,
    role: "connector",
    start: delimiter.start,
    end: delimiter.end,
    text: delimiter.text,
    primitiveEvidence: ["connector:then"],
  })),
  evidence: ["connector:then"],
};
```

Use `connector:andOrdered` for `and.ts` and `connector:sentence` for `sentence.ts`.

- [ ] **Step 4: Update expression parser to pass slices**

Modify `packages/cards/src/expression-parser.ts`:

```ts
const segmentSources =
  connectorParse?.sourceSegments ??
  (input.source === undefined ? undefined : [input.source]);
```

Pass source to `parseSegment`:

```ts
const parsed = parseSegment(
  segmentText,
  registry.segments,
  segmentSources?.[index],
);
```

Include connector spans and segment spans in `ExpressionParseResult.presentationSpans`.

- [ ] **Step 5: Add generic body spans in synthetic segment parser**

Modify `packages/cards/src/segments/synthetic.ts` so a successfully parsed instruction segment adds:

```ts
presentationSpans: [
  sourceSpan(
    `span:sequence:${String(index)}:body`,
    "body",
    input.source,
    result.evidence,
  ),
];
```

If the segment parser does not know the sequence index, use `span:body` and let `parseExpression` rewrite body span IDs based on segment index.

- [ ] **Step 6: Add entry and marker spans**

In entry-point and marker parsers, use `consumeSourcePrefix` and `sourceSpan` when `input.source` is present. Preserve existing behavior when source is absent.

- [ ] **Step 7: Run parser tests**

Run:

```powershell
corepack pnpm exec vitest run packages/cards/src/card-effect-line-parser-source-map.test.ts packages/cards/src/connectors/then.test.ts packages/cards/src/connectors/and.test.ts packages/cards/src/card-effect-line-parser.test.ts
corepack pnpm exec tsc -p packages/cards/tsconfig.json --noEmit
```

Expected: pass.

- [ ] **Step 8: Commit Tasks 5 and 6 together**

```powershell
git add packages/cards/src/orchestrator.ts packages/cards/src/card-effect-line-parser/index.ts packages/cards/src/card-effect-line-parser-source-map.test.ts packages/cards/src/entry-points packages/cards/src/markers packages/cards/src/connectors packages/cards/src/expression-parser.ts packages/cards/src/segments/synthetic.ts packages/cards/src/types.ts
git commit -m "Emit parser source maps for basic effect spans"
```

---

## Task 7: Source Map Costs, Conditions, And Choose-One Bullets

**Files:**

- Modify: `packages/cards/src/costs/*`
- Modify: `packages/cards/src/segments/costed-effect.ts`
- Modify: `packages/cards/src/segments/optional-costed-effect.ts`
- Modify: `packages/cards/src/segments/composed-expression.ts`
- Modify: `packages/cards/src/segments/choose-one.ts`
- Modify: `packages/cards/src/conditions/*`
- Test: `packages/cards/src/card-effect-line-parser-source-map.test.ts`
- Test: `packages/cards/src/card-effect-multiline-choice-parser.test.ts`
- Test: `packages/cards/src/card-effect-line-parser-cost-sequence.test.ts`

- [ ] **Step 1: Add failing cost and choose-one tests**

Add to `packages/cards/src/card-effect-line-parser-source-map.test.ts`:

```ts
it("emits separate cost and post-cost body spans", () => {
  const text = "[On Play] DON!! -1: Draw 1 card.";
  const result = parseCardEffectLinesDetailed(text);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const parsed = result.value[0];
  if (parsed === undefined || !("block" in parsed))
    throw new Error("Expected block.");
  const spans = parsed.sourceMap?.spans ?? [];
  expect(
    spans.some((span) => span.role === "cost" && span.text.includes("DON!!")),
  ).toBe(true);
  expect(
    spans.some((span) => span.role === "body" && span.text === "Draw 1 card."),
  ).toBe(true);
});

it("emits choice header and bullet option spans", () => {
  const text = `[Main] Choose one:
• Draw 2 cards.
• Rest up to 1 of your opponent's Characters.`;
  const result = parseCardEffectLinesDetailed(text);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const parsed = result.value[0];
  if (parsed === undefined || !("block" in parsed))
    throw new Error("Expected block.");
  const spans = parsed.sourceMap?.spans ?? [];
  expect(
    spans.some(
      (span) => span.role === "choice" && span.text.includes("Choose one"),
    ),
  ).toBe(true);
  expect(spans.filter((span) => span.role === "choiceOption")).toHaveLength(2);
});
```

- [ ] **Step 2: Run failing tests**

Run:

```powershell
corepack pnpm exec vitest run packages/cards/src/card-effect-line-parser-source-map.test.ts
```

Expected: fail on missing cost and choice spans.

- [ ] **Step 3: Add cost spans through cost parsers**

Each reusable cost parser returns `presentationSpans` for the exact cost slice. The parser should use the existing matched cost text slice, not rebuild text from cost data.

For `parseReturnDonCost`, emit:

```ts
sourceSpan("span:cost:returnDon", "cost", matchedCostSource, [
  "cost:returnDon",
]);
```

For optional trash/reveal/move/rest self costs, use IDs:

```ts
span: cost: trashFromHand;
span: cost: revealFromHand;
span: cost: moveCards;
span: cost: restSelf;
span: cost: trashSelf;
```

- [ ] **Step 4: Add condition spans through composed expression parsers**

When `parseLeadingConditionalExpression` splits `If ... , thenText`, preserve the condition group source slice and emit:

```ts
sourceSpan(
  "span:condition:activation",
  "condition",
  conditionSource,
  condition.evidence,
);
```

For trailing condition `... if condition`, emit:

```ts
sourceSpan(
  "span:condition:resolution",
  "condition",
  conditionSource,
  condition.evidence,
);
```

- [ ] **Step 5: Add choice spans**

Modify `packages/cards/src/segments/choose-one.ts` so `parseChooseOneBody` returns ranged payload:

```ts
{
  choiceHeader: SourceSlice;
  optionSlices: SourceSlice[];
  trailingThen?: SourceSlice;
}
```

Emit:

```ts
sourceSpan("span:choice", "choice", choiceHeader, ["composition:chooseOne"]);
sourceSpan(`span:choice:${String(index)}:option`, "choiceOption", optionSlice, [
  "choice:option",
]);
```

Attach each option span to the corresponding `EffectOption` by adding `presentation` to `EffectOption` if Task 2 did not already add it. If required, update `packages/types/src/effects.ts`:

```ts
presentation?: EffectTextPresentationRef;
```

- [ ] **Step 6: Run parser tests**

Run:

```powershell
corepack pnpm exec vitest run packages/cards/src/card-effect-line-parser-source-map.test.ts packages/cards/src/card-effect-multiline-choice-parser.test.ts packages/cards/src/card-effect-line-parser-cost-sequence.test.ts
corepack pnpm exec tsc -p packages/cards/tsconfig.json --noEmit
```

Expected: pass.

- [ ] **Step 7: Commit**

```powershell
git add packages/cards/src/costs packages/cards/src/conditions packages/cards/src/segments packages/cards/src/card-effect-line-parser-source-map.test.ts packages/cards/src/card-effect-multiline-choice-parser.test.ts packages/cards/src/card-effect-line-parser-cost-sequence.test.ts packages/types/src/effects.ts packages/types/src/effects.test.ts
git commit -m "Map costs conditions and choices to effect text spans"
```

---

## Task 8: Store Source Maps On Resolved Cards

**Files:**

- Modify: `packages/cards/src/card-repository.ts`
- Modify: `packages/cards/src/support-probe-report.ts`
- Test: `packages/cards/src/card-repository.test.ts`
- Test: `packages/cards/src/support-probe.test.ts`

- [ ] **Step 1: Write failing repository test**

Add to `packages/cards/src/card-repository.test.ts`:

```ts
test("resolved implemented DSL card includes effect text source map", async () => {
  const cache = new FakeCardCache();
  const cardId = "OP01-001" as CardId;
  const client = new FakePoneglyphClient({
    "OP01-001": poneglyphCard("OP01-001", "[On Play] Draw 1 card."),
  });
  const repository = createCardRepository({
    cache,
    poneglyphClient: client,
    versions,
  });

  const [maybeResolved] = await repository.resolveCards([cardId]);
  const resolved = required(maybeResolved, "resolved card");

  if (resolved.support.status !== "implemented-dsl") {
    throw new Error("Fixture must be implemented DSL for this test.");
  }
  assert.equal(resolved.effectTextSourceMap?.sourceText, resolved.effectText);
  assert.equal(
    resolved.effectTextSourceMap?.spans.some((span) =>
      span.evidence.includes("instruction:draw"),
    ),
    true,
  );
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
corepack pnpm exec vitest run packages/cards/src/card-repository.test.ts
```

Expected: fail because source map is not copied to `ResolvedCard`.

- [ ] **Step 3: Copy parser source maps into resolved cards**

In `packages/cards/src/card-repository.ts`, when generated support parses effect and trigger text, set:

```ts
...(effectSourceMap === undefined ? {} : { effectTextSourceMap: effectSourceMap }),
...(triggerSourceMap === undefined ? {} : { triggerTextSourceMap: triggerSourceMap }),
```

Do this only from parser output for the same `sourceTextHash`.

- [ ] **Step 4: Add support probe span diagnostics**

In `packages/cards/src/support-probe-report.ts`, add non-default report lines:

```text
Source spans:
- span:entry [0, 9] entry:onPlay
- span:body:draw [10, 22] instruction:draw
```

Do not alter `--raw-unsupported-lines` output.

- [ ] **Step 5: Run tests**

Run:

```powershell
corepack pnpm exec vitest run packages/cards/src/card-repository.test.ts packages/cards/src/support-probe.test.ts
corepack pnpm exec tsc -p packages/cards/tsconfig.json --noEmit
```

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add packages/cards/src/card-repository.ts packages/cards/src/card-repository.test.ts packages/cards/src/support-probe-report.ts packages/cards/src/support-probe.test.ts
git commit -m "Store parser source maps on resolved cards"
```

---

## Task 9: Add Runtime Presentation Ref Resolution

**Files:**

- Create: `packages/engine-core/src/runtime/effect-presentation.ts`
- Modify: `packages/engine-core/src/effect-runtime-sequence/paths.ts`
- Modify: `packages/engine-core/src/effect-runtime-sequence/runner.ts`
- Modify: `packages/engine-core/src/action-results.ts`
- Modify: `packages/engine-core/src/effect-runtime-queue/results.ts`
- Test: `packages/engine-core/src/effect-runtime-presentation.test.ts`

- [ ] **Step 1: Write failing runtime presentation test**

Create `packages/engine-core/src/effect-runtime-presentation.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { EffectDefinition, EffectTextSourceMap } from "@optcg/types";
import { activeSpanIdsForEffectPath } from "./runtime/effect-presentation.js";

describe("runtime effect presentation refs", () => {
  test("resolves sequence effect paths to parser span ids", () => {
    const sourceMap: EffectTextSourceMap = {
      textKind: "effect",
      sourceText: "[On Play] Draw 1 card. Then, K.O. up to 1 Character.",
      spans: [
        {
          id: "span:sequence:1:body",
          role: "body",
          start: 35,
          end: 64,
          text: "K.O. up to 1 Character.",
          effectPath: ["effect", "sequence"],
          sequenceIndex: 1,
        },
      ],
    };
    const ids = activeSpanIdsForEffectPath({
      sourceMap,
      effectPath: ["effect", "sequence"],
      sequenceIndex: 1,
    });
    expect(ids).toEqual(["span:sequence:1:body"]);
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
corepack pnpm exec vitest run packages/engine-core/src/effect-runtime-presentation.test.ts
```

Expected: fail because helper does not exist.

- [ ] **Step 3: Implement runtime helper**

Create `packages/engine-core/src/runtime/effect-presentation.ts`:

```ts
import type { EffectTextSourceMap, EffectTextSpanId } from "@optcg/types";

export const activeSpanIdsForEffectPath = ({
  sourceMap,
  effectPath,
  sequenceIndex,
}: {
  readonly sourceMap: EffectTextSourceMap | undefined;
  readonly effectPath: readonly string[];
  readonly sequenceIndex?: number;
}): EffectTextSpanId[] => {
  if (sourceMap === undefined) {
    return [];
  }
  return sourceMap.spans
    .filter((span) => {
      const samePath =
        span.effectPath === undefined ||
        (span.effectPath.length === effectPath.length &&
          span.effectPath.every((part, index) => part === effectPath[index]));
      const sameIndex =
        sequenceIndex === undefined || span.sequenceIndex === sequenceIndex;
      return (
        samePath &&
        sameIndex &&
        (span.role === "body" ||
          span.role === "cost" ||
          span.role === "choiceOption")
      );
    })
    .map((span) => span.id);
};
```

- [ ] **Step 4: Add presentation refs to events**

In `packages/engine-core/src/action-results.ts`, include optional payload:

```ts
...(queuedEntry.presentation === undefined
  ? {}
  : { presentation: queuedEntry.presentation }),
```

If `EffectQueueEntry` needs presentation, add optional:

```ts
presentation?: ActiveEffectTextPresentation;
```

Thread it from effect queue creation in `effect-runtime-queue/results.ts`.

- [ ] **Step 5: Run runtime presentation test**

Run:

```powershell
corepack pnpm exec vitest run packages/engine-core/src/effect-runtime-presentation.test.ts
corepack pnpm exec tsc -p packages/engine-core/tsconfig.json --noEmit
```

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add packages/engine-core/src/runtime/effect-presentation.ts packages/engine-core/src/effect-runtime-presentation.test.ts packages/engine-core/src/action-results.ts packages/engine-core/src/effect-runtime-queue/results.ts packages/types/src/game-state.ts
git commit -m "Resolve runtime effect text presentation refs"
```

---

## Task 10: Project Active Presentation Through Public Player Views

**Files:**

- Modify: `packages/engine-core/src/view/public-decision-presentation.ts`
- Modify: `packages/engine-core/src/view/public-decision-source.ts`
- Modify: `packages/engine-core/src/view/filter-state-for-player.ts`
- Test: `packages/engine-core/src/view/filter-state-effect-presentation.test.ts`
- Test: `packages/engine-core/src/view/filter-state-effect-execution-frames.test.ts`

- [ ] **Step 1: Write failing public-view test**

Create `packages/engine-core/src/view/filter-state-effect-presentation.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "vitest";

import type { DecisionId } from "@optcg/types";

import { createActiveState, p1, p2 } from "../action-test-fixtures.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";

test("pending decision exposes active effect text spans without execution frames", () => {
  const state = createActiveState();
  state.pendingDecision = {
    id: "decision:effect-presentation" as DecisionId,
    type: "selectCards",
    playerId: p1,
    prompt: "Choose a character.",
    causedBy: { type: "effect", sourceInstanceId: "source-instance" },
    visibility: { type: "private", playerId: p1 },
    candidates: [],
    min: 0,
    max: 1,
    selectionConstraint: undefined,
    presentation: {
      title: "Choose target",
      instruction: "Choose a character.",
      activeEffectText: {
        cardId: "OP01-001",
        textKind: "effect",
        sourceMapId: "effect-text:OP01-001:effect",
        activeSpanIds: ["span:body:ko"],
      },
    },
  };

  const forDecisionPlayer = filterStateForPlayer(state, p1);
  const forOpponent = filterStateForPlayer(state, p2);

  assert.deepEqual(
    forDecisionPlayer.pendingDecision?.presentation.activeEffectText
      ?.activeSpanIds,
    ["span:body:ko"],
  );
  assert.equal(
    JSON.stringify(forDecisionPlayer).includes("effectExecutionFrames"),
    false,
  );
  assert.equal(forOpponent.pendingDecision, undefined);
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
corepack pnpm exec vitest run packages/engine-core/src/view/filter-state-effect-presentation.test.ts
```

Expected: fail because public presentation is not projected.

- [ ] **Step 3: Project safe active spans**

Update `publicDecisionPresentation` to accept:

```ts
activeEffectText?: ActiveEffectTextPresentation;
effectTextSourceMap?: EffectTextSourceMap;
```

Include these fields only when `source` is visible to the requesting player.

Update `filter-state-for-player.ts` to compute active presentation for:

- current `pendingDecision`
- current `activeEffectSource`
- visible source card catalog source map

Keep existing `effectExecutionFrames` hidden test passing.

- [ ] **Step 4: Run view and hidden-info tests**

Run:

```powershell
corepack pnpm exec vitest run packages/engine-core/src/view/filter-state-effect-presentation.test.ts packages/engine-core/src/view/filter-state-effect-execution-frames.test.ts packages/engine-core/src/view/filter-state-for-player.real-states-baseline.test.ts
corepack pnpm exec vitest run tests/hidden-info
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add packages/engine-core/src/view/public-decision-presentation.ts packages/engine-core/src/view/public-decision-source.ts packages/engine-core/src/view/filter-state-for-player.ts packages/engine-core/src/view/filter-state-effect-presentation.test.ts packages/engine-core/src/view/filter-state-effect-execution-frames.test.ts packages/engine-core/src/view/filter-state-for-player.real-states-baseline.test.ts
git commit -m "Project public effect text presentation refs"
```

---

## Task 11: Send Source Maps Through Match Server And Client Transport

**Files:**

- Modify: `packages/match-server/src/dev-snapshot-types.ts`
- Modify: `packages/match-server/src/local-card-catalog.ts`
- Modify: `packages/client/src/transport.ts`
- Test: `packages/match-server/src/local-card-catalog.test.ts`
- Test: `packages/client/src/view-model.test.ts`

- [ ] **Step 1: Write failing catalog projection test**

Add to `packages/match-server/src/local-card-catalog.test.ts`:

```ts
test("local dev card catalog includes effect text source maps for visible cards", () => {
  const match = createTestMatch();
  const p1State = match.state.players[p1];
  if (p1State === undefined) {
    throw new Error("Missing p1 state.");
  }
  const visible = p1State.hand[0];
  if (visible === undefined) {
    throw new Error("Missing visible hand card.");
  }
  const card = match.state.cardManifest.cards[visible.cardId];
  if (card === undefined) {
    throw new Error("Missing visible card manifest entry.");
  }
  card.effectTextSourceMap = {
    id: `effect-text:${visible.cardId}:effect`,
    cardId: visible.cardId,
    textKind: "effect",
    sourceText: card.effectText,
    spans: [
      {
        id: "span:body:draw",
        role: "body",
        start: 10,
        end: card.effectText.length,
        text: card.effectText.slice(10),
        evidence: ["instruction:draw"],
      },
    ],
  };

  const catalog = getLocalDevCardCatalogForPlayer(match, p1);
  const entry = catalog.players[p1]?.instances?.[visible.instanceId];
  assert.equal(entry?.effectTextSourceMap?.sourceText, entry?.effectText);
  assert.equal(entry?.effectTextSourceMap?.spans[0]?.id, "span:body:draw");
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
corepack pnpm exec vitest run packages/match-server/src/local-card-catalog.test.ts
```

Expected: fail because catalog entry omits source maps.

- [ ] **Step 3: Add catalog fields**

Update server/client catalog entry types:

```ts
effectTextSourceMap?: EffectTextSourceMap;
triggerTextSourceMap?: EffectTextSourceMap;
```

In `local-card-catalog.ts`, copy:

```ts
...(card.effectTextSourceMap === undefined
  ? {}
  : { effectTextSourceMap: card.effectTextSourceMap }),
...(card.triggerTextSourceMap === undefined
  ? {}
  : { triggerTextSourceMap: card.triggerTextSourceMap }),
```

- [ ] **Step 4: Run tests and typechecks**

Run:

```powershell
corepack pnpm exec vitest run packages/match-server/src/local-card-catalog.test.ts packages/client/src/view-model.test.ts
corepack pnpm exec tsc -p packages/match-server/tsconfig.json --noEmit
corepack pnpm exec tsc -p packages/client/tsconfig.json --noEmit
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add packages/match-server/src/dev-snapshot-types.ts packages/match-server/src/local-card-catalog.ts packages/match-server/src/local-card-catalog.test.ts packages/client/src/transport.ts packages/client/src/view-model.test.ts
git commit -m "Send effect text source maps to the client"
```

---

## Task 12: Add Client Rules Text Renderer

**Files:**

- Modify: `packages/client/package.json`
- Modify: root lockfile after pnpm install
- Create: `packages/client/src/react/effect-text-ranges.ts`
- Create: `packages/client/src/react/EffectRulesText.tsx`
- Modify: `packages/client/src/react/CardPreviewWindow.tsx`
- Modify: app CSS entrypoint
- Test: `packages/client/src/react/effect-text-ranges.test.ts`
- Test: `packages/client/src/react/effect-rules-text.test.tsx`
- Test: `packages/client/src/react/card-preview-window.test.ts`

- [ ] **Step 1: Install renderer dependency**

Run:

```powershell
corepack pnpm --filter @optcg/client add optcg-card-rules@^0.1.0
```

Expected: `packages/client/package.json` and lockfile update.

- [ ] **Step 2: Write failing range rendering tests**

Create `packages/client/src/react/effect-text-ranges.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { splitTextByHighlightRanges } from "./effect-text-ranges.js";

describe("effect text ranges", () => {
  it("splits original text into active and inactive chunks", () => {
    const chunks = splitTextByHighlightRanges("[On Play] Draw 1 card.", [
      { start: 10, end: 22, state: "active" },
    ]);
    expect(chunks).toEqual([
      { text: "[On Play] ", state: "normal" },
      { text: "Draw 1 card.", state: "active" },
    ]);
  });
});
```

Create `packages/client/src/react/effect-rules-text.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EffectRulesText } from "./EffectRulesText.js";

describe("EffectRulesText", () => {
  it("renders active source map spans with highlight classes", () => {
    const html = renderToStaticMarkup(
      <EffectRulesText
        text="[On Play] Draw 1 card."
        sourceMap={{
          textKind: "effect",
          sourceText: "[On Play] Draw 1 card.",
          spans: [
            {
              id: "span:body:draw",
              role: "body",
              start: 10,
              end: 22,
              text: "Draw 1 card.",
            },
          ],
        }}
        activeSpanIds={["span:body:draw"]}
      />,
    );
    expect(html).toContain("effect-rules-span--active");
    expect(html).toContain("Draw 1 card.");
  });
});
```

- [ ] **Step 3: Run failing tests**

Run:

```powershell
corepack pnpm exec vitest run packages/client/src/react/effect-text-ranges.test.ts packages/client/src/react/effect-rules-text.test.tsx
```

Expected: fail because modules do not exist.

- [ ] **Step 4: Implement range splitter**

Create `packages/client/src/react/effect-text-ranges.ts`:

```ts
export interface HighlightRange {
  readonly start: number;
  readonly end: number;
  readonly state: "active" | "resolved" | "skipped";
}

export interface TextChunk {
  readonly text: string;
  readonly state: "normal" | HighlightRange["state"];
}

export const splitTextByHighlightRanges = (
  text: string,
  ranges: readonly HighlightRange[],
): TextChunk[] => {
  const sorted = [...ranges]
    .filter(
      (range) =>
        range.start >= 0 && range.end > range.start && range.end <= text.length,
    )
    .sort((a, b) => a.start - b.start);
  const chunks: TextChunk[] = [];
  let cursor = 0;
  for (const range of sorted) {
    if (range.start > cursor) {
      chunks.push({ text: text.slice(cursor, range.start), state: "normal" });
    }
    chunks.push({
      text: text.slice(range.start, range.end),
      state: range.state,
    });
    cursor = range.end;
  }
  if (cursor < text.length) {
    chunks.push({ text: text.slice(cursor), state: "normal" });
  }
  return chunks;
};
```

- [ ] **Step 5: Implement rules text wrapper**

Create `packages/client/src/react/EffectRulesText.tsx`:

```tsx
import { CardRulesText } from "optcg-card-rules";
import type { EffectTextSourceMap, EffectTextSpanId } from "@optcg/types";
import { splitTextByHighlightRanges } from "./effect-text-ranges.js";

export interface EffectRulesTextProps {
  readonly text: string;
  readonly sourceMap?: EffectTextSourceMap | undefined;
  readonly activeSpanIds?: readonly EffectTextSpanId[] | undefined;
  readonly compact?: boolean | undefined;
}

export const EffectRulesText = ({
  activeSpanIds = [],
  compact,
  sourceMap,
  text,
}: EffectRulesTextProps): JSX.Element => {
  const active = new Set(activeSpanIds);
  const ranges =
    sourceMap?.sourceText === text
      ? sourceMap.spans
          .filter((span) => active.has(span.id))
          .map((span) => ({
            start: span.start,
            end: span.end,
            state: "active" as const,
          }))
      : [];
  const chunks = splitTextByHighlightRanges(text, ranges);
  return (
    <div className="effect-rules-text">
      {chunks.map((chunk, index) => (
        <span
          className={
            chunk.state === "normal"
              ? "effect-rules-span"
              : `effect-rules-span effect-rules-span--${chunk.state}`
          }
          key={`${String(index)}:${chunk.text}`}
        >
          <CardRulesText text={chunk.text} compact={compact} />
        </span>
      ))}
    </div>
  );
};
```

Import `optcg-card-rules/styles.css` once in the client React app style entry.

- [ ] **Step 6: Use renderer in card preview**

Modify `CardPreviewWindow.tsx` to render:

```tsx
<EffectRulesText text={card.effectText} sourceMap={card.effectTextSourceMap} />
```

and similarly for trigger text.

- [ ] **Step 7: Run client tests**

Run:

```powershell
corepack pnpm exec vitest run packages/client/src/react/effect-text-ranges.test.ts packages/client/src/react/effect-rules-text.test.tsx packages/client/src/react/card-preview-window.test.ts
corepack pnpm exec tsc -p packages/client/tsconfig.json --noEmit
```

Expected: pass.

- [ ] **Step 8: Commit**

```powershell
git add packages/client/package.json pnpm-lock.yaml packages/client/src/react/effect-text-ranges.ts packages/client/src/react/effect-text-ranges.test.ts packages/client/src/react/EffectRulesText.tsx packages/client/src/react/effect-rules-text.test.tsx packages/client/src/react/CardPreviewWindow.tsx packages/client/src/react/card-preview-window.test.ts packages/client/src/react/styles
git commit -m "Render card rules text with source span highlights"
```

---

## Task 13: Add Correctness-First Effect Spotlight

**Files:**

- Create: `packages/client/src/react/use-effect-spotlight.ts`
- Create: `packages/client/src/react/EffectSpotlight.tsx`
- Modify: `packages/client/src/react/use-match-app-session.ts`
- Modify: match app shell component that owns board/window layout
- Modify: client CSS
- Test: `packages/client/src/react/use-effect-spotlight.test.ts`
- Test: `packages/client/src/react/effect-spotlight.test.tsx`

- [ ] **Step 1: Write failing spotlight hook tests**

Create `packages/client/src/react/use-effect-spotlight.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { effectSpotlightModel } from "./use-effect-spotlight.js";

describe("effect spotlight model", () => {
  it("pins while a pending decision has active effect text", () => {
    const model = effectSpotlightModel({
      nowMs: 1_000,
      previous: undefined,
      minimumDwellMs: 2_000,
      graceMs: 800,
      active: {
        source: {
          instanceId: "source-1",
          cardId: "OP00-001",
          playerId: "p1",
        },
        activeSpanIds: ["span:body:ko"],
      },
      pendingDecisionId: "decision-1",
    });
    expect(model?.pinned).toBe(true);
    expect(model?.visibleUntilMs).toBeGreaterThan(1_000);
  });

  it("keeps minimum dwell after a fast decision resolves", () => {
    const previous = {
      sourceInstanceId: "source-1",
      activeSpanIds: ["span:body:ko"],
      shownAtMs: 1_000,
      visibleUntilMs: 3_000,
      pinned: true,
    };
    const model = effectSpotlightModel({
      nowMs: 1_200,
      previous,
      minimumDwellMs: 2_000,
      graceMs: 800,
      active: undefined,
      pendingDecisionId: undefined,
    });
    expect(model?.visibleUntilMs).toBe(3_000);
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
corepack pnpm exec vitest run packages/client/src/react/use-effect-spotlight.test.ts
```

Expected: fail because hook/model does not exist.

- [ ] **Step 3: Implement pure spotlight model and hook**

Create `packages/client/src/react/use-effect-spotlight.ts` with a pure `effectSpotlightModel(...)` plus React hook. The pure model must:

- create a new spotlight when active presentation appears
- keep `visibleUntilMs = shownAtMs + minimumDwellMs`
- set `pinned = true` while `pendingDecisionId` is present
- after decision clears, keep max of previous minimum dwell and `nowMs + graceMs`
- never expose hidden source cards; it consumes only public view data

- [ ] **Step 4: Implement component**

Create `EffectSpotlight.tsx`:

```tsx
import type { ClientCardModel } from "../view-model.js";
import type { ActiveEffectTextPresentation } from "@optcg/types";
import { EffectRulesText } from "./EffectRulesText.js";

export interface EffectSpotlightProps {
  readonly card: ClientCardModel | undefined;
  readonly active: ActiveEffectTextPresentation | undefined;
}

export const EffectSpotlight = ({
  active,
  card,
}: EffectSpotlightProps): JSX.Element | null => {
  if (card === undefined || active === undefined) {
    return null;
  }
  return (
    <aside className="effect-spotlight" aria-label="Resolving effect">
      {card.imageUrl === undefined ? null : (
        <img className="effect-spotlight__art" src={card.imageUrl} alt="" />
      )}
      <div className="effect-spotlight__body">
        <div className="effect-spotlight__title">{card.name}</div>
        {card.effectText === undefined ? null : (
          <EffectRulesText
            text={card.effectText}
            sourceMap={card.effectTextSourceMap}
            activeSpanIds={active.activeSpanIds}
            compact
          />
        )}
      </div>
    </aside>
  );
};
```

- [ ] **Step 5: Mount in match app**

Use `playerSnapshot.view.activeEffectText` and `pendingDecision.presentation.activeEffectText` from the current player view. Resolve the source card with existing `cardModel(...)`.

- [ ] **Step 6: Run client tests**

Run:

```powershell
corepack pnpm exec vitest run packages/client/src/react/use-effect-spotlight.test.ts packages/client/src/react/effect-spotlight.test.tsx
corepack pnpm exec tsc -p packages/client/tsconfig.json --noEmit
```

Expected: pass.

- [ ] **Step 7: Commit**

```powershell
git add packages/client/src/react/use-effect-spotlight.ts packages/client/src/react/use-effect-spotlight.test.ts packages/client/src/react/EffectSpotlight.tsx packages/client/src/react/effect-spotlight.test.tsx packages/client/src/react/use-match-app-session.ts packages/client/src/react/MatchApp.tsx packages/client/src/react/styles
git commit -m "Add correctness-first effect spotlight"
```

---

## Task 14: End-To-End Vertical Slice Regression

**Files:**

- Test: `packages/cards/src/card-effect-line-parser-source-map.test.ts`
- Test: `packages/engine-core/src/effect-runtime-presentation.test.ts`
- Test: `packages/match-server/src/local-card-catalog.test.ts`
- Test: `packages/client/src/react/effect-spotlight.test.tsx`
- Optional create: `tests/integration/effect-presentation-pipeline.test.mjs`

- [ ] **Step 1: Add end-to-end test fixture**

Create `tests/integration/effect-presentation-pipeline.test.mjs`:

```js
import { test, expect } from "vitest";
import { parseCardEffectLinesDetailed } from "../../packages/cards/src/card-effect-line-parser/index.js";

test("effect presentation pipeline maps original text to active sequence target span", () => {
  const text =
    "[On Play] DON!! -1: Draw 1 card. Then, K.O. up to 1 of your opponent's Characters with a cost of 2 or less.";
  const parsed = parseCardEffectLinesDetailed(text);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  const line = parsed.value[0];
  if (line === undefined || !("block" in line)) {
    throw new Error("Expected runtime line.");
  }
  const spans = line.sourceMap?.spans ?? [];
  const koSpan = spans.find((span) => span.id === "span:sequence:1:body");
  expect(koSpan?.text).toContain("K.O. up to 1");
  expect(text.slice(koSpan.start, koSpan.end)).toBe(koSpan.text);
});
```

- [ ] **Step 2: Run focused vertical test**

Run:

```powershell
corepack pnpm exec vitest run tests/integration/effect-presentation-pipeline.test.mjs
```

Expected: pass.

- [ ] **Step 3: Run focused package suites**

Run:

```powershell
corepack pnpm exec vitest run packages/cards/src/card-effect-line-parser-source-map.test.ts packages/engine-core/src/effect-runtime-presentation.test.ts packages/match-server/src/local-card-catalog.test.ts packages/client/src/react/effect-spotlight.test.tsx
```

Expected: pass.

- [ ] **Step 4: Commit**

```powershell
git add tests/integration/effect-presentation-pipeline.test.mjs packages/cards/src/card-effect-line-parser-source-map.test.ts packages/engine-core/src/effect-runtime-presentation.test.ts packages/match-server/src/local-card-catalog.test.ts packages/client/src/react/effect-spotlight.test.tsx
git commit -m "Cover effect presentation pipeline end to end"
```

---

## Task 15: Final Verification And Guardrails

**Files:**

- Modify tests only if verification reveals legitimate gaps.

- [ ] **Step 1: Run formatting**

Run:

```powershell
corepack pnpm exec prettier --check packages/types/src packages/cards/src packages/engine-core/src packages/match-server/src packages/client/src tests/integration
```

Expected: pass. If it fails, run `corepack pnpm exec prettier --write <listed files>` and commit formatting only.

- [ ] **Step 2: Run lint**

Run:

```powershell
corepack pnpm run lint
```

Expected: pass.

- [ ] **Step 3: Run typecheck**

Run:

```powershell
corepack pnpm run typecheck
```

Expected: pass.

- [ ] **Step 4: Run tests**

Run:

```powershell
corepack pnpm run test
corepack pnpm run test:hidden-info
corepack pnpm run test:tooling
```

Expected: pass.

- [ ] **Step 5: Run contracts**

Run:

```powershell
corepack pnpm run contracts
```

Expected: pass.

- [ ] **Step 6: Run verify if feasible**

Run:

```powershell
corepack pnpm run verify
```

Expected: pass. If it is too slow or blocked by unrelated dirty work, record the exact failing command and reason in the final response.

- [ ] **Step 7: Commit final verification-only fixes**

If verification changed formatting or tests:

```powershell
git add <changed files>
git commit -m "Tighten effect presentation verification"
```

If no files changed, do not create an empty commit.

---

## Self-Review

Spec coverage:

- Exact printed text is preserved by `EffectTextSourceMap.sourceText` and ranged source slices.
- Parser spans are introduced in shared parser seams first, then detailed costs/conditions/choices.
- DSL/runtime correlation is handled by `presentation` refs on effect blocks/segments and runtime `effectPath` helpers.
- Public hidden-info filtering is handled in public view projection tasks and hidden-info verification.
- Match-server and client transport carry source maps with existing card catalogs.
- Client renders source text through `optcg-card-rules` and highlights spans without parsing gameplay text.
- The first vertical slice proves cost, body, connector, target-decision highlighting before broader polish.

Placeholder scan:

- No task uses undefined implementation placeholders as acceptance criteria.
- Every code-bearing task includes concrete file paths, commands, and expected outcomes.

Type consistency:

- Shared names are `EffectTextSourceMap`, `EffectTextSpan`, `EffectTextSpanId`, `EffectTextPresentationRef`, `ActiveEffectTextPresentation`, and `EffectTextTargetLink`.
- Client/server catalog fields are `effectTextSourceMap` and `triggerTextSourceMap`.
- Public-view active presentation field is `activeEffectText`.

Residual risks:

- Some parser regex groups may need local source helper support where group offsets are ambiguous. Use slice-local matching and fail closed if duplicate substring lookup cannot be disambiguated.
- Rendering highlight chunks through `CardRulesText` may split a badge if a range starts inside bracketed syntax. The first UI pass should prefer whole parser spans that align to syntactic units; later work can extend `optcg-card-rules` to accept native highlight ranges.
- Full support for every primitive is intentionally incremental. Missing source spans must degrade to no highlight, never guessed highlight.
