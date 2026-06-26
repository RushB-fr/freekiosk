# Issue Triage & Fix Workflow

When asked to do a pass on GitHub issues, follow this process:

## Label system
- `bug` only — untriaged, needs investigation
- `fixed: next release` — fix committed on main, not yet released
- `pending: user feedback` — fix released, waiting for reporter to confirm
- `backlog` — acknowledged, not prioritized
- `in progress` — actively being worked on

## Triage flow for `bug`-only issues
1. Read the issue carefully: version, Device Owner status, steps to reproduce
2. Check if the reported version is old — the fix may already be in a newer release
3. Investigate the code if the report has enough detail
4. Assign the right label and act:
   - Clear regression with identifiable cause → investigate + fix
   - Likely fixed in a newer version → `pending: user feedback`, comment asking to test latest release
   - Not enough info to reproduce → `pending: user feedback`, comment asking for more details
   - Out of scope / fundamental Android limitation → `backlog`

## After fixing
- Update `CHANGELOG.md` under `## [Unreleased]` with the fix entry (emoji + bold title + issue ref + explanation)
- Add `fixed: next release` label to the issue (do NOT close it)
- Do NOT add `pending: user feedback` until the fix is actually released

## Issues already labeled `fixed: next release` after a release
When a new version ships, issues labeled `fixed: next release` must be:
1. Relabeled to `pending: user feedback`
2. Commented with: `This has been fixed in vX.Y.Z, please update and let us know if the issue is resolved for you.`

## Commit style
One commit per logical group of fixes. Message format: `Fix <short description> (#issue1, #issue2, ...)`
