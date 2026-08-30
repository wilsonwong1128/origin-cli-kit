import { execFile } from "node:child_process"
import { homedir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { describe, expect, it } from "vitest"

const execFileAsync = promisify(execFile)

const FORBIDDEN_REPOS = [
  "factorytalk-AI-Platform",
  "AB-PLC-conversion",
  "ab-plc-tool",
  "plc-misc",
  "plc",
  "FactoryTalk_Alarm_XML_generater",
  "hkjc-horse",
  "fxsound-app-private",
  "Mi-Bluetooth",
  "ai-memory-system",
  "cctv-design-tool",
]

const FORBIDDEN_NAME = new Set(FORBIDDEN_REPOS.map((name) => name.toLowerCase()))

function originCandidates(): string[] {
  return ["origin", path.join(homedir(), ".local", "bin", "origin"), path.join(homedir(), "bin", "origin")]
}

async function resolveOriginCli(): Promise<string | null> {
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

async function runOrigin(cli: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(cli, args, {
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    })
    return { stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string }
    throw new Error((err.stderr || err.stdout || err.message || "origin failed").trim())
  }
}

function assertDisposableName(fullName: string): { owner: string; name: string } {
  const match = /^([A-Za-z0-9._-]+)\/(ogg-test-[A-Za-z0-9._-]+)$/.exec(fullName)
  if (!match) {
    throw new Error(`Refusing to touch ${fullName}: live tests may only create ogg-test-* repos`)
  }
  const owner = match[1]!
  const name = match[2]!
  if (FORBIDDEN_NAME.has(name.toLowerCase())) {
    throw new Error(`Refusing to touch protected repo ${fullName}`)
  }
  return { owner, name }
}

function isUnclaimedNamespace(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error)
  return /not (yet )?claimed|claim (a |your )?(codebase|namespace)|no namespace|namespace .*(missing|not|unclaimed)|codebase name|origin is not enabled|enable origin/i.test(
    text,
  )
}

async function isAuthenticated(cli: string): Promise<boolean> {
  const status = await runOrigin(cli, ["auth", "status"]).catch((error: Error) => ({
    stdout: "",
    stderr: error.message,
  }))
  return /Token:\s+valid/i.test(`${status.stdout}\n${status.stderr}`)
}

/**
 * Live runs when the official CLI is installed and already signed in.
 * An empty `origin repo list` is not a skip: `origin repo create <name>`
 * (no slash) creates into the claimed namespace. Owner is resolved after
 * create via `origin repo view --json org,name`, never from the first list line.
 */
async function liveGate(): Promise<{ cli: string } | null> {
  const cli = await resolveOriginCli()
  if (!cli) return null
  if (!(await isAuthenticated(cli))) return null
  return { cli }
}

async function resolveCreatedFullName(cli: string, name: string): Promise<{ fullName: string; visibility?: string }> {
  const viewed = await runOrigin(cli, ["repo", "view", name, "--json", "org,name,visibility"]).catch(async () =>
    runOrigin(cli, ["repo", "view", name, "--json", "org,name"]),
  )
  const parsed = JSON.parse(viewed.stdout) as { org?: string; name?: string; visibility?: string }
  if (!parsed.org || !parsed.name) {
    throw new Error(`origin repo view did not return org/name for ${name}`)
  }
  const fullName = `${parsed.org}/${parsed.name}`
  assertDisposableName(fullName)
  return { fullName, visibility: parsed.visibility }
}

async function deleteIfCreated(cli: string, fullName: string): Promise<void> {
  const { owner, name } = assertDisposableName(fullName)
  await runOrigin(cli, ["repo", "delete", `${owner}/${name}`, "-y"])
}

describe("live Origin (ogg-test-* only)", () => {
  it("creates a disposable Internal/Private repo and always deletes it", async (ctx) => {
    const gate = await liveGate()
    if (!gate) {
      ctx.skip()
      return
    }

    const name = `ogg-test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const created: string[] = []
    let createSucceeded = false
    try {
      const createArgs = ["repo", "create", name]
      expect(name.includes("/")).toBe(false)
      expect(createArgs).not.toContain("create-mirrored")
      expect(createArgs.join(" ")).not.toMatch(/mirror/)
      try {
        await runOrigin(gate.cli, createArgs)
        createSucceeded = true
      } catch (error) {
        if (isUnclaimedNamespace(error)) {
          ctx.skip()
          return
        }
        throw error
      }

      const resolved = await resolveCreatedFullName(gate.cli, name)
      created.push(resolved.fullName)
      if (resolved.visibility && !/private|internal/i.test(resolved.visibility)) {
        throw new Error(`Created repo visibility was ${resolved.visibility}; expected Internal/Private`)
      }
    } finally {
      if (createSucceeded && created.length === 0) {
        try {
          created.push((await resolveCreatedFullName(gate.cli, name)).fullName)
        } catch {
          // delete still runs below if resolve recovered nothing
        }
      }
      const errors: string[] = []
      for (const repo of created) {
        try {
          await deleteIfCreated(gate.cli, repo)
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error))
        }
      }
      if (createSucceeded && created.length === 0) {
        errors.push(`created ${name} but could not resolve owner/name for origin repo delete`)
      }
      if (errors.length) {
        throw new Error(`Failed to delete disposable live repo(s): ${errors.join("; ")}`)
      }
    }
  })
})
