import { execFileSync } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

export type LocalPair = {
  alpha: string
  beta: string
}

function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
  })
}

function write(root: string, file: string, contents: string): void {
  const full = path.join(root, file)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, contents)
}

function seedGraphRepo(root: string, name: string, originRepo: string): void {
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })
  git(root, "init", "-b", "main")
  git(root, "config", "user.name", "Ogg Tester")
  git(root, "config", "user.email", "ogg-tester@local")
  git(root, "config", "commit.gpgsign", "false")

  write(root, "README.md", `# ${name}\n`)
  git(root, "add", "README.md")
  git(root, "commit", "-m", "chore: seed")

  git(root, "checkout", "-b", "feature/graph-ui")
  write(root, "src/graph.js", "export const color = 1\n")
  git(root, "add", "src/graph.js")
  git(root, "commit", "-m", "feat: color lines")

  git(root, "checkout", "main")
  write(root, "docs.txt", `${name} mainline\n`)
  git(root, "add", "docs.txt")
  git(root, "commit", "-m", "docs: mainline")
  git(root, "merge", "--no-ff", "--no-edit", "feature/graph-ui", "-m", "merge: graph colors")

  git(root, "remote", "add", "origin", `https://origin.cursor.com/ogg-e2e/${originRepo}.git`)
}

export function seedLocalRepoPair(): LocalPair {
  const stamp = `${Date.now().toString(36)}`
  const alpha = path.join(tmpdir(), `ogg-e2e-alpha-${stamp}`)
  const beta = path.join(tmpdir(), `ogg-e2e-beta-${stamp}`)
  seedGraphRepo(alpha, "ogg-e2e-alpha", "ogg-test-e2e-alpha")
  seedGraphRepo(beta, "ogg-e2e-beta", "ogg-test-e2e-beta")
  return { alpha, beta }
}
