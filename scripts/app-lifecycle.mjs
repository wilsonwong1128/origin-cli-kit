import { execFileSync, execSync, spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export function log(message) {
  console.log(message)
}

export function npmCli() {
  return [
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(root, ".tools", "node", "node_modules", "npm", "bin", "npm-cli.js"),
  ].find((file) => existsSync(file))
}

export function runNpm(args) {
  const cli = npmCli()
  if (cli) {
    execFileSync(process.execPath, [cli, ...args], {
      cwd: root,
      stdio: "inherit",
      env: process.env,
    })
    return
  }
  execSync(["npm", ...args].join(" "), {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  })
}

export function electronBinary() {
  return path.join(
    root,
    "node_modules",
    "electron",
    "dist",
    process.platform === "win32" ? "electron.exe" : "electron",
  )
}

export function ready() {
  return (
    existsSync(path.join(root, "dist", "index.html")) &&
    existsSync(path.join(root, "dist-electron", "main.js")) &&
    existsSync(electronBinary())
  )
}

export function installApp() {
  if (!existsSync(path.join(root, "node_modules", "electron"))) {
    log("正在安裝 Origin Git Graph…")
    runNpm(["install"])
  }
  if (!ready()) {
    log("正在組裝 app…")
    runNpm(["run", "build"])
  }
  if (!ready()) {
    throw new Error("組裝失敗：找不到 Electron 或打包檔。")
  }
}

export function shortcutPaths() {
  const desktop = path.join(os.homedir(), "Desktop")
  const startMenu = path.join(
    process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
  )
  return {
    desktop,
    startMenu,
    windows: [
      path.join(desktop, "Origin Git Graph.lnk"),
      path.join(startMenu, "Origin Git Graph.lnk"),
    ],
    linux: path.join(desktop, "Origin Git Graph.desktop"),
  }
}

export function createShortcuts() {
  try {
    if (process.platform === "win32") {
      const { desktop, startMenu, windows } = shortcutPaths()
      mkdirSync(desktop, { recursive: true })
      mkdirSync(startMenu, { recursive: true })
      const electron = electronBinary()
      const ps = `
$electron = ${JSON.stringify(electron)}
$workdir = ${JSON.stringify(root)}
$icon = $electron + ",0"
foreach ($path in @(${windows.map((item) => JSON.stringify(item)).join(", ")})) {
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($path)
  $shortcut.TargetPath = $electron
  $shortcut.Arguments = "."
  $shortcut.WorkingDirectory = $workdir
  $shortcut.WindowStyle = 1
  $shortcut.Description = "Origin Git Graph"
  $shortcut.IconLocation = $icon
  $shortcut.Save()
}
`
      execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], {
        cwd: root,
        stdio: "ignore",
        windowsHide: true,
      })
      log("已加桌面同開始功能表捷徑：Origin Git Graph")
      return
    }
    if (process.platform === "linux") {
      const file = shortcutPaths().linux
      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(
        file,
        `[Desktop Entry]
Type=Application
Name=Origin Git Graph
Comment=Git Graph for Cursor Origin
Exec=${electronBinary().replace(/ /g, "\\ ")} .
Path=${root}
Icon=${path.join(root, "media", "icon.svg")}
Terminal=false
Categories=Development;
`,
      )
      try {
        execFileSync("chmod", ["+x", file], { stdio: "ignore" })
      } catch {
        /* ignore */
      }
      log("已加桌面捷徑：Origin Git Graph")
    }
  } catch (error) {
    log(`捷徑未整到（app 仍然會開）：${error instanceof Error ? error.message : error}`)
  }
}

export function removeShortcuts() {
  const paths = shortcutPaths()
  for (const file of [...paths.windows, paths.linux]) {
    if (existsSync(file)) rmSync(file, { force: true })
  }
}

export function launch() {
  const args = ["."]
  if (process.platform === "linux" || process.env.ELECTRON_DISABLE_SANDBOX) {
    args.push("--no-sandbox")
  }
  log("正在開啟 Origin Git Graph…")
  const child = spawn(electronBinary(), args, {
    cwd: root,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      ELECTRON_DISABLE_SANDBOX: process.platform === "linux" ? "1" : process.env.ELECTRON_DISABLE_SANDBOX,
    },
  })
  child.unref()
}

export function resolveNode() {
  const portable = path.join(root, ".tools", "node", process.platform === "win32" ? "node.exe" : "node")
  if (existsSync(portable)) return portable
  if (!process.versions.electron) return process.execPath
  const which = process.platform === "win32" ? "where" : "which"
  const found = spawnSync(which, ["node"], { encoding: "utf8", windowsHide: true })
  const line = (found.stdout || "").split(/\r?\n/).map((item) => item.trim()).find(Boolean)
  if (line && existsSync(line)) return line
  throw new Error("找不到 node。請先用 Install-and-Open 安裝，或把 Node 加進 PATH。")
}

export function runGit(args) {
  const { stdout } = execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
  })
  return stdout.trim()
}
