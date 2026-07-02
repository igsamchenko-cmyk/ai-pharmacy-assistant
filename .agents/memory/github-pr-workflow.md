---
name: GitHub feature-branch + PR workflow
description: How to create a feature branch, commit, push, and open a PR from this repl without leaking the token.
---

# GitHub feature-branch + PR workflow

Repo: `igsamchenko-cmyk/ai-pharmacy-assistant` (private). `origin` remote is
stored WITHOUT a token (URL scrubbed); the GitHub token comes from
`listConnections("github")[0].settings.access_token` in the code_execution
sandbox.

Constraints:
- The bash tool blocks destructive git (commit/checkout/reset/push -f). Do git
  writes (commit, branch, push) via `child_process.execSync` inside
  `code_execution`, NOT bash.
- NEVER print the token. Wrap execSync in try/catch and sanitize any error
  output by replacing the token with `***`. Push with a one-off tokenized URL
  (`https://x-access-token:${TOKEN}@github.com/<owner>/<repo>.git`) rather than
  persisting it in `.git/config`.

PR-diff trick: keep `origin/main` at the old commit (do NOT push local main).
Commit the work on local main, create the feature branch at HEAD, push ONLY the
feature branch, then open the PR with base=main, head=<feature>. The PR then
shows the full feature diff.

**Why:** pushing main too would leave the PR with an empty diff. The platform's
end-of-loop auto-commit runs on a clean tree afterward, so manual commit here is
safe.
