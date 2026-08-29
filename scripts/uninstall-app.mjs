import { spawn } from "node:child_process"
import { existsSync, rmSync } from "node:fs"
import path from "node:path"

import { log, removeShortcuts, root } from "./app-lifecycle.mjs"

const argv = process.argv.slice(2)
const waitMs = Number((argv.find((item) => item.startsWith("--wait-ms=")) ?? "").split("=")[1] || 0)
const userData = (argv.find((item) => item.startsWith("--user-data=")) ?? "").slice("--user-data=".length)
const wipe = argv.includes("--remove-app-dir")
const typed = (argv.find((item) => item.startsWith("--confirm=")) ?? "").slice("--confirm=".length)

function sleep(ms) {
  if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function removeDir(target) {
  if (!target || !existsSync(target)) return
  const resolved = path.resolve(target)
  if (resolved === path.parse(resolved).root) {
    throw new Error("Refusing to delete a drive root.")
  }
  rmSync(resolved, { recursive: true, force: true })
  log(`已刪：${resolved}`)
}

sleep(Number.isFinite(waitMs) ? waitMs : 0)

log("正在卸載 Origin Git Graph 捷徑同安裝檔…")
removeShortcuts()

for (const dir of [
  path.join(root, "node_modules"),
  path.join(root, "dist"),
  path.join(root, "dist-electron"),
  path.join(root, "release"),
  path.join(root, ".tools"),
  path.join(root, "demo-repo"),
]) {
  removeDir(dir)
}
if (userData) removeDir(userData)

if (wipe) {
  if (typed !== "UNINSTALL") {
    throw new Error("徹底刪除 app 資料夾要 --confirm=UNINSTALL。")
  }
  log("會喺程序退出後刪除整個 app 資料夾。")
  if (process.platform === "win32") {
    spawn("cmd.exe", ["/c", `timeout /t 2 /nobreak >nul & rmdir /s /q "${root}"`], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref()
  } else {
    spawn("sh", ["-c", `sleep 2; rm -rf ${JSON.stringify(root)}`], {
      detached: true,
      stdio: "ignore",
    }).unref()
  }
} else {
  log("已卸載捷徑、依賴同組裝檔。原始碼仲喺度，之後可再撳 Install-and-Open。")
  log("若要連資料夾都刪：node scripts/uninstall-app.mjs --remove-app-dir --confirm=UNINSTALL")
}
