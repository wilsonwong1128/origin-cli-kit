import { existsSync } from "node:fs"
import path from "node:path"

import { createShortcuts, launch, log, ready, root, runGit, runNpm } from "./app-lifecycle.mjs"

const args = new Set(process.argv.slice(2))
const waitMs = Number((process.argv.find((item) => item.startsWith("--wait-ms=")) ?? "").split("=")[1] || 0)
const relaunch = !args.has("--no-launch")

function sleep(ms) {
  if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

sleep(Number.isFinite(waitMs) ? waitMs : 0)

if (!existsSync(path.join(root, ".git"))) {
  throw new Error("呢個資料夾唔係 git clone，冇得自動更新。請重新下載 / clone 最新版，再撲 Install-and-Open。")
}

const dirty = runGit(["status", "--porcelain"])
if (dirty) {
  throw new Error("App 資料夾有未提交改動，拒絕覆蓋（SIL2）。請先 stash/commit，或用乾淨 clone。")
}

const before = runGit(["rev-parse", "--short", "HEAD"])
log(`而家版本：${before}`)
log("正在 fast-forward 更新（唔會 merge / rebase）…")
runGit(["fetch", "origin"])
try {
  runGit(["pull", "--ff-only"])
} catch (error) {
  throw new Error(`更新失敗（只用 fast-forward）：${error instanceof Error ? error.message : error}`)
}
const after = runGit(["rev-parse", "--short", "HEAD"])
log(`更新後：${after}`)

log("正在安裝依賴同重新組裝…")
runNpm(["install"])
runNpm(["run", "build"])
if (!ready()) {
  throw new Error("更新後組裝失敗。")
}
createShortcuts()
log(before === after ? "已係最新。" : `已由 ${before} 更新到 ${after}。`)
if (relaunch) launch()
