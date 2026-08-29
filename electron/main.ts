import { execFile, spawn } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { promisify } from "node:util"
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron"

app.disableHardwareAcceleration()
app.commandLine.appendSwitch("disable-gpu")
app.commandLine.appendSwitch("no-sandbox")

import { loadCommit, loadGraph } from "../shared/git"
import { cloneTo, loadWorkingTree, runGitOp, type GitOp } from "../shared/git-ops"
import {
  createOriginRepo,
  createPullRequest,
  listOriginRepos,
  listPullRequests,
  markPullRequestReady,
  mergePullRequest,
  originAuthLogin,
  originAuthLogout,
  originAuthStatus,
} from "../shared/origin"
import { assertSafeFullName, assertSafeRepoName } from "../shared/safety"

const execFileAsync = promisify(execFile)

function appRoot(): string {
  return process.cwd()
}

function findNode(): string {
  const portable = path.join(appRoot(), ".tools", "node", process.platform === "win32" ? "node.exe" : "node")
  return existsSync(portable) ? portable : "node"
}

function scheduleScript(script: string, extra: string[]): void {
  const child = spawn(findNode(), [path.join(appRoot(), "scripts", script), `--wait-ms=1600`, ...extra], {
    cwd: appRoot(),
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  })
  child.unref()
  setTimeout(() => app.quit(), 250)
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 720,
    backgroundColor: "#141414",
    title: "Origin Git Graph",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void window.loadFile(path.join(__dirname, "../dist/index.html"))
  }
}

app.whenReady().then(() => {
  ipcMain.handle("dialog:openFolder", async () => {
    const result = await dialog.showOpenDialog({
      title: "Choose a folder",
      properties: ["openDirectory", "createDirectory"],
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle("git:loadGraph", async (_event, repoPath: string) => loadGraph(repoPath))
  ipcMain.handle("git:loadCommit", async (_event, repoPath: string, hash: string) =>
    loadCommit(repoPath, hash),
  )
  ipcMain.handle("git:status", async (_event, repoPath: string) => loadWorkingTree(repoPath))
  ipcMain.handle("git:op", async (_event, repoPath: string, action: GitOp) => runGitOp(repoPath, action))

  ipcMain.handle("origin:list", async () => listOriginRepos())
  ipcMain.handle("origin:cloneTo", async (_event, fullName: string, parent: string, folder?: string) =>
    cloneTo(fullName, parent, folder),
  )
  ipcMain.handle("origin:create", async (_event, name: string, parent: string) => {
    const repoName = name.includes("/") ? assertSafeFullName(name) : assertSafeRepoName(name)
    const createdName = await createOriginRepo(repoName)
    return cloneTo(createdName, parent)
  })
  ipcMain.handle("origin:authStatus", async () => originAuthStatus())
  ipcMain.handle("origin:authLogin", async () => originAuthLogin())
  ipcMain.handle("origin:authLogout", async () => originAuthLogout())
  ipcMain.handle("pr:list", async (_event, repoPath: string, fullName?: string) =>
    listPullRequests(repoPath, fullName),
  )
  ipcMain.handle(
    "pr:create",
    async (
      _event,
      repoPath: string,
      input: { title: string; body?: string; draft?: boolean; base?: string; fullName?: string },
    ) => createPullRequest(repoPath, input),
  )
  ipcMain.handle("pr:ready", async (_event, repoPath: string, number: number, fullName?: string) =>
    markPullRequestReady(repoPath, number, fullName),
  )
  ipcMain.handle("pr:merge", async (_event, repoPath: string, number: number, fullName?: string) =>
    mergePullRequest(repoPath, number, fullName),
  )
  ipcMain.handle("demo:open", async () => {
    const script = path.join(app.getAppPath(), "scripts/seed-demo-repo.mjs")
    await execFileAsync(process.execPath, [script], { windowsHide: true })
    return path.join(process.cwd(), "demo-repo")
  })
  ipcMain.handle("shell:openPath", async (_event, target: string) => shell.openPath(target))
  ipcMain.handle("app:info", async () => ({
    version: app.getVersion(),
    root: appRoot(),
  }))
  ipcMain.handle("app:scheduleUpdate", async () => {
    scheduleScript("update-app.mjs", [])
    return "scheduled"
  })
  ipcMain.handle("app:scheduleUninstall", async (_event, wipe?: boolean) => {
    const extra = [`--user-data=${app.getPath("userData")}`]
    if (wipe) extra.push("--remove-app-dir", "--confirm=UNINSTALL")
    scheduleScript("uninstall-app.mjs", extra)
    return "scheduled"
  })

  createWindow()
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
