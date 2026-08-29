import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import {
  formatCommitDocument,
  loadCommit,
  loadCommits,
  loadGraph,
  loadRefs,
  loadRemotes,
  loadRepoInfo,
  normalizeUserPath,
  parseOriginRemote,
  resolveRepo,
  runGit,
  sanitizeRemoteUrl,
} from "../../shared/git"
import { createTempGit } from "./helpers/temp-git"

const temps: Array<{ cleanup: () => void }> = []

afterEach(() => {
  while (temps.length) temps.pop()?.cleanup()
})

describe("normalizeUserPath", () => {
  it("strips quotes and expands ~", () => {
    expect(normalizeUserPath(`"~/ogg-test"`)).toBe(path.normalize(path.join(homedir(), "ogg-test")))
  })

  it("translates a Windows drive path to /mnt/<drive> when not on win32", () => {
    if (process.platform === "win32") {
      expect(normalizeUserPath("C:\\Users\\wilson\\repo")).toMatch(/repo/)
      return
    }
    expect(normalizeUserPath("C:\\Users\\wilson\\repo")).toBe(
      path.normalize("/mnt/c/Users/wilson/repo"),
    )
    expect(normalizeUserPath("D:/code/app")).toBe(path.normalize("/mnt/d/code/app"))
  })
})

describe("Origin remote URL helpers", () => {
  it("strips credentials from http(s) remotes", () => {
    expect(sanitizeRemoteUrl("https://user:token@origin.cursor.com/acme/app.git")).toBe(
      "https://origin.cursor.com/acme/app.git",
    )
    expect(sanitizeRemoteUrl("http://x@example.com/r.git")).toBe("http://example.com/r.git")
  })

  it("parses origin.cursor.com owner/repo including the /git/ form", () => {
    expect(parseOriginRemote("https://origin.cursor.com/wilsonwong/ogg-test-a.git")).toEqual({
      owner: "wilsonwong",
      repo: "ogg-test-a",
      url: "https://origin.cursor.com/wilsonwong/ogg-test-a",
    })
    expect(parseOriginRemote("https://user:pw@origin.cursor.com/git/wilsonwong/ogg-test-a.git")).toEqual({
      owner: "wilsonwong",
      repo: "ogg-test-a",
      url: "https://origin.cursor.com/git/wilsonwong/ogg-test-a",
    })
    expect(parseOriginRemote("https://github.com/wilsonwong/origin-cli-kit.git")).toBeNull()
  })
})

describe("runGit / resolveRepo / loaders", () => {
  it("runs git -C and surfaces stderr", async () => {
    const repo = createTempGit()
    temps.push(repo)
    repo.commit("chore: seed")
    await expect(runGit(repo.root, ["rev-parse", "--abbrev-ref", "HEAD"])).resolves.toMatch(/main/)
    await expect(runGit(repo.root, ["definitely-not-a-git-command"])).rejects.toThrow()
  })

  it("resolves a git work tree and rejects missing / non-git folders", async () => {
    const repo = createTempGit()
    temps.push(repo)
    repo.commit("chore: seed")
    await expect(resolveRepo(repo.root)).resolves.toBe(repo.git("rev-parse", "--show-toplevel").trim())

    const missing = path.join(tmpdir(), `ogg-missing-${Date.now()}`)
    await expect(resolveRepo(missing)).rejects.toThrow(/找不到資料夾/)

    const empty = mkdtempSync(path.join(tmpdir(), "ogg-empty-"))
    temps.push({ cleanup: () => rmSync(empty, { recursive: true, force: true }) })
    await expect(resolveRepo(empty)).rejects.toThrow(/唔係 Git 倉庫/)
  })

  it("parses commits, refs, remotes, and repo info from a real local git repo", async () => {
    const repo = createTempGit()
    temps.push(repo)
    const first = repo.commit("feat: first", "a.txt", "one\n")
    let commits = await loadCommits(repo.root, 20)
    expect(commits.map((item) => item.subject)).toEqual(["feat: first"])
    expect(commits[0]?.hash).toBe(first)
    expect(commits[0]?.shortHash).toBe(first.slice(0, 7))
    expect(commits[0]?.parents).toEqual([])

    repo.git("checkout", "-b", "feature/graph")
    const second = repo.commit("feat: branch", "b.txt", "two\n")
    repo.git("remote", "add", "origin", "https://user:token@origin.cursor.com/wilsonwong/ogg-test-a.git")

    commits = await loadCommits(repo.root, 20)
    expect(commits.map((item) => item.subject)).toEqual(["feat: branch", "feat: first"])
    expect(commits[0]?.hash).toBe(second)
    expect(commits[0]?.parents).toEqual([first])

    const refs = await loadRefs(repo.root)
    expect(refs.some((ref) => ref.type === "branch" && ref.name === "main")).toBe(true)
    expect(refs.some((ref) => ref.type === "branch" && ref.name === "feature/graph" && ref.current)).toBe(
      true,
    )

    const remotes = await loadRemotes(repo.root)
    expect(remotes).toEqual([
      { name: "origin", url: "https://origin.cursor.com/wilsonwong/ogg-test-a.git" },
    ])

    const info = await loadRepoInfo(repo.root)
    expect(info.name).toBe(path.basename(repo.root))
    expect(info.currentBranch).toBe("feature/graph")
    expect(info.detached).toBe(false)
    expect(info.originRemote).toEqual({
      owner: "wilsonwong",
      repo: "ogg-test-a",
      url: "https://origin.cursor.com/wilsonwong/ogg-test-a",
    })

    repo.write("dirty.txt", "x")
    const dirty = await loadRepoInfo(repo.root)
    expect(dirty.dirty).toBe(true)
  })

  it("returns an empty commit list for a repo with no commits", async () => {
    const repo = createTempGit()
    temps.push(repo)
    await expect(loadCommits(repo.root)).resolves.toEqual([])
  })

  it("clamps the commit limit and still returns topo-ordered rows for loadGraph", async () => {
    const repo = createTempGit()
    temps.push(repo)
    repo.commit("a")
    repo.git("checkout", "-b", "feature/ui")
    repo.commit("b", "ui.txt", "ui\n")
    repo.git("checkout", "main")
    repo.commit("c", "main.txt", "main\n")
    repo.git("merge", "--no-ff", "--no-edit", "feature/ui", "-m", "merge: ui")

    const graph = await loadGraph(repo.root, 0)
    expect(graph.rows.length).toBeGreaterThanOrEqual(1)
    expect(graph.laneCount).toBeGreaterThanOrEqual(1)
    expect(graph.repo.currentBranch).toBe("main")
    expect(graph.rows[0]?.commit.subject).toBe("merge: ui")
    expect(graph.rows[0]?.lines.some((line) => line.from !== line.to || line.color >= 0)).toBe(true)
  })

  it("loads a commit detail including rename status and formats the document", async () => {
    const repo = createTempGit()
    temps.push(repo)
    repo.commit("feat: start", "old-name.txt", "hello\n")
    repo.git("mv", "old-name.txt", "new-name.txt")
    writeFileSync(path.join(repo.root, "new-name.txt"), "hello\nworld\n")
    repo.git("add", "-A")
    repo.git("commit", "-m", "refactor: rename")
    const hash = repo.git("rev-parse", "HEAD").trim()

    const detail = await loadCommit(repo.root, hash)
    expect(detail.subject).toBe("refactor: rename")
    expect(detail.parents).toHaveLength(1)
    expect(detail.files.some((file) => file.status.startsWith("R") && file.path === "new-name.txt")).toBe(
      true,
    )

    await expect(loadCommit(repo.root, "nope")).rejects.toThrow(/無效嘅 commit hash/)

    const doc = formatCommitDocument(detail)
    expect(doc).toContain("refactor: rename")
    expect(doc).toContain(detail.hash)
    expect(doc).toContain("old-name.txt -> new-name.txt")
    expect(doc).toContain("files (")
  })

  it("falls back to the raw date when the timestamp is not parseable", () => {
    const doc = formatCommitDocument({
      hash: "abcd1234abcd1234abcd1234abcd1234abcd1234",
      subject: "msg",
      body: "",
      author: "A",
      email: "a@b",
      date: "not-a-date",
      parents: [],
      refs: ["HEAD"],
      files: [],
      stats: "",
    })
    expect(doc).toContain("not-a-date")
    expect(doc).toContain("refs     HEAD")
    expect(doc).toContain("(no file changes)")
  })
})
