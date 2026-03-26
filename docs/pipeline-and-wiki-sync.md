<div align="center">

# 🔄 Pipeline and Wiki Sync

_How FreeKiosk publishes repository docs to GitHub Wiki automatically._

<p>
  <a href="README.md">Docs Home</a> •
  <a href="../.github/workflows/wiki-sync.yml">Workflow File</a>
</p>

</div>

> [!NOTE]
> Sync direction is one-way: repository `docs/` is the source of truth.

## Source of Truth

- Repository documentation source: `docs/`
- Wiki publication target: `${repo}.wiki.git`
- Workflow file: `.github/workflows/wiki-sync.yml`

## How It Works

1. Trigger on `push` to `main` or manual `workflow_dispatch`.
2. Validate that `docs/` exists.
3. Validate that GitHub Wiki is enabled for the repository.
4. Clone the wiki repository.
5. Sync `docs/` into the wiki repository with `rsync --delete`.
6. Copy `README.md` to `Home.md` for GitHub Wiki landing page compatibility.
7. Commit and push only if there are changes.

## Operational Notes

- The sync is one-way: `docs/` -> GitHub Wiki.
- Any manual edits done directly in GitHub Wiki will be overwritten by the next sync.
- Keep all documentation edits in this repository under `docs/`.

## Recovery Checklist

If the workflow fails:

- Ensure Wiki is enabled: repository Settings -> Features -> Wikis.
- Ensure the workflow has `contents: write` permission.
- Ensure `docs/README.md` exists.
- Re-run the workflow manually from the Actions tab.
