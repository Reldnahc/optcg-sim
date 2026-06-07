import type { EffectTextSpan, EffectTextSpanId } from "@optcg/types";

export const scopedPresentationSpanId = (
  spanId: EffectTextSpanId,
  scope: string | undefined,
): EffectTextSpanId => (scope === undefined ? spanId : `${spanId}:${scope}`);

export const scopePresentationSpan = (
  span: EffectTextSpan,
  scope: string | undefined,
): EffectTextSpan => ({
  ...span,
  id: scopedPresentationSpanId(span.id, scope),
  ...(span.parentSpanId === undefined
    ? {}
    : { parentSpanId: scopedPresentationSpanId(span.parentSpanId, scope) }),
});

export const presentationSpanScope = ({
  blockIndex,
  lineIndex,
  scoped,
}: {
  readonly blockIndex: number;
  readonly lineIndex: number;
  readonly scoped: boolean;
}): string | undefined =>
  scoped
    ? `line:${String(lineIndex + 1)}${
        blockIndex === 0 ? "" : `:block:${String(blockIndex + 1)}`
      }`
    : undefined;
