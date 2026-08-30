# Origin Git Graph

Public source: https://github.com/wilsonwong1128/origin-cli-kit

Windows / Linux desktop app：本機視窗睜 Git commit graph，並接 Cursor Origin。

唔係瀏覽器網站，亦唔係 Cursor extension。

## 撞一下就裝同開

clone 完之後撞呢個檔：

- Windows：`Install-and-Open.bat`
- WSL / Linux：`./install-and-open.sh`

第一次會裝依賴、組裝 app、加桌面捷徑，然後開啟 Origin Git Graph。
之後撞桌面 **Origin Git Graph** 就直接開。

## 之後點更新

只用 fast-forward，唔會自動 merge。App 資料夾有本地改動就會拒絕（避免覆蓋）。

- Windows：`Update.bat`
- WSL / Linux：`./update.sh`
- App 入面：**設定 → 更新 app**（會關視窗、更新、再重開）

```bash
git pull --ff-only
npm install
npm run build
```

用 `Setup.exe` 裝嘅話，下載新嘅 `OriginGitGraph-Setup-*.exe` 再撞一次就會覆蓋安裝。

## 點卸載

兩級，先清安裝檔，唔會默默刪走你其他 Git 倉庫。

1. **一般卸載**（留低原始碼，之後可以再裝）
   - Windows：`Uninstall.bat`
   - WSL / Linux：`./uninstall.sh`
   - App：**設定 → 卸載**
   - 會刪：桌面／開始功能表捷徑、`node_modules`、`dist`、便攜 Node、Electron userData
2. **徹底刪除呢個 app 資料夾**
   - Windows：`Uninstall-Wipe.bat` — type `UNINSTALL`
   - `./uninstall.sh --wipe`
   - App：**設定 → 徹底刪除**（輸入 `UNINSTALL`）

用 Setup.exe 裝嘅，亦可以喺 Windows **設定 → 應用程式** 卸載。

如果未有 Node，Windows 會自動下載便攜版，唔會改你系統。
想自己裝可以用 [Node.js 20+](https://nodejs.org/) 同 [Git for Windows](https://git-scm.com/download/win)。

## 功能

- Commit graph：色線連住 branch / merge
- 快速換 repo
- 開新 Origin project
- Pull requests：開 PR、Mark ready、Merge
- 示範倉庫

Windows 路徑 `C:\Users\...` 喺 WSL 會轉成 `/mnt/c/...`。

Origin CLI 只支援 macOS / Linux / WSL：

```bash
curl -fsSL https://downloads.cursor.com/origin/install.sh | sh
origin auth login
```

## 手動指令

```bash
npm install
npm start
npm run open
```

## Tests

Early beta. The test API and npm scripts can change without notice. Software is provided **AS IS**, with no warranty.

```bash
npm test          # unit + UI (mocked; never hits live Origin)
npm run test:unit
npm run test:ui
npm run test:e2e         # real Electron window (Linux). Does not prove Windows native Origin CLI.
npm run test:e2e:mocked  # Vite renderer + mocked IPC only
npm run test:live # skipped unless Origin CLI is already signed in and a namespace is already claimed
```

Live tests only create disposable `ogg-test-*` repos (Internal/Private) and always `origin repo delete owner/name -y` in `finally`. They never run `create-mirrored` and never touch other Wilson repos.


## 打包安裝程式

```powershell
npm run dist
```

`release/` 入面：

- `OriginGitGraph-Setup-0.1.0.exe`：撞一下安裝，裝完自動開
- `OriginGitGraph-0.1.0-portable.exe`：撞就開
