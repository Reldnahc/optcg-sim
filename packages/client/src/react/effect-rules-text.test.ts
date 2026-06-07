import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EffectRulesText } from "./EffectRulesText.js";

describe("EffectRulesText", () => {
  it("renders active source map spans with highlight classes", () => {
    const html = renderToStaticMarkup(
      createElement(EffectRulesText, {
        text: "[On Play] Draw 1 card.",
        sourceMap: {
          textKind: "effect",
          sourceText: "[On Play] Draw 1 card.",
          spans: [
            {
              id: "span:body:draw",
              role: "body",
              start: 10,
              end: 22,
              text: "Draw 1 card.",
              primitiveEvidence: ["instruction:draw"],
            },
          ],
        },
        activeSpanIds: ["span:body:draw"],
      }),
    );

    expect(html).toContain("effect-rules-span--active");
    expect(html).toContain("Draw 1 card.");
  });

  it("renders search syntax links against the main Poneglyph site", () => {
    const html = renderToStaticMarkup(
      createElement(EffectRulesText, {
        text: "Reveal up to 1 {Sky Island} type card other than [Shura].",
      }),
    );

    expect(html).toContain("https://poneglyph.one/search?q=");
    expect(html).not.toContain("sim.poneglyph");
    expect(html).not.toContain('href="/search');
  });
});
