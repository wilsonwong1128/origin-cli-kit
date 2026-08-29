export type SafetyLevel = "info" | "reversible" | "destructive" | "irreversible"

export type BranchType = "feature" | "bugfix" | "hotfix" | "release" | "chore" | "custom"

export const BRANCH_TYPES: { id: BranchType; prefix: string }[] = [
  { id: "feature", prefix: "feature/" },
  { id: "bugfix", prefix: "bugfix/" },
  { id: "hotfix", prefix: "hotfix/" },
  { id: "release", prefix: "release/" },
  { id: "chore", prefix: "chore/" },
  { id: "custom", prefix: "" },
]

export function assertSafeBranchName(input: string): string {
  const name = input.trim().replace(/\s+/g, "-")
  if (!name || name.length > 80) {
    throw new Error("Branch name must be 1–80 characters.")
  }
  if (name.startsWith("-") || name.startsWith("/") || name.endsWith("/")) {
    throw new Error("Branch name cannot start with '-' or '/'.")
  }
  if (name.includes("..") || name.includes("\\") || name.includes("\0")) {
    throw new Error("Branch name contains an unsafe sequence.")
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(name)) {
    throw new Error("Branch name can only use letters, numbers, '.', '_', '-' and '/'.")
  }
  if (name.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Branch name has an empty or invalid segment.")
  }
  return name
}

export function composeBranchName(type: BranchType, raw: string): string {
  const prefix = BRANCH_TYPES.find((item) => item.id === type)?.prefix ?? ""
  const slug = raw.trim().replace(/\s+/g, "-").replace(/^\/+|\/+$/g, "")
  if (prefix && slug.startsWith(prefix)) return assertSafeBranchName(slug)
  return assertSafeBranchName(`${prefix}${slug}`)
}

export function assertSafeRef(input: string): string {
  return assertSafeBranchName(input)
}

export function assertSafeHash(hash: string): string {
  if (!/^[0-9a-f]{4,40}$/i.test(hash.trim())) {
    throw new Error("Invalid commit hash.")
  }
  return hash.trim()
}

export function assertSafeRelPath(file: string): string {
  const trimmed = file.trim().replaceAll("\\", "/")
  if (!trimmed || trimmed.includes("\0") || trimmed.startsWith("/") || /^[A-Za-z]:/.test(trimmed)) {
    throw new Error("File path is not a safe repository-relative path.")
  }
  if (trimmed.startsWith("-") || trimmed.split("/").includes("..")) {
    throw new Error("File path contains an unsafe segment.")
  }
  return trimmed
}

export function assertSafeCommitMessage(message: string): string {
  const text = message.replace(/\r\n/g, "\n").trim()
  if (!text) throw new Error("Commit message is required.")
  if (text.length > 4000) throw new Error("Commit message is too long.")
  if (text.includes("\0")) throw new Error("Commit message contains a null byte.")
  return text
}

export function assertSafeRepoName(name: string): string {
  const trimmed = name.trim()
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed) || trimmed.length > 80) {
    throw new Error("Repository folder name is invalid.")
  }
  return trimmed
}

export function assertSafeFullName(fullName: string): string {
  const trimmed = fullName.trim()
  if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(trimmed)) {
    throw new Error("Origin repo name must be owner/repo.")
  }
  return trimmed
}

export function safetyFor(op: string, extra?: { force?: boolean; dirty?: boolean }): SafetyLevel {
  switch (op) {
    case "fetch":
    case "stage":
    case "unstage":
    case "createBranch":
      return "info"
    case "push":
    case "commit":
    case "stash":
    case "checkout":
      return extra?.dirty || extra?.force ? "destructive" : "reversible"
    case "pull":
    case "merge":
    case "stashPop":
    case "deleteBranch":
      return extra?.force ? "irreversible" : "destructive"
    case "discard":
    case "logout":
      return extra?.force ? "irreversible" : "destructive"
    default:
      return "destructive"
  }
}
