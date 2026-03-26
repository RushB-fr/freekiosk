# Wiki Sync

**How documentation is published to GitHub Wiki**

[Docs Home](README)


> [!WARNING]
> The `docs/` folder is the source of truth. Manual wiki edits will be overwritten.

## Overview

FreeKiosk uses GitHub Actions to automatically publish documentation from the repository to GitHub Wiki.

### Components

| Component | Location | Purpose |
|-----------|----------|----------|
| **Source** | `docs/` folder | Documentation files |
| **Target** | GitHub Wiki | Published documentation |
| **Workflow** | `.github/workflows/docs-to-wiki-sync.yml` | Automation |

### How It Works

1. **Trigger** - Push to `main` branch or manual workflow dispatch
2. **Clone** - Clone the wiki repository
3. **Sync** - Copy files from `docs/` to wiki (with `rsync --delete`)
4. **Landing Page** - Copy `README.md` to `Home.md`
5. **Commit** - Push changes to wiki

### Sync Direction

```
Repository docs/  →  GitHub Wiki
     ↑                    ↓
  Source of Truth    Published Content
```

> [!WARNING]
> This is a one-way sync. Manual wiki edits will be overwritten on next sync.


## Best Practices

- **Edit in `docs/`** - Never edit wiki directly
- **Test locally** - Preview changes before pushing
- **Proper formatting** - Use GitHub-flavored Markdown
- **Update links** - Use relative links between docs

## Troubleshooting

### Common Issues

**Wiki not enabled:**
1. Go to repository Settings
2. Enable Wikis under Features
3. Re-run workflow

**Permission denied:**
1. Settings → Actions → General
2. Set "Read and write permissions"
3. Re-run workflow

**Missing files:**
1. Verify `docs/` folder exists
2. Ensure `docs/README.md` is present
3. Commit and push

**Workflow stuck:**
1. Go to Actions tab
2. Re-run failed jobs


## Technical Details

### Workflow Configuration

- **Triggers:** Push to `main` or manual dispatch
- **Permissions:** `contents: write`
- **Runner:** `ubuntu-latest`

### Sync Process

```bash
git clone https://github.com/user/repo.wiki.git
rsync --delete docs/ wiki/
cp docs/README.md wiki/Home.md
cd wiki && git add . && git commit -m "Sync docs" && git push
```

### File Mapping

| Source | Target | Purpose |
|--------|--------|----------|
| `docs/README.md` | `Home.md` | Wiki landing page |
| `docs/*.md` | `*.md` | Documentation pages |
| `docs/screenshots/` | `screenshots/` | Images |


## Resources

- **Workflow:** [`.github/workflows/docs-to-wiki-sync.yml`](https://github.com/rushb-fr/freekiosk/blob/main/.github/workflows/docs-to-wiki-sync.yml)
- **GitHub Wiki Docs:** [docs.github.com/en/wikis](https://docs.github.com/en/wikis)
- **GitHub Actions:** [docs.github.com/en/actions](https://docs.github.com/en/actions)
