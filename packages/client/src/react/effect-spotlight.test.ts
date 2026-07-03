import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ActiveEffectTextPresentation,
  CardId,
  InstanceId,
  PlayerId,
} from "@optcg/types";

import type { ClientCardModel } from "../view-model.js";
import { EffectSpotlight } from "./EffectSpotlight.js";
import type { EffectSpotlightControls } from "./use-effect-spotlight.js";

afterEach(() => {
  vi.useRealTimers();
});

const card = (): ClientCardModel => ({
  instanceId: "source-1" as InstanceId,
  cardId: "OP00-001" as CardId,
  name: "Resolving Card",
  category: "Character",
  effectText: "[On Play] Draw 1 card.",
  effectTextSourceMap: {
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
  },
  imageUrl: "https://example.test/card.png",
  attachedDonCount: 0,
  attachedDonCards: [],
});

const combatCard = (
  instanceId: string,
  name: string,
  imageUrl: string,
): ClientCardModel => ({
  ...card(),
  instanceId: instanceId as InstanceId,
  name,
  imageUrl,
});

const targetCard = (index: number): ClientCardModel =>
  combatCard(
    `target-${String(index)}`,
    `Target ${String(index)}`,
    `https://example.test/target-${String(index)}.png`,
  );

const active = (
  overrides: Partial<ActiveEffectTextPresentation> = {},
): ActiveEffectTextPresentation => ({
  source: {
    instanceId: "source-1" as InstanceId,
    cardId: "OP00-001" as CardId,
    playerId: "p1" as PlayerId,
  },
  textKind: "effect",
  activeSpanIds: ["span:body:draw"],
  ...overrides,
});

const effectTextPresentation = (
  model: ClientCardModel,
  activePresentation: ActiveEffectTextPresentation = active(),
) => ({
  kind: "effectText" as const,
  card: model,
  active: activePresentation,
});

const reminderCard = (): ClientCardModel => {
  const effectText =
    "[On Play] Up to 1 of your Characters gains [Unblockable] during this turn. (This card cannot be blocked.)";
  return {
    ...card(),
    effectText,
    effectTextSourceMap: {
      textKind: "effect",
      sourceText: effectText,
      spans: [
        {
          id: "span:body:unblockable",
          role: "body",
          start: 10,
          end: effectText.length,
          text: effectText.slice(10),
        },
      ],
    },
  };
};

const multilineCard = (effectText: string): ClientCardModel => ({
  ...card(),
  effectText,
  effectTextSourceMap: {
    textKind: "effect",
    sourceText: effectText,
    spans: [
      {
        id: "span:body:multiline",
        role: "body",
        start: 10,
        end: effectText.length,
        text: effectText.slice(10),
      },
    ],
  },
});

const controls = (
  overrides: Partial<EffectSpotlightControls> = {},
): EffectSpotlightControls => ({
  paused: false,
  canRewind: true,
  canStepForward: false,
  rewind: () => undefined,
  togglePaused: () => undefined,
  stepForward: () => undefined,
  catchUp: () => undefined,
  ...overrides,
});

const timer = (
  overrides: Partial<{
    readonly shownAtMs: number;
    readonly visibleUntilMs: number;
    readonly paused: boolean;
    readonly pinned: boolean;
    readonly animationKey: string;
  }> = {},
) => ({
  shownAtMs: 1_000,
  visibleUntilMs: 3_000,
  paused: false,
  pinned: false,
  animationKey: "spotlight:source-1:1",
  ...overrides,
});

const effectSpotlightCss = (): string =>
  readFileSync(new URL("./styles/effect-spotlight.css", import.meta.url), {
    encoding: "utf8",
  });

const cssSelectorPattern = (selector: string): string =>
  selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

describe("EffectSpotlight", () => {
  it("renders the resolving card text with active span highlights", () => {
    const html = renderToStaticMarkup(
      createElement(EffectSpotlight, {
        presentation: effectTextPresentation(card()),
      }),
    );

    expect(html).toContain("effect-spotlight");
    expect(html).toContain("effect-spotlight-card");
    expect(html).toContain("effect-spotlight-card__rules");
    expect(html).toContain("Resolving Card");
    expect(html).toContain("effect-rules-span--active");
  });

  it("renders trigger text at the bottom of the resolving rules box", () => {
    const model: ClientCardModel = {
      ...card(),
      triggerText: "[Trigger] Draw 1 card.",
      triggerTextSourceMap: {
        textKind: "trigger",
        sourceText: "[Trigger] Draw 1 card.",
        spans: [
          {
            id: "span:trigger:draw",
            role: "body",
            start: 10,
            end: 22,
            text: "Draw 1 card.",
          },
        ],
      },
    };

    const html = renderToStaticMarkup(
      createElement(EffectSpotlight, {
        presentation: effectTextPresentation(model),
      }),
    );

    expect(html).toContain("effect-spotlight-card__rules");
    expect(html).toContain("trigger-block");
    expect(html).toMatch(
      /effect-spotlight-card__rules[\s\S]*effect-spotlight-card__main-rules[\s\S]*On Play[\s\S]*effect-spotlight-card__trigger-rules[\s\S]*trigger-block[\s\S]*Trigger/u,
    );
  });

  it("keeps a visible resolving shell when catalog text is missing", () => {
    const model = card();
    delete model.effectText;
    delete model.effectTextSourceMap;

    const html = renderToStaticMarkup(
      createElement(EffectSpotlight, {
        presentation: effectTextPresentation(model),
      }),
    );

    expect(html).toContain("effect-spotlight");
    expect(html).toContain("Resolving Card");
  });

  it("omits parenthetical reminder text without losing active span highlights", () => {
    const html = renderToStaticMarkup(
      createElement(EffectSpotlight, {
        presentation: effectTextPresentation(
          reminderCard(),
          active({ activeSpanIds: ["span:body:unblockable"] }),
        ),
      }),
    );

    expect(html).toContain("Unblockable");
    expect(html).not.toContain("This card cannot be blocked.");
    expect(html).toContain("effect-rules-span--active");
  });

  it("preserves source newlines without breaking same-line Then text", () => {
    const withSourceNewline = renderToStaticMarkup(
      createElement(EffectSpotlight, {
        presentation: effectTextPresentation(
          multilineCard("[On Play] Draw 1 card.\nThen, K.O. 1 Character."),
          active({ activeSpanIds: ["span:body:multiline"] }),
        ),
      }),
    );
    const sameLineThen = renderToStaticMarkup(
      createElement(EffectSpotlight, {
        presentation: effectTextPresentation(
          multilineCard("[On Play] Draw 1 card. Then, K.O. 1 Character."),
          active({ activeSpanIds: ["span:body:multiline"] }),
        ),
      }),
    );

    expect(withSourceNewline).toContain("<br/>");
    expect(sameLineThen).not.toContain("<br/>");
  });

  it("renders playback controls under the spotlight card", () => {
    const html = renderToStaticMarkup(
      createElement(EffectSpotlight, {
        presentation: effectTextPresentation(card()),
        controls: controls({ canStepForward: false }),
      }),
    );

    expect(html).toMatch(
      /effect-spotlight-card[\s\S]*effect-spotlight-controls/u,
    );
    expect(html).toContain('aria-label="Previous spotlight"');
    expect(html).toContain('aria-label="Pause spotlight"');
    expect(html).toContain('aria-label="Next spotlight"');
    expect(html).toContain('aria-label="Catch up spotlight"');
    expect(html).toMatch(/aria-label="Next spotlight"[^>]*disabled=""/u);
    expect(
      html.match(/<svg class="effect-spotlight-control__icon"/gu),
    ).toHaveLength(4);
    expect(html).not.toContain(">Left<");
    expect(html).not.toContain(">Pause<");
    expect(html).not.toContain(">Right<");
    expect(html).not.toContain(">Fast forward<");
    expect(html).not.toContain("|&lt;");
    expect(html).not.toContain("&gt;|");
    expect(html).not.toContain("&gt;&gt;|");
  });

  it("renders play and next controls when paused behind present", () => {
    const html = renderToStaticMarkup(
      createElement(EffectSpotlight, {
        presentation: effectTextPresentation(card()),
        controls: controls({ paused: true, canStepForward: true }),
      }),
    );

    expect(html).toContain('aria-label="Play spotlight"');
    expect(html).toContain('aria-label="Next spotlight"');
    expect(html).not.toContain('aria-label="Pause spotlight"');
  });

  it("renders a draining timer across the bottom of the spotlight card", () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000);

    const html = renderToStaticMarkup(
      createElement(EffectSpotlight, {
        presentation: effectTextPresentation(card()),
        timer: timer(),
      }),
    );

    expect(html).toContain(
      'data-effect-spotlight-timer="spotlight:source-1:1"',
    );
    expect(html).toContain("effect-spotlight-card__timer");
    expect(html).toContain("effect-spotlight-card__timer-fill");
    expect(html).toContain("--effect-spotlight-timer-progress:0.5");
    expect(html).not.toContain("--effect-spotlight-timer-duration");
  });

  it("freezes the spotlight timer only while playback is paused", () => {
    const pausedHtml = renderToStaticMarkup(
      createElement(EffectSpotlight, {
        presentation: effectTextPresentation(card()),
        timer: timer({ paused: true }),
      }),
    );
    const pinnedHtml = renderToStaticMarkup(
      createElement(EffectSpotlight, {
        presentation: effectTextPresentation(card()),
        timer: timer({ pinned: true }),
      }),
    );

    expect(pausedHtml).toContain("effect-spotlight-card__timer is-paused");
    expect(pinnedHtml).not.toContain("effect-spotlight-card__timer is-paused");
    expect(pinnedHtml).toContain("effect-spotlight-card__timer");
  });

  it("keeps playback controls visible without an active spotlight card", () => {
    const html = renderToStaticMarkup(
      createElement(EffectSpotlight, {
        presentation: undefined,
        controls: controls(),
      }),
    );

    expect(html).toContain("effect-spotlight");
    expect(html).toContain("effect-spotlight-controls");
    expect(html).toContain('aria-label="Pause spotlight"');
    expect(html).toContain('aria-label="Catch up spotlight"');
    expect(html).not.toContain("effect-spotlight-card");
  });

  it("renders a two-card combat spotlight with power labels", () => {
    const html = renderToStaticMarkup(
      createElement(EffectSpotlight, {
        presentation: {
          kind: "cardLink",
          sourceCard: combatCard(
            "attacker-1",
            "Attacking Leader",
            "https://example.test/attacker.png",
          ),
          relatedCards: [
            combatCard(
              "blocker-1",
              "Blocking Character",
              "https://example.test/blocker.png",
            ),
          ],
          relationLabel: "attacks",
          tone: "combat",
          sourcePower: 7000,
          relatedPowers: [3000],
        },
        controls: controls(),
        timer: timer(),
      }),
    );

    expect(html).toContain("effect-spotlight--linked");
    expect(html).toContain("effect-spotlight-card--linked");
    expect(html).toContain('data-card-link-tone="combat"');
    expect(html).toContain("effect-spotlight-link-card--source");
    expect(html).toContain("effect-spotlight-link-card--related");
    expect(html).toContain("Attacking Leader");
    expect(html).toContain("Blocking Character");
    expect(html).toContain("7000");
    expect(html).toContain("3000");
    expect(html).toContain("is-power-7000");
    expect(html).toContain("is-weak");
    expect(html).toContain("effect-spotlight-link-direction");
    expect(html).toContain("attacks");
    expect(html).toContain(
      'aria-label="Linked card spotlight: Attacking Leader 7000 attacks Blocking Character 3000"',
    );
    expect(html).toMatch(
      /class="effect-spotlight-link"[^>]*aria-hidden="true"/u,
    );
    expect(html).toMatch(
      /effect-spotlight-card--linked[\s\S]*effect-spotlight-controls/u,
    );
  });

  it("renders counter spotlights with the counter increase and target total", () => {
    const html = renderToStaticMarkup(
      createElement(EffectSpotlight, {
        presentation: {
          kind: "cardLink",
          sourceCard: combatCard(
            "counter-1",
            "Counter Card",
            "https://example.test/counter.png",
          ),
          relatedCards: [
            combatCard(
              "leader-1",
              "Defending Leader",
              "https://example.test/leader.png",
            ),
          ],
          relationLabel: "counters",
          tone: "combat",
          sourcePower: 1000,
          relatedPowers: [6000],
        },
        controls: controls(),
        timer: timer(),
      }),
    );

    expect(html).toContain("+1000");
    expect(html).toContain("6000");
    expect(html).not.toContain(">1000<");
    expect(html).toContain(
      'aria-label="Linked card spotlight: Counter Card +1000 counters Defending Leader 6000"',
    );
  });

  it("renders a source-to-target spotlight with fanned target overflow", () => {
    const html = renderToStaticMarkup(
      createElement(EffectSpotlight, {
        presentation: {
          kind: "cardLink",
          active: active(),
          sourceCard: card(),
          relatedCards: [
            targetCard(1),
            targetCard(2),
            targetCard(3),
            targetCard(4),
            targetCard(5),
            targetCard(6),
          ],
          relationLabel: "targets",
          tone: "targeting",
        },
        controls: controls(),
        timer: timer(),
      }),
    );

    expect(html).toContain("effect-spotlight--linked");
    expect(html).toContain("effect-spotlight-card--linked");
    expect(html).toContain('data-card-link-tone="targeting"');
    expect(html).toContain("effect-spotlight-link-card--source");
    expect(html).toContain("effect-spotlight-link-related-cards");
    expect(html).toContain("effect-spotlight-link-rules");
    expect(html).toContain("effect-rules-span--active");
    expect(html).toMatch(
      /effect-spotlight-link-rules[\s\S]*On Play[\s\S]*Draw 1 card\./u,
    );
    expect(html).toContain('data-related-count="6"');
    expect(html).toContain("Resolving Card");
    expect(html).toContain("Target 1");
    expect(html).toContain("Target 5");
    expect(html).not.toContain("Target 6");
    expect(html).toContain("effect-spotlight-link-overflow");
    expect(html).toContain("+1");
    expect(html).toContain("targets");
    expect(html).toContain(
      'aria-label="Linked card spotlight: Resolving Card targets Target 1, Target 2, Target 3, Target 4, Target 5, and 1 more"',
    );
  });

  it("anchors controls to the stable spotlight shell while linked-card content can resize", () => {
    const css = effectSpotlightCss();

    expect(css).not.toMatch(
      /\.effect-spotlight--linked\s*\{[^}]*\b(?:width|height)\s*:/su,
    );
    expect(css).toMatch(
      /\.effect-spotlight-card--linked\s*\{[^}]*\bheight:\s*100%;[^}]*\btransform:\s*translate\(-50%, -50%\);/su,
    );
    expect(css).toMatch(
      /\.effect-spotlight-card--linked\s*\{[^}]*\bwidth:\s*var\(--effect-spotlight-combat-width\);/su,
    );
    expect(css).not.toMatch(
      /\.effect-spotlight-card--linked\s*\{[^}]*\bmax-height\s*:/su,
    );
    expect(css).toMatch(
      /\.effect-spotlight-link-frame\s*\{[^}]*\btransform:\s*translateY\(clamp\(8px,\s*1\.4vh,\s*18px\)\);/su,
    );
  });

  it("uses one linked-card shell for combat and targeting content", () => {
    const css = effectSpotlightCss();

    expect(css).not.toMatch(/--effect-spotlight-targeting-width:/su);
    expect(css).toMatch(
      /\.effect-spotlight-card--linked\s*\{[^}]*\bwidth:\s*var\(--effect-spotlight-combat-width\);/su,
    );
    expect(css).toMatch(
      /\.effect-spotlight-link-frame\s*\{[^}]*\bwidth:\s*100%;[^}]*\btransform:\s*translateY\(clamp\(8px,\s*1\.4vh,\s*18px\)\);/su,
    );
    expect(css).toMatch(
      /\.effect-spotlight-link\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*calc\(var\(--card-width\)\s*\+\s*22px\)\)\s*minmax\(76px,\s*0\.62fr\)\s*minmax\(0,\s*calc\(var\(--card-width\)\s*\+\s*22px\)\);/su,
    );
    expect(css).toMatch(
      /\.effect-spotlight-link-card--related\s*\{[^}]*flex:\s*0 0 min\(calc\(var\(--card-width\)\s*\+\s*20px\),\s*68%\);/su,
    );
    expect(css).toMatch(
      /\.effect-spotlight-link-related-cards\[data-visible-related-count="1"\]\s*\{[^}]*padding-right:\s*0;/su,
    );
    expect(css).toMatch(
      /\.effect-spotlight-link-related-cards\[data-visible-related-count="1"\]\s+\.effect-spotlight-link-card--related\s*\{[^}]*flex:\s*0 0 100%;[^}]*width:\s*100%;[^}]*max-width:\s*100%;/su,
    );
    expect(css).toMatch(
      /\.effect-spotlight-link-rules\s*\{[^}]*\bwidth:\s*100%;/su,
    );
  });

  it("styles linked-card power tone classes for HTML labels", () => {
    const css = effectSpotlightCss();
    const toneSelectors = [
      ".effect-spotlight-link-power__value.is-weak",
      ".effect-spotlight-link-power__value.is-power-5000",
      ".effect-spotlight-link-power__value.is-power-6000",
      ".effect-spotlight-link-power__value.is-power-7000",
      ".effect-spotlight-link-power__value.is-power-8000",
      ".effect-spotlight-link-power__value.is-power-9000",
      ".effect-spotlight-link-power__value.is-over-10000",
    ];

    for (const selector of toneSelectors) {
      expect(css).toMatch(
        new RegExp(
          `${cssSelectorPattern(selector)}\\s*\\{[^}]*\\bcolor\\s*:`,
          "u",
        ),
      );
    }
  });
});
