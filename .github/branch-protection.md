# Branch Protection Baseline

Protect the default branch (`main`) once the repository is connected in GitHub.
Keep `master` protected only for legacy mirrors that still publish `master`.

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
- `hidden-info`
- `tooling`
- `contracts`
- `coverage`

These names must stay aligned with `.github/workflows/ci.yml`.

## Push Restrictions

- Do not allow direct pushes to protected branches.
- Allow force pushes only through an explicit emergency process outside normal
  development.
- Ordinary protected-branch changes require pull requests, Code Owner review, at
  least one approval, conversation resolution, and required status checks.

## Review Record

Pull requests should include:

- a concise summary of the change
- relevant spec citations when behavior or architecture is affected
- exact tests and verification commands run
- skipped commands and reasons
- assumptions, risks, and follow-up work that remains

Reviewers should reject patches that violate package boundaries, hidden-info
safety, deterministic engine behavior, strict TypeScript, or the repo's testing
standards.
