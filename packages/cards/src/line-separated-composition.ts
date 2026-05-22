import type { EffectBlock } from "@optcg/types";
import { isExternalDeckConstructionRuleParserRuleId } from "./external-deck-construction-rule.js";

interface LineSeparatedClause {
  effectBlock?: EffectBlock;
  parserRuleId: string;
}

const triggerRankByType: Readonly<Record<string, number>> = {
  onKO: 3,
  onPlay: 1,
  permanent: 0,
  trigger: 4,
  whenAttacking: 2,
};

export function isCertifiedLineSeparatedEffectBlockComposition(
  clauses: readonly LineSeparatedClause[],
): boolean {
  if (clauses.length !== 2) {
    return false;
  }

  const runtimeClauses = clauses.filter(
    (clause): clause is LineSeparatedClause & { effectBlock: EffectBlock } =>
      clause.effectBlock !== undefined,
  );
  if (runtimeClauses.length === 1) {
    const nonRuntimeClause = clauses.find(
      (clause) => clause.effectBlock === undefined,
    );
    const onlyRuntimeBlock = runtimeClauses[0]?.effectBlock;
    return (
      nonRuntimeClause !== undefined &&
      isExternalDeckConstructionRuleParserRuleId(
        nonRuntimeClause.parserRuleId,
      ) &&
      onlyRuntimeBlock !== undefined &&
      triggerRankByType[onlyRuntimeBlock.trigger.type] !== undefined
    );
  }
  if (runtimeClauses.length !== 2) {
    return false;
  }

  const triggerRanks = runtimeClauses.map(
    (clause) => triggerRankByType[clause.effectBlock.trigger.type],
  );

  return (
    triggerRanks[0] !== undefined &&
    triggerRanks[1] !== undefined &&
    triggerRanks[0] < triggerRanks[1]
  );
}
