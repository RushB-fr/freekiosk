# Issue Triage & Fix Workflow

Maintainer notes. This is how issues are triaged and how a fix travels from a
report to a released version. Contributors do not need to read this: see
[CONTRIBUTING.md](../CONTRIBUTING.md).

## Label system

The full set in use, in the order an issue normally moves through it:

- `bug` only: untriaged, needs investigation
- `in progress`: actively being worked on
- `fixed: next release`: fix committed on main, not yet released
- `fix released`: the release carrying the fix is published
- `pending: user feedback`: waiting on the reporter, either to confirm a fix or
  to supply missing details
- `still broken`: the reporter confirmed the fix did not work. Treat as a fresh
  `bug`, the previous diagnosis was wrong
- `backlog`: acknowledged, not prioritized

## Triage flow for `bug`-only issues

1. Read the issue carefully: version, Device Owner status, steps to reproduce.
2. Check whether the reported version is old. The fix may already be released.
3. Investigate the code when the report has enough detail.
4. Assign the right label and act:
   - Clear regression with an identifiable cause: investigate and fix
   - Likely fixed in a newer version: `pending: user feedback`, comment asking
     the reporter to test the latest release
   - Not enough information to reproduce: `pending: user feedback`, comment
     asking for the missing details
   - Out of scope, or a fundamental Android limitation: `backlog`, and say
     plainly in the comment why it cannot be solved rather than leaving it silent

## After fixing

- Add the entry to `CHANGELOG.md` under an `## [Unreleased]` heading at the
  **top** of the file, creating that heading if it is not there. It is folded
  into the version heading when the release is cut, so it must never be left
  sitting below a published version.
- Format: emoji, bold title, issue reference, then an explanation that states the
  root cause, not only the symptom. Say what was measured and what was not.
- Label the issue `fixed: next release`. **Do not close it.**
- Do not use `pending: user feedback` yet: the fix is not released.

## When a release ships

Every issue labeled `fixed: next release` must be:

1. Relabeled `fix released`, then `pending: user feedback` once the reporter has
   been asked to confirm.
2. Commented with: `This has been fixed in vX.Y.Z, please update and let us know
   if the issue is resolved for you.`

If the reporter comes back saying it still fails, apply `still broken` rather
than defending the previous fix: the earlier diagnosis was wrong and the issue
needs a fresh investigation.

## Commit style

One commit per logical group of fixes. The title describes **what the change
does**, in the imperative, with the issue reference at the end when there is one:

```
Release screen pinning if JS never starts (#238)
Leave the dashboard grid when a remote URL arrives (#231)
Make the boot watchdog a bounded last resort (#222 follow-up)
```

Not `Fix bug #238`. The title should still make sense to someone reading
`git log` two years from now with no access to the issue tracker.
