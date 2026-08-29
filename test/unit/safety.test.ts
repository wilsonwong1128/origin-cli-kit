import { describe, expect, it } from "vitest"

import {
  BRANCH_TYPES,
  assertSafeBranchName,
  assertSafeCommitMessage,
  assertSafeFullName,
  assertSafeHash,
  assertSafeRef,
  assertSafeRelPath,
  assertSafeRepoName,
  composeBranchName,
  safetyFor,
} from "../../shared/safety"

describe("assertSafeBranchName", () => {
  it("accepts a typical typed branch and collapses whitespace", () => {
    expect(assertSafeBranchName("  feature/login form  ")).toBe("feature/login-form")
  })

  it("rejects empty, overlong, and boundary punctuation", () => {
    expect(() => assertSafeBranchName("   ")).toThrow(/1–80 characters/)
    expect(() => assertSafeBranchName("x".repeat(81))).toThrow(/1–80 characters/)
    expect(() => assertSafeBranchName("-bad")).toThrow(/cannot start/)
    expect(() => assertSafeBranchName("/bad")).toThrow(/cannot start/)
    expect(() => assertSafeBranchName("bad/")).toThrow(/cannot start/)
  })

  it("rejects traversal, separators, and illegal characters", () => {
    expect(() => assertSafeBranchName("feat../x")).toThrow(/unsafe sequence/)
    expect(() => assertSafeBranchName("feat\\x")).toThrow(/unsafe sequence/)
    expect(() => assertSafeBranchName("feat\0x")).toThrow(/unsafe sequence/)
    expect(assertSafeBranchName("feat space")).toBe("feat-space")
    expect(assertSafeBranchName("feat/ok")).toBe("feat/ok")
    expect(() => assertSafeBranchName("你好")).toThrow(/letters, numbers/)
  })

  it("rejects empty or dot segments after the slash split", () => {
    expect(() => assertSafeBranchName("feat//x")).toThrow(/empty or invalid segment/)
    expect(() => assertSafeBranchName("feat/./x")).toThrow(/empty or invalid segment/)
  })

  it("is the implementation behind assertSafeRef", () => {
    expect(assertSafeRef("release/1.2.3")).toBe("release/1.2.3")
    expect(() => assertSafeRef("..")).toThrow()
  })
})

describe("composeBranchName", () => {
  it("prefixes every catalogued type except custom", () => {
    const expected: Record<string, string> = {
      feature: "feature/login",
      bugfix: "bugfix/login",
      hotfix: "hotfix/login",
      release: "release/login",
      chore: "chore/login",
      custom: "login",
    }
    for (const item of BRANCH_TYPES) {
      expect(composeBranchName(item.id, "login")).toBe(expected[item.id])
    }
  })

  it("does not double the prefix when the slug already has it", () => {
    expect(composeBranchName("feature", "feature/login")).toBe("feature/login")
  })

  it("still validates the composed name", () => {
    expect(() => composeBranchName("feature", "")).toThrow(/1–80 characters/)
    expect(() => composeBranchName("custom", "-nope")).toThrow(/cannot start/)
  })
})

describe("assertSafeHash", () => {
  it("accepts 4–40 hex characters and trims", () => {
    expect(assertSafeHash("  dead  ")).toBe("dead")
    expect(assertSafeHash("a".repeat(40))).toBe("a".repeat(40))
    expect(assertSafeHash("ABCDEF12")).toBe("ABCDEF12")
  })

  it("rejects short, long, and non-hex values", () => {
    expect(() => assertSafeHash("abc")).toThrow(/Invalid commit hash/)
    expect(() => assertSafeHash("a".repeat(41))).toThrow(/Invalid commit hash/)
    expect(() => assertSafeHash("zzzz")).toThrow(/Invalid commit hash/)
  })
})

describe("assertSafeRelPath", () => {
  it("normalizes backslashes and accepts a repo-relative file", () => {
    expect(assertSafeRelPath("src\\app.ts")).toBe("src/app.ts")
  })

  it("rejects absolute, drive, traversal, and flag-like paths", () => {
    expect(() => assertSafeRelPath("")).toThrow(/repository-relative/)
    expect(() => assertSafeRelPath("/etc/passwd")).toThrow(/repository-relative/)
    expect(() => assertSafeRelPath("C:\\Windows\\x")).toThrow(/repository-relative/)
    expect(() => assertSafeRelPath("a:\0b")).toThrow(/repository-relative/)
    expect(() => assertSafeRelPath("../secret")).toThrow(/unsafe segment/)
    expect(() => assertSafeRelPath("src/../../x")).toThrow(/unsafe segment/)
    expect(() => assertSafeRelPath("-rf")).toThrow(/unsafe segment/)
  })
})

describe("assertSafeCommitMessage", () => {
  it("requires a non-empty message, normalizes CRLF, and trims", () => {
    expect(assertSafeCommitMessage("  hello\r\nworld  ")).toBe("hello\nworld")
  })

  it("rejects empty, overlong, and null-byte messages", () => {
    expect(() => assertSafeCommitMessage("   ")).toThrow(/required/)
    expect(() => assertSafeCommitMessage("x".repeat(4001))).toThrow(/too long/)
    expect(() => assertSafeCommitMessage("ok\0no")).toThrow(/null byte/)
  })
})

describe("assertSafeRepoName / assertSafeFullName", () => {
  it("accepts a folder-safe repo name", () => {
    expect(assertSafeRepoName("ogg-test.repo_1")).toBe("ogg-test.repo_1")
  })

  it("rejects invalid folder names", () => {
    expect(() => assertSafeRepoName("has space")).toThrow(/invalid/)
    expect(() => assertSafeRepoName("a".repeat(81))).toThrow(/invalid/)
    expect(() => assertSafeRepoName("owner/repo")).toThrow(/invalid/)
  })

  it("requires owner/repo and nothing else", () => {
    expect(assertSafeFullName("  wilson/ogg-test-a  ")).toBe("wilson/ogg-test-a")
    expect(() => assertSafeFullName("only-name")).toThrow(/owner\/repo/)
    expect(() => assertSafeFullName("a/b/c")).toThrow(/owner\/repo/)
    expect(() => assertSafeFullName("wilson/has space")).toThrow(/owner\/repo/)
  })
})

describe("safetyFor", () => {
  it("classifies read-only / additive ops as info", () => {
    for (const op of ["fetch", "stage", "unstage", "createBranch"]) {
      expect(safetyFor(op)).toBe("info")
    }
  })

  it("treats push/commit/stash/checkout as reversible unless dirty or forced", () => {
    for (const op of ["push", "commit", "stash", "checkout"]) {
      expect(safetyFor(op)).toBe("reversible")
      expect(safetyFor(op, { dirty: true })).toBe("destructive")
      expect(safetyFor(op, { force: true })).toBe("destructive")
    }
  })

  it("treats pull/merge/stashPop/deleteBranch as destructive, irreversible when forced", () => {
    for (const op of ["pull", "merge", "stashPop", "deleteBranch"]) {
      expect(safetyFor(op)).toBe("destructive")
      expect(safetyFor(op, { force: true })).toBe("irreversible")
    }
  })

  it("treats discard and logout the same way", () => {
    expect(safetyFor("discard")).toBe("destructive")
    expect(safetyFor("logout", { force: true })).toBe("irreversible")
  })

  it("defaults unknown operations to destructive", () => {
    expect(safetyFor("force-push")).toBe("destructive")
    expect(safetyFor("create-mirrored")).toBe("destructive")
  })
})
