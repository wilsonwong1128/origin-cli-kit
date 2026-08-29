import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"

const root = path.join(process.cwd(), "demo-repo")
const gitDir = path.join(root, ".git")

if (existsSync(gitDir)) {
  process.exit(0)
}

mkdirSync(root, { recursive: true })

function git(...args) {
  return execFileSync("git", ["-C", root, ...args], {
    stdio: "pipe",
    windowsHide: true,
  }).toString()
}

function write(file, contents) {
  const full = path.join(root, file)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, contents)
}

function commit(message, date) {
  git("-c", "user.name=Wilson", "-c", "user.email=wilson@local", "commit", "-m", message, "--date", date)
}

git("init", "-b", "main")
git("config", "user.name", "Wilson")
git("config", "user.email", "wilson@local")

write(
  "README.md",
  "# Harbor Notes\n\n本機筆記 app 的示範倉庫，用來展示 Git Graph。\n",
)
git("add", "README.md")
commit("chore: 建立 Harbor Notes 專案", "2026-03-02T09:10:00")

write(
  "src/app.js",
  `export function boot() {
  console.log("Harbor Notes")
}
`,
)
git("add", "src/app.js")
commit("feat: 加入應用程式進入點", "2026-03-02T11:40:00")

write(
  "src/notes.js",
  `export function listNotes() {
  return []
}
`,
)
git("add", "src/notes.js")
commit("feat: 加入空白筆記清單", "2026-03-04T14:05:00")

git("checkout", "-b", "feature/auth")
write(
  "src/auth.js",
  `export function signIn(email) {
  return { email, token: "demo" }
}
`,
)
git("add", "src/auth.js")
commit("feat: 加入本機登入流程", "2026-03-06T10:20:00")

write(
  "src/session.js",
  `export function restoreSession() {
  return null
}
`,
)
git("add", "src/session.js")
commit("feat: 記住上次登入狀態", "2026-03-07T16:45:00")

git("checkout", "main")
write(
  "src/settings.js",
  `export const settings = {
  theme: "dark",
  language: "zh-Hant",
}
`,
)
git("add", "src/settings.js")
commit("feat: 加入深色主題設定", "2026-03-08T09:30:00")

git("merge", "--no-ff", "--no-edit", "feature/auth", "-m", "merge: 合併登入功能到 main")

git("checkout", "-b", "hotfix/empty-list")
write(
  "src/notes.js",
  `export function listNotes() {
  return [{ id: "welcome", title: "歡迎使用 Harbor Notes" }]
}
`,
)
git("add", "src/notes.js")
commit("fix: 空白清單唔好再當錯誤", "2026-03-10T08:15:00")

git("checkout", "main")
git("merge", "--no-ff", "--no-edit", "hotfix/empty-list", "-m", "merge: 修補空白清單崩潰")
git("tag", "-a", "v1.0.0", "-m", "第一個可用版本")

git("checkout", "-b", "feature/graph-ui")
write(
  "src/graph.js",
  `export function drawGraph(commits) {
  return commits.map((commit) => commit.hash)
}
`,
)
git("add", "src/graph.js")
commit("feat: 開始畫 commit graph", "2026-03-14T13:00:00")

write(
  "src/graph.js",
  `const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#a855f7"]

export function drawGraph(commits) {
  return commits.map((commit, index) => ({
    hash: commit.hash,
    color: COLORS[index % COLORS.length],
  }))
}
`,
)
git("add", "src/graph.js")
commit("feat: 為分支加上顏色", "2026-03-15T18:22:00")

git("checkout", "main")
write("README.md", "# Harbor Notes\n\n本機筆記 app。而家支援登入、設定同 commit graph 預覽。\n")
git("add", "README.md")
commit("docs: 更新功能說明", "2026-03-16T10:05:00")

git("merge", "--no-ff", "--no-edit", "feature/graph-ui", "-m", "merge: 合併 Git Graph 介面")
git("tag", "-a", "v1.1.0", "-m", "加入 graph 預覽")

console.log(`Seeded demo repo at ${root}`)
