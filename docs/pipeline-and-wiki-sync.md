

# 🔄 FreeKiosk Pipeline and Wiki Sync

**How FreeKiosk publishes repository docs to GitHub Wiki automatically**

<p>
  <a href="README.md">📚 Docs Home</a> •
  <a href="../.github/workflows/wiki-sync.yml">📄 Workflow File</a>
</p>



> [!NOTE]
> Sync direction is one-way: repository `docs/` is the source of truth.

## 📂 Source of Truth



| 📋 Component | 📍 Location | 🎯 Purpose |
|---|---|---|
| **📚 Documentation Source** | `docs/` | Repository documentation files |
| **📖 Wiki Target** | `${repo}.wiki.git` | GitHub Wiki repository |
| **⚙️ Workflow File** | `.github/workflows/wiki-sync.yml` | Automation configuration |



## ⚙️ How It Works



| 📋 Step | 🎯 Action | 📋 Details |
|---|---|---|
| **1️⃣ Trigger** | Push to `main` or manual `workflow_dispatch` | Automatic or manual sync initiation |
| **2️⃣ Validate** | Check `docs/` exists | Ensure source documentation is present |
| **3️⃣ Verify** | Check GitHub Wiki is enabled | Confirm Wiki feature is active |
| **4️⃣ Clone** | Clone the wiki repository | Get target Wiki repository |
| **5️⃣ Sync** | `rsync --delete` from `docs/` to wiki | Synchronize files with deletion |
| **6️⃣ Landing Page** | Copy `README.md` to `Home.md` | Set Wiki landing page |
| **7️⃣ Commit** | Commit and push if changes exist | Only push when there are updates |



## 📋 Operational Notes



| ⚠️ Important Note | 📋 Details |
|---|---|
| **🔄 One-way Sync** | `docs/` → GitHub Wiki only |
| **🚫 No Manual Wiki Edits** | Manual Wiki changes will be overwritten |
| **📝 Edit Location** | Keep all documentation edits in `docs/` folder |



### 🔄 Sync Direction



```
Repository docs/  →  GitHub Wiki
     ↑                    ↓
  Source of Truth    Published Content
```



### 📝 Best Practices



| ✅ Practice | 🎯 Reason |
|---|---|
| **📝 Edit in docs/** | Maintain single source of truth |
| **🔄 Test locally** | Verify changes before pushing |
| **📋 Use proper formatting** | Ensure Wiki compatibility |
| **🔗 Update links** | Keep internal links working |



## 🚨 Recovery Checklist

If the workflow fails, follow these troubleshooting steps:



| 🔍 Issue | ✅ Solution | 🔧 Command/Action |
|---|---|---|
| **📖 Wiki Disabled** | Enable Wiki feature | Repository Settings → Features → Wikis |
| **🔐 Permission Issues** | Check workflow permissions | Ensure `contents: write` permission |
| **📁 Missing README** | Verify source files exist | Check `docs/README.md` exists |
| **⚙️ Workflow Failure** | Re-run manually | Actions tab → Re-run workflow |



### 🔧 Common Issues and Solutions



#### 📖 Wiki Not Enabled
1. Go to repository **Settings**
2. Scroll to **Features** section
3. Enable **Wikis** feature
4. Save and re-run workflow

#### 🔐 Permission Denied
1. Go to **Settings** → **Actions** → **General**
2. Under **Workflow permissions**, select **Read and write permissions**
3. Allow **GitHub Actions to create and approve pull requests**
4. Save and re-run workflow

#### 📁 Missing Documentation
1. Verify `docs/` folder exists in repository
2. Ensure `docs/README.md` is present
3. Add missing files if needed
4. Commit and push changes

#### ⚙️ Workflow Stuck
1. Go to **Actions** tab
2. Select the failed workflow run
3. Click **Re-run jobs** → **Re-run failed jobs**
4. Monitor for successful completion




## 🔧 Technical Details

### 📄 Workflow Configuration



| ⚙️ Component | 📋 Configuration | 🎯 Purpose |
|---|---|---|
| **🔄 Triggers** | `push: [main]`, `workflow_dispatch` | Automatic and manual sync |
| **🔐 Permissions** | `contents: write` | Wiki repository access |
| **🖥️ Runner** | `ubuntu-latest` | Execution environment |
| **📂 Steps** | Clone, sync, copy, commit | Sync process |



### 🔄 Sync Process



```bash
# Simplified sync process
git clone https://github.com/user/repo.wiki.git
rsync --delete docs/ wiki/
cp docs/README.md wiki/Home.md
cd wiki
git add .
git commit -m "Sync documentation from main branch"
git push
```



### 📋 File Mapping



| 📂 Source | 📂 Target | 🎯 Purpose |
|---|---|---|
| **docs/README.md** | **Home.md** | Wiki landing page |
| **docs/*.md** | **/*.md** | All documentation pages |
| **docs/assets/** | **assets/** | Images and resources |




## 🔗 Related Resources



| 📚 Resource | 🔗 Link | 🎯 Purpose |
|---|---|---|
| **📄 Workflow File** | [wiki-sync.yml](../.github/workflows/wiki-sync.yml) | Automation configuration |
| **📖 GitHub Wiki Docs** | [GitHub Wiki Documentation](https://docs.github.com/en/wikis) | Official Wiki guide |
| **⚙️ GitHub Actions** | [Actions Documentation](https://docs.github.com/en/actions) | Workflow automation |
| **📚 Documentation Guide** | [README.md](README.md) | Documentation overview |






**Made with ❤️ by [FreeKiosk Team](https://freekiosk.app)**


