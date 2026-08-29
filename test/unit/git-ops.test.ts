import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../../shared/origin", () => ({
  cloneOriginRepo: vi.fn(async (_fullName: string, directory: string) => {
    mkdirSync(directory, { recursive: true })
  }),
}))

import { cloneOriginRepo } from "../../shared/origin"
import { checkoutHash, cloneTo, loadWorkingTree, runGitOp } from "../../shared/git-ops"
import { createTempBare, createTempGit } from "./helpers/temp-git"

const temps: Array<{ cleanup: () => void }> = []

afterEach(() => {
  while (temps.length) temps.pop()?.cleanup()
  vi.mocked(cloneOriginRepo).mockClear()
})

describe("loadWorkingTree", () => {
  it("classifies staged, unstaged, untracked, and stash entries", async () => {
    const repo = createTempGit()
    temps.push(repo)
    repo.commit("seed", "tracked.txt", "v1\n")
    repo.write("stashed.txt", "s\n")
    repo.git("add", "stashed.txt")
    repo.git("stash", "push", "-u", "-m", "parked")
    repo.write("tracked.txt", "v2\n")
    repo.write("fresh.txt", "new\n")
    repo.git("add", "tracked.txt")
    repo.write("tracked.txt", "v3\n")

    const tree = await loadWorkingTree(repo.root)
    const tracked = tree.files.find((file) => file.path === "tracked.txt")
    const fresh = tree.files.find((file) => file.path === "fresh.txt")
    expect(tracked?.staged).toBe(true)
    expect(tracked?.unstaged).toBe(true)
    expect(fresh?.staged).toBe(false)
    expect(fresh?.unstaged).toBe(true)
    expect(fresh?.index).toBe("?")
    expect(tree.stashes.some((line) => line.includes("parked"))).toBe(true)
    expect(tree.stagedCount).toBeGreaterThanOrEqual(1)
    expect(tree.unstagedCount).toBeGreaterThanOrEqual(1)
  })

  it("uses the rename target as the path when porcelain shows ` -> `", async () => {
    const repo = createTempGit()
    temps.push(repo)
    repo.commit("seed", "old.txt", "x\n")
    repo.git("mv", "old.txt", "renamed.txt")
    const tree = await loadWorkingTree(repo.root)
    expect(tree.files.some((file) => file.path === "renamed.txt" && file.staged)).toBe(true)
  })
})

describe("runGitOp", () => {
  it("creates a typed branch, optionally checks it out, and refuses to delete HEAD", async () => {
    const repo = createTempGit()
    temps.push(repo)
    repo.commit("seed")

    await expect(
      runGitOp(repo.root, { op: "createBranch", type: "feature", name: "login", checkout: false }),
    ).resolves.toBe("feature/login")
    expect(repo.git("branch", "--list", "feature/login")).toMatch(/feature\/login/)
    expect(repo.git("rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("main")

    await expect(
      runGitOp(repo.root, { op: "createBranch", type: "hotfix", name: "npe", checkout: true }),
    ).resolves.toBe("hotfix/npe")
    expect(repo.git("rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("hotfix/npe")

    await expect(runGitOp(repo.root, { op: "deleteBranch", name: "hotfix/npe" })).rejects.toThrow(
      /Cannot delete the branch you are on/,
    )

    await runGitOp(repo.root, { op: "checkout", branch: "main" })
    await runGitOp(repo.root, { op: "deleteBranch", name: "feature/login" })
    expect(repo.git("branch", "--list", "feature/login").trim()).toBe("")

    repo.git("branch", "feature/unmerged")
    repo.git("checkout", "feature/unmerged")
    repo.commit("unmerged", "u.txt", "u\n")
    repo.git("checkout", "main")
    await expect(runGitOp(repo.root, { op: "deleteBranch", name: "feature/unmerged" })).rejects.toThrow()
    await runGitOp(repo.root, { op: "deleteBranch", name: "feature/unmerged", force: true })
    expect(repo.git("branch", "--list", "feature/unmerged").trim()).toBe("")
  })

  it("stages, unstages, commits, discards, stashes, pops, and merges --no-ff", async () => {
    const repo = createTempGit()
    temps.push(repo)
    repo.commit("seed", "file.txt", "base\n")
    repo.write("file.txt", "edit\n")

    await runGitOp(repo.root, { op: "stage", paths: ["file.txt", "file.txt"] })
    expect((await loadWorkingTree(repo.root)).stagedCount).toBe(1)

    await runGitOp(repo.root, { op: "unstage", paths: ["file.txt"] })
    expect((await loadWorkingTree(repo.root)).files[0]?.staged).toBe(false)

    await runGitOp(repo.root, { op: "discard", paths: ["file.txt"] })
    expect(repo.git("status", "--porcelain")).toBe("")

    repo.write("file.txt", "stash-me\n")
    await runGitOp(repo.root, { op: "stash", message: "hold edits" })
    expect(repo.git("status", "--porcelain")).toBe("")
    expect(repo.git("stash", "list")).toMatch(/hold edits/)

    await runGitOp(repo.root, { op: "stashPop" })
    expect(repo.git("status", "--porcelain")).toMatch(/file\.txt/)
    await runGitOp(repo.root, { op: "stage", paths: ["file.txt"] })
    await runGitOp(repo.root, { op: "commit", message: "feat: keep" })

    await runGitOp(repo.root, { op: "createBranch", type: "feature", name: "topic", checkout: true })
    repo.commit("topic work", "topic.txt", "t\n")
    await runGitOp(repo.root, { op: "checkout", branch: "main" })
    const before = repo.git("rev-parse", "HEAD").trim()
    await runGitOp(repo.root, { op: "merge", branch: "feature/topic" })
    const parents = repo.git("rev-parse", "HEAD^1", "HEAD^2").trim().split("\n")
    expect(parents[0]).toBe(before)
    expect(parents).toHaveLength(2)
  })

  it("fetches, pushes, and fast-forward pulls against a local git remote (not Origin)", async () => {
    const repo = createTempGit()
    const bare = createTempBare()
    temps.push(repo, bare)
    repo.commit("seed")
    repo.git("remote", "add", "origin", bare.root)
    await expect(runGitOp(repo.root, { op: "push" })).resolves.toBeTypeOf("string")

    const other = createTempGit()
    temps.push(other)
    other.git("remote", "add", "origin", bare.root)
    other.git("fetch", "origin")
    other.git("checkout", "-B", "main", "origin/main")
    other.commit("from-other", "other.txt", "o\n")
    other.git("push", "-u", "origin", "HEAD")

    await runGitOp(repo.root, { op: "fetch" })
    expect(repo.git("rev-parse", "origin/main")).not.toBe(repo.git("rev-parse", "HEAD"))
    await runGitOp(repo.root, { op: "pull" })
    expect(repo.git("rev-parse", "HEAD").trim()).toBe(other.git("rev-parse", "HEAD").trim())
  })

  it("rejects unsafe paths and messages before touching git", async () => {
    const repo = createTempGit()
    temps.push(repo)
    repo.commit("seed")
    await expect(runGitOp(repo.root, { op: "stage", paths: ["../outside"] })).rejects.toThrow(
      /unsafe segment/,
    )
    await expect(runGitOp(repo.root, { op: "commit", message: "" })).rejects.toThrow(/required/)
    await expect(runGitOp(repo.root, { op: "checkout", branch: "-bad" })).rejects.toThrow(/cannot start/)
  })
})

describe("cloneTo / checkoutHash", () => {
  it("refuses to overwrite, never create-mirrors, and clones only the asserted owner/repo", async () => {
    const parent = mkdtempSync(path.join(tmpdir(), "ogg-clone-parent-"))
    temps.push({ cleanup: () => rmSync(parent, { recursive: true, force: true }) })
    const dest = await cloneTo("wilsonwong/ogg-test-alpha", parent)
    expect(dest).toBe(path.join(parent, "ogg-test-alpha"))
    expect(existsSync(dest)).toBe(true)
    expect(cloneOriginRepo).toHaveBeenCalledWith("wilsonwong/ogg-test-alpha", dest)
    expect(vi.mocked(cloneOriginRepo).mock.calls.some((call) => String(call[0]).includes("mirror"))).toBe(
      false,
    )

    await expect(cloneTo("wilsonwong/ogg-test-alpha", parent)).rejects.toThrow(/refusing to overwrite/)
    await expect(cloneTo("not-a-full-name", parent)).rejects.toThrow(/owner\/repo/)
    await expect(cloneTo("wilsonwong/ogg-test-alpha", parent, "has space")).rejects.toThrow(/invalid/)
  })

  it("detaches HEAD at a safe hash", async () => {
    const repo = createTempGit()
    temps.push(repo)
    const hash = repo.commit("seed")
    repo.commit("later")
    await checkoutHash(repo.root, hash.slice(0, 8))
    expect(repo.git("rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("HEAD")
    expect(repo.git("rev-parse", "HEAD").trim().startsWith(hash.slice(0, 8))).toBe(true)
    await expect(checkoutHash(repo.root, "nope")).rejects.toThrow(/Invalid commit hash/)
  })
})
