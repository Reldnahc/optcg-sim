export type ParserRuleClause = {
  readonly parserRuleId: string;
  readonly parserRuleIds?: readonly string[];
};

export function getCompleteParserRuleIds(
  clauses: readonly ParserRuleClause[],
): readonly string[] {
  const ruleIds = clauses.flatMap(getClauseParserRuleIds);
  return clauses.length > 1
    ? [...ruleIds, "line-separated-effect-blocks:v1"]
    : ruleIds;
}

export function getClauseParserRuleIds(
  clause: ParserRuleClause,
): readonly string[] {
  return clause.parserRuleIds ?? [clause.parserRuleId];
}
