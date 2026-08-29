import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { stat } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"

import { laneCount, layoutGraph } from "./graph-layout"
import type { CommitDetail, FileChange, GitCommit, GitRef, GraphPayload, OriginRemote, RepoInfo } from "./types"

const execFileAsync = promisify(execFile)

export async function runGit(repo: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", repo, ...args], {
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    })
    return stdout
  } catch (error) {
    const err = error as { stderr?: string; message?: string }
    throw new Error((err.stderr || err.message || "git 指令失敗").trim())
  }
}

export function normalizeUserPath(input: string): string {
  const trimmed = input.trim().replace(/^["']|["']$/g, "")
  const expanded = trimmed.startsWith("~") ? path.join(homedir(), trimmed.slice(1)) : trimmed
  const drive = /^([A-Za-z]):[\\/](.*)$/.exec(expanded)
  if (drive && process.platform !== "win32") {
    return path.normalize(`/mnt/${drive[1].toLowerCase()}/${drive[2].replace(/\\/g, "/")}`)
  }
  return path.normalize(expanded)
}

export async function resolveRepo(input: string): Promise<string> {
  const repo = normalizeUserPath(input)
  const info = await stat(repo).catch(() => null)
  if (!info?.isDirectory()) {
    throw new Error(`找不到資料夾：${repo}`)
  }
  const gitDir = path.join(repo, ".git")
  if (!existsSync(gitDir)) {
    try {
      return (await runGit(repo, ["rev-parse", "--show-toplevel"])).trim()
    } catch {
      throw new Error(`呢個資料夾唔係 Git 倉庫：${repo}`)
    }
  }
  return (await runGit(repo, ["rev-parse", "--show-toplevel"])).trim()
}

export function sanitizeRemoteUrl(url: string): string {
  return url.replace(/https?:\/\/[^@]+@/i, (match) => `${match.split("://")[0]}://`)
}

export function parseOriginRemote(url: string): OriginRemote | null {
  const clean = sanitizeRemoteUrl(url).replace(/\.git$/, "")
  const match = /origin\.cursor\.com(?:\/git)?\/([^/]+)\/([^/]+)$/.exec(clean)
  if (!match) return null
  return { owner: match[1], repo: match[2], url: clean }
}

function parseRefs(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^HEAD -> /, "HEAD → "))
}

export async function loadCommits(repo: string, limit = 400): Promise<GitCommit[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 1500)
  const stdout = await runGit(repo, [
    "log",
    "--all",
    "--topo-order",
    `--max-count=${safeLimit}`,
    "--pretty=format:%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%D%x1e",
  ])
  if (!stdout.trim()) return []

  return stdout
    .split("\x1e")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [hash, parents, author, email, date, subject, refs] = chunk.split("\x1f")
      return {
        hash,
        shortHash: hash.slice(0, 7),
        parents: parents ? parents.split(" ").filter(Boolean) : [],
        author,
        email,
        date,
        subject: subject || "(沒有訊息)",
        refs: parseRefs(refs || ""),
      }
    })
}

export async function loadRefs(repo: string): Promise<GitRef[]> {
  const stdout = await runGit(repo, [
    "for-each-ref",
    "--format=%(refname)%00%(objectname)%00%(HEAD)",
    "refs/heads",
    "refs/remotes",
    "refs/tags",
  ])

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [refname, hash, head] = line.split("\0")
      if (refname.startsWith("refs/tags/")) {
        return { name: refname.slice("refs/tags/".length), hash, type: "tag" as const, current: false }
      }
      if (refname.startsWith("refs/remotes/")) {
        return {
          name: refname.slice("refs/remotes/".length),
          hash,
          type: "remote" as const,
          current: false,
        }
      }
      return {
        name: refname.slice("refs/heads/".length),
        hash,
        type: "branch" as const,
        current: head === "*",
      }
    })
}

export async function loadRemotes(repo: string): Promise<{ name: string; url: string }[]> {
  const stdout = await runGit(repo, ["remote", "-v"])
  const seen = new Map<string, string>()
  for (const line of stdout.split("\n")) {
    const match = /^(\S+)\s+(\S+)\s+\(fetch\)$/.exec(line.trim())
    if (match) seen.set(match[1], sanitizeRemoteUrl(match[2]))
  }
  return [...seen.entries()].map(([name, url]) => ({ name, url }))
}

export async function loadRepoInfo(repo: string): Promise<RepoInfo> {
  const [branchRaw, refs, status, remotes] = await Promise.all([
    runGit(repo, ["rev-parse", "--abbrev-ref", "HEAD"]),
    loadRefs(repo),
    runGit(repo, ["status", "-sb"]),
    loadRemotes(repo),
  ])
  const currentBranch = branchRaw.trim()
  const header = status.split("\n")[0] ?? ""
  const originRemote =
    remotes.map((remote) => parseOriginRemote(remote.url)).find((item): item is OriginRemote => item !== null) ??
    null

  return {
    path: repo,
    name: path.basename(repo),
    currentBranch: currentBranch === "HEAD" ? "DETACHED" : currentBranch,
    detached: currentBranch === "HEAD",
    refs,
    dirty: status.trim().split("\n").length > 1,
    aheadBehind: header.match(/\[.+\]/)?.[0]?.replace(/^\[/, "").replace(/\]$/, "") ?? null,
    remotes,
    originRemote,
  }
}

export async function loadGraph(repoPath: string, limit = 400): Promise<GraphPayload> {
  const repo = await resolveRepo(repoPath)
  const [info, commits] = await Promise.all([loadRepoInfo(repo), loadCommits(repo, limit)])
  const rows = layoutGraph(commits)
  return { repo: info, rows, laneCount: laneCount(rows) }
}

export async function loadCommit(repoPath: string, hash: string): Promise<CommitDetail> {
  const repo = await resolveRepo(repoPath)
  if (!/^[0-9a-f]{4,40}$/i.test(hash)) {
    throw new Error("無效嘅 commit hash")
  }

  const [meta, nameStatus, stats] = await Promise.all([
    runGit(repo, ["show", "-s", "--format=%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%b%x1f%D", hash]),
    runGit(repo, ["diff-tree", "--no-commit-id", "--name-status", "-r", "-M", hash]),
    runGit(repo, ["show", "--format=", "--stat", hash]),
  ])

  const [fullHash, parents, author, email, date, subject, body, refs] = meta.replace(/\n$/, "").split("\x1f")
  const files: FileChange[] = nameStatus
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t")
      const status = parts[0] ?? "?"
      if (status.startsWith("R") || status.startsWith("C")) {
        return { status, path: parts[2] ?? parts[1] ?? "", from: parts[1] }
      }
      return { status, path: parts[1] ?? "" }
    })

  return {
    hash: fullHash,
    subject: subject || "(沒有訊息)",
    body: (body || "").trim(),
    author,
    email,
    date,
    parents: parents ? parents.split(" ").filter(Boolean) : [],
    refs: parseRefs(refs || ""),
    files,
    stats: stats.trim(),
  }
}

export function formatCommitDocument(detail: CommitDetail): string {
  const date = new Date(detail.date)
  const when = Number.isNaN(date.getTime())
    ? detail.date
    : new Intl.DateTimeFormat("zh-Hant", { dateStyle: "medium", timeStyle: "short" }).format(date)
  const files = detail.files
    .map((file) => {
      const path = file.from ? `${file.from} -> ${file.path}` : file.path
      return `${file.status.padEnd(4)} ${path}`
    })
    .join("\n")

  return [
    detail.subject,
    "",
    `hash     ${detail.hash}`,
    `author   ${detail.author} <${detail.email}>`,
    `date     ${when}`,
    detail.refs.length ? `refs     ${detail.refs.join(", ")}` : "",
    detail.parents.length ? `parents  ${detail.parents.map((hash) => hash.slice(0, 7)).join(" ")}` : "",
    "",
    detail.body,
    "",
    `files (${detail.files.length})`,
    files || "(no file changes)",
    "",
    detail.stats,
    "",
  ]
    .filter((line) => line !== "")
    .join("\n")
}
