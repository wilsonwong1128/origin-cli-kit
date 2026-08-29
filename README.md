# Origin Git Graph

Windows / Linux desktop app：本機視窗睜 Git commit graph，並接 Cursor Origin。

唔係瀏覽器網站，亦唔係 Cursor extension。

Public repo: https://github.com/wilsonwong1128/origin-cli-kit

## One-click install and open

After clone, click:

- Windows: `Install-and-Open.bat`
- WSL / Linux: `./install-and-open.sh`

First run installs dependencies, builds the app, adds a desktop shortcut, then opens Origin Git Graph.
Later, click the **Origin Git Graph** desktop shortcut.

## Update

Fast-forward only. Aborts if this app folder has local changes.

- Windows: `Update.bat`
- WSL / Linux: `./update.sh`
- In the app: **Settings → Update app**

```bash
git pull --ff-only
npm install
npm run build
```

If you installed with `Setup.exe`, run the newer `OriginGitGraph-Setup-*.exe`.

## Uninstall

Does not delete your other Git repos.

1. Normal uninstall (keeps source so you can install again)
   - Windows: `Uninstall.bat`
   - WSL / Linux: `./uninstall.sh`
   - App: **Settings → Uninstall**
   - Removes shortcuts, `node_modules`, `dist`, portable Node, Electron userData
2. Delete this app folder
   - Windows: `Uninstall-Wipe.bat` — type `UNINSTALL`
   - `./uninstall.sh --wipe`
   - App: **Settings → Delete everything** (type `UNINSTALL`)

Setup.exe installs can also be removed from Windows **Settings → Apps**.

If Node is missing, Windows downloads a portable copy without changing your system.
Or install [Node.js 20+](https://nodejs.org/) and [Git for Windows](https://git-scm.com/download/win).

## Features

- Commit graph with connected branch / merge lines
- Switch repos quickly
- Create a new Origin project
- Pull requests: create, mark ready, merge
- Demo repository

Windows paths `C:\Users\...` become `/mnt/c/...` under WSL.

Origin CLI is macOS / Linux / WSL only:

```bash
curl -fsSL https://downloads.cursor.com/origin/install.sh | sh
origin auth login
```

## Commands

```bash
npm install
npm start
npm run open
```

## Packaged installer

```powershell
npm run dist
```

In `release/`:

- `OriginGitGraph-Setup-0.1.0.exe`: one-click install, then opens
- `OriginGitGraph-0.1.0-portable.exe`: click to open
