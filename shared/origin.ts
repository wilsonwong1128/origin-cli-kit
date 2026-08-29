import { execFile, spawn } from "node:child_process"
import { homedir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import type { AuthStatus } from "./types"

const execFileAsync = promisify(execFile)

export type OriginRepo = {
  fullName: string
  url: string
}

export type OriginPullRequest = {
  number: number
  title: string
  status: string
  headRef: string
  baseRef: string
  url: string
}

function originCandidates(): string[] {
  return [
    "origin",
    path.join(homedir(), ".local", "bin", "origin"),
    path.join(homedir(), "bin", "origin"),
  ]
}

export async function resolveOriginCli(): Promise<string | null> {
  for (const candidate of originCandidates()) {
    try {
      await execFileAsync(candidate, ["--version"], { windowsHide: true })
      return candidate
    } catch {
      continue
    }
  }
  return null
}

async function runOrigin(args: string[], cwd?: string): Promise<string> {
  const cli = await resolveOriginCli()
  if (!cli) {
    throw new Error("搵唔到 Origin CLI。如果用 WSL 跑呢個 desktop app，確認 ~/.local/bin 喺 PATH。")
  }
  try {
    const { stdout } = await execFileAsync(cli, args, {
      cwd,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    })
    return stdout
  } catch (error) {
    const err = error as { stderr?: string; message?: string }
    throw new Error((err.stderr || err.message || "origin 指令失敗").trim())
  }
}

export async function listOriginRepos(): Promise<OriginRepo[]> {
  const stdout = await runOrigin(["repo", "list"])
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("http") && line.includes("/"))
    .filter((line, index, all) => all.indexOf(line) === index)
    .map((fullName) => ({
      fullName,
      url: `https://origin.cursor.com/${fullName}.git`,
    }))
}

export async function cloneOriginRepo(fullName: string, directory: string): Promise<void> {
  const cli = await resolveOriginCli()
  if (cli) {
    await runOrigin(["repo", "clone", fullName, directory])
    return
  }
  await execFileAsync("git", ["clone", `https://origin.cursor.com/${fullName}.git`, directory], {
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  })
}

export async function createOriginRepo(name: string): Promise<string> {
  await runOrigin(["repo", "create", name])
  if (name.includes("/")) return name
  const viewed = await runOrigin(["repo", "view", name, "--json", "org,name"])
  const parsed = JSON.parse(viewed) as { org?: string; name?: string }
  if (parsed.org && parsed.name) return `${parsed.org}/${parsed.name}`
  return name
}

export async function listPullRequests(
  repoPath: string,
  fullName?: string,
): Promise<OriginPullRequest[]> {
  const args = ["pr", "list", "--state", "all", "-L", "40", "--json", "number,title,status,headRef,baseRef,url"]
  if (fullName) args.push("-R", fullName)
  const stdout = await runOrigin(args, repoPath)
  const parsed = JSON.parse(stdout || "[]") as OriginPullRequest[]
  return Array.isArray(parsed) ? parsed : []
}

export async function createPullRequest(
  repoPath: string,
  input: { title: string; body?: string; draft?: boolean; base?: string; fullName?: string },
): Promise<string> {
  const args = ["pr", "create", "-t", input.title, "--push"]
  if (input.body) args.push("-b", input.body)
  args.push("--status", input.draft === false ? "open" : "draft")
  if (input.base) args.push("-B", input.base)
  if (input.fullName) args.push("-R", input.fullName)
  return runOrigin(args, repoPath)
}

export async function markPullRequestReady(
  repoPath: string,
  number: number,
  fullName?: string,
): Promise<string> {
  const args = ["pr", "ready", String(number)]
  if (fullName) args.push("-R", fullName)
  return runOrigin(args, repoPath)
}

export async function originAuthStatus(): Promise<AuthStatus> {
  try {
    const raw = await runOrigin(["auth", "status"])
    const loggedIn = /Token:\s+valid/i.test(raw)
    const method = /Auth method:\s+(.+)/i.exec(raw)?.[1]?.trim() ?? null
    return { loggedIn, method, raw }
  } catch (error) {
    return {
      loggedIn: false,
      method: null,
      raw: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function originAuthLogin(): Promise<string> {
  const cli = await resolveOriginCli()
  if (!cli) {
    throw new Error("Origin CLI not found. Install Origin CLI first.")
  }
  spawn(cli, ["auth", "login"], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  }).unref()
  return "Opening Origin login in the browser."
}

export async function originAuthLogout(): Promise<string> {
  return runOrigin(["auth", "logout"])
}

export async function mergePullRequest(
  repoPath: string,
  number: number,
  fullName?: string,
): Promise<string> {
  const args = ["pr", "merge", String(number)]
  if (fullName) args.push("-R", fullName)
  return runOrigin(args, repoPath)
}
