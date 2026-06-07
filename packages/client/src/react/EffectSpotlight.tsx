import type { ActiveEffectTextPresentation } from "@optcg/types";

import type { ClientCardModel } from "../view-model.js";
import { EffectRulesText } from "./EffectRulesText.js";

export interface EffectSpotlightProps {
  readonly card: ClientCardModel | undefined;
  readonly active: ActiveEffectTextPresentation | undefined;
}

export const EffectSpotlight = ({
  active,
  card,
}: EffectSpotlightProps): React.JSX.Element | null => {
  if (card === undefined || active === undefined) {
    return null;
  }
  const textKind = active.textKind ?? "effect";
  const text = textKind === "trigger" ? card.triggerText : card.effectText;
  const sourceMap =
    textKind === "trigger"
      ? card.triggerTextSourceMap
      : card.effectTextSourceMap;
  return (
    <aside className="effect-spotlight" aria-label={`Resolving ${card.name}`}>
      <div className="effect-spotlight-card">
        {card.imageUrl === undefined ? (
          <div className="effect-spotlight-card__placeholder">{card.name}</div>
        ) : (
          <img
            className="effect-spotlight-card__art"
            src={card.imageUrl}
            alt={card.name}
          />
        )}
        <div className="effect-spotlight-card__rules">
          {text === undefined ? (
            <div className="effect-spotlight-card__fallback">{card.name}</div>
          ) : (
            <EffectRulesText
              text={text}
              sourceMap={sourceMap}
              activeSpanIds={active.activeSpanIds}
              compact
            />
          )}
        </div>
      </div>
    </aside>
  );
};
