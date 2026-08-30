import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { execFileMock, spawnMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  spawnMock: vi.fn(() => ({ unref: vi.fn() })),
}))

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
  spawn: spawnMock,
}))

import {
  cloneOriginRepo,
  createOriginRepo,
  createPullRequest,
  listOriginRepos,
  listPullRequests,
  markPullRequestReady,
  mergePullRequest,
  originAuthLogin,
  originAuthLogout,
  originAuthStatus,
  resolveOriginCli,
} from "../../shared/origin"

type ExecResult = { stdout?: string; stderr?: string; error?: Error }

function refuseLiveCli(file: string, args: string[]): never {
  throw new Error(`unmocked execFile(${file} ${args.join(" ")}) — unit tests must never hit a live CLI`)
}

function installExec(handler: (file: string, args: string[]) => ExecResult) {
  execFileMock.mockImplementation(
    (file: string, args: string[] = [], options?: unknown, maybeCb?: unknown) => {
      const cb = typeof options === "function" ? options : maybeCb
      if (typeof cb !== "function") {
        refuseLiveCli(file, args)
      }
      try {
        const result = handler(file, args)
        if (result.error) {
          const err = Object.assign(result.error, { stderr: result.stderr, stdout: result.stdout })
          cb(err)
          return
        }
        cb(null, { stdout: result.stdout ?? "", stderr: result.stderr ?? "" })
      } catch (error) {
        cb(error)
      }
    },
  )
}

function missingOrigin(): void {
  installExec(() => ({ error: new Error("ENOENT") }))
}

function withOrigin(handler: (file: string, args: string[]) => ExecResult, cli = "origin"): void {
  installExec((file, args) => {
    if (args[0] === "--version") {
      return file === cli ? { stdout: "origin 2026.08.24\n" } : { error: new Error("ENOENT") }
    }
    if (file !== cli) return { error: new Error("ENOENT") }
    return handler(file, args)
  })
}

describe("resolveOriginCli", () => {
  beforeEach(() => {
    execFileMock.mockReset()
    spawnMock.mockReset()
    spawnMock.mockReturnValue({ unref: vi.fn() })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("returns null when every candidate fails — the first-class Windows failure", async () => {
    missingOrigin()
    await expect(resolveOriginCli()).resolves.toBeNull()
    const probed = execFileMock.mock.calls.map((call) => [call[0], call[1]])
    expect(probed.every(([, args]) => args[0] === "--version")).toBe(true)
    expect(probed.map(([file]) => file)).toEqual(
      expect.arrayContaining(["origin", expect.stringMatching(/[\\/]origin$/)]),
    )
  })

  it("does not invent a vendored Windows binary when the official CLI is absent", async () => {
    missingOrigin()
    expect(await resolveOriginCli()).toBeNull()
    const files = execFileMock.mock.calls.map((call) => String(call[0]))
    expect(files.some((file) => /origin\.exe$/i.test(file))).toBe(false)
    expect(files.some((file) => file.includes("vendor"))).toBe(false)
  })

  it("returns the first candidate that answers --version", async () => {
    withOrigin(() => ({ stdout: "" }), "origin")
    await expect(resolveOriginCli()).resolves.toBe("origin")
  })
})

describe("Origin URL construction and `origin repo list` parsing", () => {
  beforeEach(() => {
    execFileMock.mockReset()
    spawnMock.mockReset()
    spawnMock.mockReturnValue({ unref: vi.fn() })
  })

  it("maps owner/repo lines to https://origin.cursor.com/{owner}/{repo}.git", async () => {
    withOrigin((_file, args) => {
      expect(args).toEqual(["repo", "list"])
      return {
        stdout: [
          "wilsonwong/ogg-test-alpha",
          "  wilsonwong/ogg-test-beta  ",
          "https://origin.cursor.com/wilsonwong/ogg-test-alpha.git",
          "not-a-repo",
          "wilsonwong/ogg-test-alpha",
          "",
        ].join("\n"),
      }
    })

    await expect(listOriginRepos()).resolves.toEqual([
      {
        fullName: "wilsonwong/ogg-test-alpha",
        url: "https://origin.cursor.com/wilsonwong/ogg-test-alpha.git",
      },
      {
        fullName: "wilsonwong/ogg-test-beta",
        url: "https://origin.cursor.com/wilsonwong/ogg-test-beta.git",
      },
    ])
  })

  it("throws the existing Cantonese error when the CLI is missing (expected on native Windows)", async () => {
    missingOrigin()
    await expect(listOriginRepos()).rejects.toThrow(/搵唔到 Origin CLI/)
  })

  it("surfaces origin stderr when `repo list` fails", async () => {
    withOrigin(() => ({ error: new Error("fail"), stderr: "auth required\n" }))
    await expect(listOriginRepos()).rejects.toThrow("auth required")
  })
})

describe("cloneOriginRepo", () => {
  beforeEach(() => {
    execFileMock.mockReset()
  })

  it("uses `origin repo clone` when the CLI is present", async () => {
    withOrigin((_file, args) => {
      if (args[0] === "repo" && args[1] === "clone") {
        expect(args).toEqual(["repo", "clone", "wilsonwong/ogg-test-alpha", "/tmp/dest"])
        return { stdout: "" }
      }
      return { error: new Error(`unexpected ${args.join(" ")}`) }
    })
    await cloneOriginRepo("wilsonwong/ogg-test-alpha", "/tmp/dest")
  })

  it("falls back to git clone of the constructed Origin URL when the CLI is missing", async () => {
    installExec((file, args) => {
      if (args[0] === "--version") return { error: new Error("ENOENT") }
      if (file === "git" && args[0] === "clone") {
        expect(args).toEqual([
          "clone",
          "https://origin.cursor.com/wilsonwong/ogg-test-alpha.git",
          "/tmp/dest",
        ])
        return { stdout: "" }
      }
      return { error: new Error(`unexpected ${file} ${args.join(" ")}`) }
    })
    await cloneOriginRepo("wilsonwong/ogg-test-alpha", "/tmp/dest")
  })
})

describe("createOriginRepo and pull-request helpers", () => {
  beforeEach(() => {
    execFileMock.mockReset()
    spawnMock.mockReset()
    spawnMock.mockReturnValue({ unref: vi.fn() })
  })

  it("returns owner/repo unchanged when the create name is already qualified", async () => {
    withOrigin((_file, args) => {
      expect(args).toEqual(["repo", "create", "wilsonwong/ogg-test-alpha"])
      return { stdout: "" }
    })
    await expect(createOriginRepo("wilsonwong/ogg-test-alpha")).resolves.toBe(
      "wilsonwong/ogg-test-alpha",
    )
  })

  it("resolves a bare name through `origin repo view --json`", async () => {
    withOrigin((_file, args) => {
      if (args[0] === "repo" && args[1] === "create") return { stdout: "" }
      if (args[0] === "repo" && args[1] === "view") {
        expect(args).toEqual(["repo", "view", "ogg-test-alpha", "--json", "org,name"])
        return { stdout: JSON.stringify({ org: "wilsonwong", name: "ogg-test-alpha" }) }
      }
      return { error: new Error(`unexpected ${args.join(" ")}`) }
    })
    await expect(createOriginRepo("ogg-test-alpha")).resolves.toBe("wilsonwong/ogg-test-alpha")
  })

  it("parses `origin pr list` JSON and ignores a non-array payload", async () => {
    withOrigin((_file, args) => {
      expect(args.slice(0, 6)).toEqual(["pr", "list", "--state", "all", "-L", "40"])
      expect(args).toContain("-R")
      return {
        stdout: JSON.stringify([
          {
            number: 3,
            title: "Ready one",
            status: "open",
            headRef: "feature/a",
            baseRef: "main",
            url: "https://origin.cursor.com/wilsonwong/ogg-test-alpha/pull/3",
          },
        ]),
      }
    })
    const prs = await listPullRequests("/repo", "wilsonwong/ogg-test-alpha")
    expect(prs).toHaveLength(1)
    expect(prs[0]?.number).toBe(3)

    withOrigin(() => ({ stdout: JSON.stringify({ not: "array" }) }))
    await expect(listPullRequests("/repo")).resolves.toEqual([])
  })

  it("creates a draft PR by default and an open PR when draft is false", async () => {
    const seen: string[][] = []
    withOrigin((_file, args) => {
      seen.push(args)
      return { stdout: "created" }
    })
    await createPullRequest("/repo", { title: "Add graph", body: "lines", fullName: "o/r" })
    await createPullRequest("/repo", { title: "Ready", draft: false, base: "main" })
    expect(seen[0]).toEqual([
      "pr",
      "create",
      "-t",
      "Add graph",
      "--push",
      "-b",
      "lines",
      "--status",
      "draft",
      "-R",
      "o/r",
    ])
    expect(seen[1]).toEqual([
      "pr",
      "create",
      "-t",
      "Ready",
      "--push",
      "--status",
      "open",
      "-B",
      "main",
    ])
  })

  it("marks a PR ready and merges by number", async () => {
    const seen: string[][] = []
    withOrigin((_file, args) => {
      seen.push(args)
      return { stdout: "ok" }
    })
    await markPullRequestReady("/repo", 7, "o/r")
    await mergePullRequest("/repo", 7, "o/r")
    expect(seen).toEqual([
      ["pr", "ready", "7", "-R", "o/r"],
      ["pr", "merge", "7", "-R", "o/r"],
    ])
  })
})

describe("origin auth", () => {
  beforeEach(() => {
    execFileMock.mockReset()
    spawnMock.mockReset()
    spawnMock.mockReturnValue({ unref: vi.fn() })
  })

  it("parses Token: valid and the auth method", async () => {
    withOrigin(() => ({
      stdout: "Auth method: browser\nToken: valid\n",
    }))
    await expect(originAuthStatus()).resolves.toEqual({
      loggedIn: true,
      method: "browser",
      raw: "Auth method: browser\nToken: valid\n",
    })
  })

  it("returns loggedOut on a missing CLI instead of throwing", async () => {
    missingOrigin()
    const status = await originAuthStatus()
    expect(status.loggedIn).toBe(false)
    expect(status.method).toBeNull()
    expect(status.raw).toMatch(/搵唔到 Origin CLI/)
  })

  it("refuses login when the official CLI is not installed (do not ship a copied CLI)", async () => {
    missingOrigin()
    await expect(originAuthLogin()).rejects.toThrow(/Origin CLI not found/)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it("spawns `origin auth login` detached when the CLI exists", async () => {
    withOrigin(() => ({ stdout: "" }))
    await expect(originAuthLogin()).resolves.toMatch(/Opening Origin login/)
    expect(spawnMock).toHaveBeenCalledWith(
      "origin",
      ["auth", "login"],
      expect.objectContaining({ detached: true, stdio: "ignore" }),
    )
  })

  it("runs `origin auth logout`", async () => {
    withOrigin((_file, args) => {
      expect(args).toEqual(["auth", "logout"])
      return { stdout: "bye" }
    })
    await expect(originAuthLogout()).resolves.toBe("bye")
  })
})
