## Equivalent Human Review Fallback

- Story ID:
- Story file:
- Parent-agent orchestration note:
- Worker subagent reference(s):
- Parent/orchestrator model: `gpt-5.5`
- Implementation worker model and reasoning: `<gpt-5.3-codex medium | gpt-5.5 medium>`
- Reviewer model and reasoning: `gpt-5.4 high`
- Model-routing deviations:
- Failed or unavailable reviewer-subagent attempts:
- Why no usable reviewer-subagent run remained:
- Fallback human reviewer:
- Review scope:
- Findings:
- Verdict:
- Blocking issues or follow-up before human review:
- Human merge-gate review record (approval link or equivalent human review step reference):
- Cleanup metadata source reviewed before fallback approval: <yes, exact cleanup metadata block matched story scope>

Use this comment when no usable reviewer-subagent run remains after the available reviewer-subagent surfaces were found unavailable, timed out, or failed. Record the attempted reviewer-subagent surfaces and failure modes, confirm that implementation-worker self-review and parent-coordinator self-review did not serve as the AI review gate, then document the equivalent human review that satisfied the fallback before broader human review is requested.
