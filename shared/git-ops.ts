import { existsSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import path from "node:path"

import { resolveRepo, runGit } from "./git"
import { cloneOriginRepo } from "./origin"
import {
  assertSafeBranchName,
  assertSafeCommitMessage,
  assertSafeFullName,
  assertSafeHash,
  assertSafeRelPath,
  assertSafeRepoName,
  composeBranchName,
  type BranchType,
} from "./safety"
import type { WorkFile, WorkingTree } from "./types"

export type GitOp =
  | { op: "fetch" }
  | { op: "pull" }
  | { op: "push" }
  | { op: "checkout"; branch: string }
  | { op: "createBranch"; type: BranchType; name: string; checkout: boolean }
  | { op: "deleteBranch"; name: string; force?: boolean }
  | { op: "commit"; message: string }
  | { op: "stage"; paths: string[] }
  | { op: "unstage"; paths: string[] }
  | { op: "discard"; paths: string[] }
  | { op: "stash"; message?: string }
  | { op: "stashPop" }
  | { op: "merge"; branch: string }

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.map(assertSafeRelPath))]
}

export async function loadWorkingTree(repoPath: string): Promise<WorkingTree> {
  const repo = await resolveRepo(repoPath)
  const [porcelain, stashRaw] = await Promise.all([
    runGit(repo, ["status", "--porcelain=v1", "-uall"]),
    runGit(repo, ["stash", "list", "--max-count=20"]).catch(() => ""),
  ])
  const files: WorkFile[] = porcelain
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.length >= 3)
    .map((line) => {
      const index = line[0] === " " ? "" : line[0]
      const work = line[1] === " " ? "" : line[1]
      const raw = line.slice(3)
      const pathName = raw.includes(" -> ") ? (raw.split(" -> ").at(-1) ?? raw) : raw
      return {
        path: pathName,
        index,
        work,
        staged: Boolean(index && index !== "?"),
        unstaged: Boolean(work) || index === "?",
      }
    })
  const stashes = stashRaw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  return {
    files,
    stagedCount: files.filter((file) => file.staged).length,
    unstagedCount: files.filter((file) => file.unstaged).length,
    stashes,
  }
}

export async function runGitOp(repoPath: string, action: GitOp): Promise<string> {
  const repo = await resolveRepo(repoPath)

  switch (action.op) {
    case "fetch":
      return runGit(repo, ["fetch", "--all", "--prune"])
    case "pull":
      return runGit(repo, ["pull", "--ff-only"])
    case "push":
      return runGit(repo, ["push", "-u", "origin", "HEAD"])
    case "checkout":
      return runGit(repo, ["switch", assertSafeBranchName(action.branch)])
    case "createBranch": {
      const name = composeBranchName(action.type, action.name)
      if (action.checkout) {
        await runGit(repo, ["switch", "-c", name])
      } else {
        await runGit(repo, ["branch", name])
      }
      return name
    }
    case "deleteBranch": {
      const name = assertSafeBranchName(action.name)
      const current = (await runGit(repo, ["rev-parse", "--abbrev-ref", "HEAD"])).trim()
      if (name === current) {
        throw new Error("Cannot delete the branch you are on.")
      }
      return runGit(repo, ["branch", action.force ? "-D" : "-d", name])
    }
    case "commit":
      return runGit(repo, ["commit", "-m", assertSafeCommitMessage(action.message)])
    case "stage":
      return runGit(repo, ["add", "--", ...uniquePaths(action.paths)])
    case "unstage":
      return runGit(repo, ["restore", "--staged", "--", ...uniquePaths(action.paths)])
    case "discard":
      return runGit(repo, ["restore", "--worktree", "--source=HEAD", "--", ...uniquePaths(action.paths)])
    case "stash":
      return runGit(
        repo,
        action.message?.trim()
          ? ["stash", "push", "-u", "-m", assertSafeCommitMessage(action.message)]
          : ["stash", "push", "-u"],
      )
    case "stashPop":
      return runGit(repo, ["stash", "pop"])
    case "merge":
      return runGit(repo, ["merge", "--no-ff", assertSafeBranchName(action.branch)])
    default: {
      const never: never = action
      throw new Error(`Unsupported git operation: ${JSON.stringify(never)}`)
    }
  }
}

export async function cloneTo(fullName: string, parent: string, folderName?: string): Promise<string> {
  const safeName = assertSafeFullName(fullName)
  const folder = assertSafeRepoName(folderName?.trim() || safeName.split("/")[1] || "repo")
  const dest = path.join(parent, folder)
  if (existsSync(dest)) {
    throw new Error(`Destination already exists (refusing to overwrite): ${dest}`)
  }
  await mkdir(parent, { recursive: true })
  await cloneOriginRepo(safeName, dest)
  return dest
}

export async function checkoutHash(repoPath: string, hash: string): Promise<string> {
  const repo = await resolveRepo(repoPath)
  return runGit(repo, ["switch", "--detach", assertSafeHash(hash)])
}
