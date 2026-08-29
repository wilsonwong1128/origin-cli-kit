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

async function liveGate(): Promise<{ cli: string; owner: string } | null> {
  const cli = await resolveOriginCli()
  if (!cli) return null
  const status = await runOrigin(cli, ["auth", "status"]).catch((error: Error) => ({
    stdout: "",
    stderr: error.message,
  }))
  const raw = `${status.stdout}\n${status.stderr}`
  if (!/Token:\s+valid/i.test(raw)) return null
  const listed = await runOrigin(cli, ["repo", "list"]).catch(() => null)
  if (!listed) return null
  const first = listed.stdout
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.includes("/") && !line.startsWith("http"))
  const owner = first?.split("/")[0]
  if (!owner) return null
  return { cli, owner }
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
    let fullName = `${gate.owner}/${name}`
    assertDisposableName(fullName)

    const created: string[] = []
    try {
      const createArgs = ["repo", "create", name]
      expect(createArgs).not.toContain("create-mirrored")
      expect(createArgs.join(" ")).not.toMatch(/mirror/)
      await runOrigin(gate.cli, createArgs)
      created.push(fullName)

      const viewed = await runOrigin(gate.cli, ["repo", "view", name, "--json", "org,name,visibility"]).catch(
        async () => runOrigin(gate.cli, ["repo", "view", name, "--json", "org,name"]),
      )
      const parsed = JSON.parse(viewed.stdout) as { org?: string; name?: string; visibility?: string }
      if (parsed.org && parsed.name) {
        fullName = `${parsed.org}/${parsed.name}`
        assertDisposableName(fullName)
        created[0] = fullName
      }
      if (parsed.visibility && !/private|internal/i.test(parsed.visibility)) {
        throw new Error(`Created repo visibility was ${parsed.visibility}; expected Internal/Private`)
      }
    } finally {
      const errors: string[] = []
      for (const repo of created) {
        try {
          await deleteIfCreated(gate.cli, repo)
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error))
        }
      }
      if (errors.length) {
        throw new Error(`Failed to delete disposable live repo(s): ${errors.join("; ")}`)
      }
    }
  })
})
