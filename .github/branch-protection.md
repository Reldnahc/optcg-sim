# Branch Protection Baseline

Apply these settings to `main` and `master` once the repository is connected in GitHub.

## Pull Request Reviews

- Require a pull request before merging.
- Require review from Code Owners.
- Require at least one approval.
- Dismiss stale pull request approvals when new commits are pushed.
- Require conversation resolution before merge.

## Required Status Checks

Require the following checks before merge:

- `quality`
- `test`
- `contracts`
- `coverage`

These names must stay aligned with `.github/workflows/ci.yml`.

## Push Restrictions

- Do not allow direct pushes to protected branches.
- Allow force pushes only if there is an explicit emergency process outside normal development.

## Review Record

- Pull requests should link the approved story file.
- Pull requests should include `pnpm verify` evidence.
- Pull requests should complete AI review before human review is requested.
- Pull requests should complete a separate Codex CLI review invocation before human review is requested.
- The default review command is `codex.cmd exec review --base main` or the platform-equivalent Codex CLI review command.
- The review workflow should allow up to 60 minutes for the Codex CLI review step before it is treated as timed out.
- Implementation-agent self-review does not satisfy the Codex CLI review gate.
- Pull requests should post an AI review comment with findings and verdict.
- Pull requests should post a revision response comment that records follow-up commits and unresolved dispositions.
- Pull requests should record the Codex CLI review command or mode in the AI review comment before human approval.

GitHub branch protection does not enforce PR comment content directly. Until additional automation exists, reviewers and owners must reject review handoff when the AI review comment or revision response comment is missing.
