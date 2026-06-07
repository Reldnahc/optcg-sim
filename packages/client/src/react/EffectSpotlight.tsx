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
  if (text === undefined) {
    return null;
  }
  return (
    <aside className="effect-spotlight" aria-label="Resolving effect">
      {card.imageUrl === undefined ? null : (
        <img className="effect-spotlight__art" src={card.imageUrl} alt="" />
      )}
      <div className="effect-spotlight__body">
        <div className="effect-spotlight__title">{card.name}</div>
        <EffectRulesText
          text={text}
          sourceMap={sourceMap}
          activeSpanIds={active.activeSpanIds}
          compact
        />
      </div>
    </aside>
  );
};
