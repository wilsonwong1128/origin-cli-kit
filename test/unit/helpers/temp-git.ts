import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

export type TempGit = {
  root: string
  git: (...args: string[]) => string
  write: (file: string, contents: string) => string
  commit: (message: string, file?: string, contents?: string) => string
  cleanup: () => void
}

export function createTempGit(prefix = "ogg-unit-"): TempGit {
  const root = mkdtempSync(path.join(tmpdir(), prefix))
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      windowsHide: true,
    })

  git("init", "-b", "main")
  git("config", "user.name", "Ogg Tester")
  git("config", "user.email", "ogg-tester@local")
  git("config", "commit.gpgsign", "false")

  const write = (file: string, contents: string) => {
    const full = path.join(root, file)
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, contents)
    return full
  }

  const commit = (message: string, file = "README.md", contents = `${message}\n`) => {
    write(file, contents)
    git("add", file)
    git("commit", "-m", message)
    return git("rev-parse", "HEAD").trim()
  }

  const cleanup = () => {
    rmSync(root, { recursive: true, force: true })
  }

  return { root, git, write, commit, cleanup }
}

export function createTempBare(prefix = "ogg-bare-"): { root: string; cleanup: () => void } {
  const root = mkdtempSync(path.join(tmpdir(), prefix))
  execFileSync("git", ["init", "--bare", "-b", "main", root], {
    encoding: "utf8",
    windowsHide: true,
  })
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}
