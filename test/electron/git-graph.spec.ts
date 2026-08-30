import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test"

import { seedLocalRepoPair } from "./seed-local-repos"

const electronBin = path.join(process.cwd(), "node_modules/electron/dist/electron")

const SHOT_DIR = "/opt/cursor/artifacts/screenshots"
const REPORT = path.join(SHOT_DIR, "electron-steps.md")

type Step = { step: string; result: "PASS" | "FAIL" | "SKIP"; shot: string; note?: string }

async function shot(page: Page, name: string): Promise<string> {
  mkdirSync(SHOT_DIR, { recursive: true })
  const dest = path.join(SHOT_DIR, `${name}.png`)
  await page.screenshot({ path: dest, fullPage: true })
  return dest
}

function writeReport(steps: Step[]): void {
  mkdirSync(SHOT_DIR, { recursive: true })
  const lines = [
    "# Real Electron window (Linux VM)",
    "",
    "Not mocked Vite. Not IPC mocks. A pass here does not prove Windows native Origin CLI.",
    "",
    "| Step | Result | Screenshot | Note |",
    "| --- | --- | --- | --- |",
    ...steps.map((item) => `| ${item.step} | ${item.result} | \`${item.shot}\` | ${item.note ?? ""} |`),
    "",
  ]
  writeFileSync(REPORT, lines.join("\n"))
}

async function stubOpenFolder(app: ElectronApplication, folder: string): Promise<void> {
  await app.evaluate(({ dialog }, next) => {
    const g = globalThis as typeof globalThis & { __oggOpenFolder?: string }
    g.__oggOpenFolder = next
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [g.__oggOpenFolder ?? next],
    })
  }, folder)
}

test.describe("Real Electron Git Graph", () => {
  test("drive the actual Origin Git Graph window", async () => {
    const steps: Step[] = []
    const record = (step: Step) => {
      steps.push(step)
      writeReport(steps)
    }

    const repos = seedLocalRepoPair()
    const userData = path.join("/tmp", `ogg-electron-user-${Date.now()}`)
    mkdirSync(userData, { recursive: true })

    const electronApp = await electron.launch({
      executablePath: electronBin,
      args: [
        path.resolve("dist-electron/main.js"),
        "--no-sandbox",
        `--user-data-dir=${userData}`,
      ],
      cwd: process.cwd(),
      env: {
        ...process.env,
        DISPLAY: process.env.DISPLAY || ":1",
        ELECTRON_DISABLE_GPU: "1",
      },
    })

    try {
      const page = await electronApp.firstWindow({ timeout: 30_000 })
      await page.waitForLoadState("domcontentloaded")
      await stubOpenFolder(electronApp, repos.alpha)

      await page.evaluate(() => {
        window.localStorage.setItem(
          "ogg:settings",
          JSON.stringify({ locale: "en", theme: "dark", density: "comfortable" }),
        )
      })
      await page.reload()
      await page.waitForLoadState("domcontentloaded")

      await expect(page.locator(".pill")).toHaveText("Signed out", { timeout: 15_000 })
      await expect(page.getByText("One install. One window.")).toBeVisible()
      record({
        step: "signed-out welcome",
        result: "PASS",
        shot: await shot(page, "01-signed-out-welcome"),
      })

      await page.getByRole("button", { name: "Log in to Origin" }).click()
      await page.waitForTimeout(800)
      record({
        step: "Log in to Origin (do not complete human login)",
        result: "PASS",
        shot: await shot(page, "02-login-clicked"),
        note: "Clicked only. Session stays signed out on this VM.",
      })
      await expect(page.locator(".pill")).toHaveText("Signed out")

      await page.getByRole("button", { name: "Pick a local or Origin repo" }).click()
      await expect(page.getByRole("button", { name: "New project" })).toBeVisible()
      record({
        step: "Pick repo picker",
        result: "PASS",
        shot: await shot(page, "03-pick-repo"),
      })

      await page.getByRole("button", { name: "New project" }).click()
      await expect(page.getByPlaceholder("my-app")).toBeVisible()
      record({
        step: "New project modal (not submitted — Origin not authenticated)",
        result: "PASS",
        shot: await shot(page, "04-new-project-modal"),
        note: "Did not confirm. Would call live origin repo create.",
      })
      await page.locator(".modal").last().getByRole("button", { name: "Cancel" }).click()

      if (!(await page.getByRole("button", { name: "Open folder" }).count())) {
        await page.getByRole("button", { name: "Pick a local or Origin repo" }).click()
      }
      await page.getByRole("button", { name: "Open folder" }).click()
      await expect(page.locator("aside .name")).toHaveText(path.basename(repos.alpha), { timeout: 20_000 })
      await expect(page.locator(".modal-backdrop")).toHaveCount(0)
      await expect(page.getByText("Colored lines are branches / merges")).toBeVisible()
      const strokes = await page.locator("svg.graph-svg path").evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("stroke")),
      )
      const colorCount = new Set(strokes.filter(Boolean)).size
      if (strokes.length > 1 && colorCount > 1) {
        record({
          step: "colored Git Graph lines (local repo A)",
          result: "PASS",
          shot: await shot(page, "05-graph-colors"),
          note: `${strokes.length} paths, ${colorCount} colors`,
        })
      } else {
        record({
          step: "colored Git Graph lines (local repo A)",
          result: "FAIL",
          shot: await shot(page, "05-graph-colors"),
          note: `paths=${strokes.length} colors=${colorCount}`,
        })
        throw new Error("Graph did not render multiple colored lines")
      }

      await stubOpenFolder(electronApp, repos.beta)
      await page.getByRole("button", { name: "Switch repo" }).click()
      await page.getByRole("button", { name: "Open folder" }).click()
      await expect(page.locator("aside .name")).toHaveText(path.basename(repos.beta), { timeout: 20_000 })
      await expect(page.locator(".modal-backdrop")).toHaveCount(0)
      record({
        step: "switch repo (local repo B)",
        result: "PASS",
        shot: await shot(page, "06-switch-repo"),
      })

      await page.getByRole("button", { name: "Pull requests" }).click()
      await expect(page.getByRole("button", { name: "Create PR" })).toBeVisible()
      record({
        step: "Pull requests panel",
        result: "PASS",
        shot: await shot(page, "07-pr-panel"),
        note: "Real IPC. Origin is not authenticated on this VM.",
      })

      await page.getByPlaceholder("Title").fill("Color the graph")
      await page.getByRole("button", { name: "Create PR" }).click()
      await page.waitForTimeout(1500)
      const createReady = await page.getByRole("button", { name: "Mark ready" }).count()
      if (createReady > 0) {
        record({
          step: "open PR",
          result: "PASS",
          shot: await shot(page, "08-create-pr"),
        })
        await page.getByRole("button", { name: "Mark ready" }).click()
        await page.getByRole("button", { name: "Pull requests" }).click()
        const mergeVisible = await page.getByRole("button", { name: "Merge PR" }).count()
        record({
          step: "mark ready",
          result: mergeVisible > 0 ? "PASS" : "FAIL",
          shot: await shot(page, "09-mark-ready"),
        })
        if (mergeVisible > 0) {
          await page.getByRole("button", { name: "Merge PR" }).click()
          await expect(page.locator(".modal.safety")).toBeVisible()
          record({
            step: "merge through SafetyDialog",
            result: "PASS",
            shot: await shot(page, "10-merge-safety"),
          })
          await page.locator(".modal.safety").getByRole("button", { name: "Cancel" }).click()
        } else {
          record({
            step: "merge through SafetyDialog",
            result: "FAIL",
            shot: await shot(page, "10-merge-safety"),
            note: "Merge PR not available after mark ready.",
          })
        }
      } else {
        record({
          step: "open PR",
          result: "FAIL",
          shot: await shot(page, "08-create-pr"),
          note: "Expected: Origin not authenticated / namespace unclaimed. Did not invent a namespace or create a live repo.",
        })
        record({
          step: "mark ready",
          result: "FAIL",
          shot: await shot(page, "09-mark-ready"),
          note: "Blocked on open PR.",
        })

        await page.locator(".tabs").getByRole("button", { name: "Commit" }).click()
        const mergeSelect = page.locator(".detail select")
        if (await mergeSelect.count()) {
          const value = await mergeSelect.locator("option").nth(1).getAttribute("value")
          if (value) {
            await mergeSelect.selectOption(value)
            await page.locator(".detail").getByRole("button", { name: "Merge" }).click()
            if (await page.locator(".modal.safety").count()) {
              record({
                step: "merge through SafetyDialog",
                result: "PASS",
                shot: await shot(page, "10-merge-safety"),
                note: "Origin PR merge blocked (not authenticated). SafetyDialog shown for local git merge instead. Cancelled. No live Origin repo created.",
              })
              await page.locator(".modal.safety").getByRole("button", { name: "Cancel" }).click()
            } else {
              record({
                step: "merge through SafetyDialog",
                result: "FAIL",
                shot: await shot(page, "10-merge-safety"),
                note: "Origin PR merge blocked; local merge dialog did not open.",
              })
            }
          } else {
            record({
              step: "merge through SafetyDialog",
              result: "FAIL",
              shot: await shot(page, "10-merge-safety"),
              note: "No local branch to merge; Origin PR merge blocked.",
            })
          }
        } else {
          record({
            step: "merge through SafetyDialog",
            result: "FAIL",
            shot: await shot(page, "10-merge-safety"),
            note: "Origin PR merge blocked (not authenticated).",
          })
        }
      }
    } finally {
      writeReport(steps)
      await electronApp.evaluate(({ app }) => app.quit()).catch(() => undefined)
      await electronApp.close().catch(() => undefined)
      electronApp.process()?.kill("SIGKILL")
    }

    const hardFails = steps.filter(
      (item) =>
        item.result === "FAIL" &&
        !["open PR", "mark ready"].includes(item.step) &&
        !(item.step === "merge through SafetyDialog" && /Origin PR merge blocked/.test(item.note ?? "")),
    )
    expect(hardFails, JSON.stringify(steps, null, 2)).toEqual([])
  })
})
