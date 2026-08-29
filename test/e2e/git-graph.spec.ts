import { expect, test, type Page } from "@playwright/test"

async function injectMockedDesktop(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const commits = [
      {
        hash: "aa11111aa11111aa11111aa11111aa11111aaa",
        shortHash: "aa11111",
        parents: ["bb22222bb22222bb22222bb22222bb22222bbb", "cc33333cc33333cc33333cc33333cc33333ccc"],
        author: "Ogg Tester",
        email: "ogg-tester@local",
        date: "2026-03-16T10:05:00Z",
        subject: "merge: graph colors",
        refs: ["HEAD → main"],
      },
      {
        hash: "cc33333cc33333cc33333cc33333cc33333ccc",
        shortHash: "cc33333",
        parents: ["dd44444dd44444dd44444dd44444dd44444ddd"],
        author: "Ogg Tester",
        email: "ogg-tester@local",
        date: "2026-03-15T18:22:00Z",
        subject: "feat: color lines",
        refs: ["feature/graph-ui"],
      },
      {
        hash: "bb22222bb22222bb22222bb22222bb22222bbb",
        shortHash: "bb22222",
        parents: ["dd44444dd44444dd44444dd44444dd44444ddd"],
        author: "Ogg Tester",
        email: "ogg-tester@local",
        date: "2026-03-16T10:00:00Z",
        subject: "docs: readme",
        refs: [],
      },
      {
        hash: "dd44444dd44444dd44444dd44444dd44444ddd",
        shortHash: "dd44444",
        parents: [],
        author: "Ogg Tester",
        email: "ogg-tester@local",
        date: "2026-03-02T09:10:00Z",
        subject: "chore: seed",
        refs: [],
      },
    ]

    const palette = ["#60a5fa", "#34d399", "#fbbf24", "#c084fc"]
    const graphFor = (path: string, name: string, originRepo: string) => ({
      repo: {
        path,
        name,
        currentBranch: "main",
        detached: false,
        refs: [
          { name: "main", hash: commits[0].hash, type: "branch", current: true },
          { name: "feature/graph-ui", hash: commits[1].hash, type: "branch", current: false },
        ],
        dirty: false,
        aheadBehind: null,
        remotes: [{ name: "origin", url: `https://origin.cursor.com/wilsonwong/${originRepo}.git` }],
        originRemote: {
          owner: "wilsonwong",
          repo: originRepo,
          url: `https://origin.cursor.com/wilsonwong/${originRepo}`,
        },
      },
      rows: commits.map((commit, index) => ({
        commit,
        column: index === 1 ? 1 : 0,
        color: index === 1 ? 1 : 0,
        lines:
          index === 0
            ? [
                { from: 0, to: 0, color: 0 },
                { from: 0, to: 1, color: 1 },
              ]
            : [{ from: index === 1 ? 1 : 0, to: 0, color: index === 1 ? 1 : 0 }],
      })),
      laneCount: 2,
    })

    const graphs = {
      "/tmp/ogg-alpha": graphFor("/tmp/ogg-alpha", "ogg-alpha", "ogg-test-alpha"),
      "/tmp/ogg-beta": graphFor("/tmp/ogg-beta", "ogg-beta", "ogg-test-beta"),
    }
    const prs = []
    let openFolderPath = "/tmp/ogg-alpha"

    window.localStorage.setItem(
      "ogg:settings",
      JSON.stringify({ locale: "en", theme: "dark", density: "comfortable" }),
    )

    window.desktop = {
      openFolder: async () => openFolderPath,
      loadGraph: async (repoPath) => graphs[repoPath] || graphs["/tmp/ogg-alpha"],
      loadCommit: async (_repoPath, hash) => {
        const commit = commits.find((item) => item.hash === hash) || commits[0]
        return {
          hash: commit.hash,
          subject: commit.subject,
          body: "",
          author: commit.author,
          email: commit.email,
          date: commit.date,
          parents: commit.parents,
          refs: commit.refs,
          files: [{ status: "M", path: "src/graph.js" }],
          stats: "1 file changed",
        }
      },
      loadStatus: async () => ({ files: [], stagedCount: 0, unstagedCount: 0, stashes: [] }),
      gitOp: async () => "ok",
      listOriginRepos: async () => [],
      cloneOriginRepo: async () => "/tmp/ogg-alpha",
      createOriginRepo: async (name, parent) => {
        const dest = `${parent}/${name}`
        graphs[dest] = graphFor(dest, name, "ogg-test-alpha")
        return dest
      },
      authStatus: async () => ({ loggedIn: false, method: null, raw: "mocked signed out" }),
      authLogin: async () => "Opening Origin login in the browser.",
      authLogout: async () => "logged out",
      listPullRequests: async () => prs.slice(),
      createPullRequest: async (_repoPath, input) => {
        prs.push({
          number: prs.length + 1,
          title: input.title,
          status: input.draft === false ? "open" : "draft",
          headRef: "feature/graph-ui",
          baseRef: "main",
          url: "https://origin.cursor.com/wilsonwong/ogg-test-alpha/pull/1",
        })
        return "created"
      },
      markPullRequestReady: async (_repoPath, number) => {
        const pr = prs.find((item) => item.number === number)
        if (pr) pr.status = "open"
        return "ready"
      },
      mergePullRequest: async (_repoPath, number) => {
        const pr = prs.find((item) => item.number === number)
        if (pr) pr.status = "merged"
        return "merged"
      },
      openDemo: async () => "/tmp/ogg-alpha",
      openPath: async (target) => target,
      appInfo: async () => ({ version: "0.1.0", root: "/tmp/ogg" }),
      scheduleUpdate: async () => "scheduled",
      scheduleUninstall: async () => "scheduled",
      __setOpenFolder(next) {
        openFolderPath = next
      },
    }

    void palette
  })
}

test.describe("Git Graph (no Origin CLI, IPC mocked)", () => {
  test("signed out → new project → switch repo → colored lines → PR ready/merge", async ({ page }) => {
    await injectMockedDesktop(page)
    await page.goto("/")

    await expect(page.getByText("Signed out")).toBeVisible()
    await expect(page.getByRole("button", { name: "Log in to Origin" })).toBeVisible()
    await expect(page.getByText("One install. One window.")).toBeVisible()

    await page.getByRole("button", { name: "Pick a local or Origin repo" }).click()
    await page.getByRole("button", { name: "New project" }).click()
    await page.getByPlaceholder("my-app").fill("harbor-notes")
    await page.locator(".modal").last().getByRole("button", { name: "New project" }).click()

    await expect(page.getByText("harbor-notes")).toBeVisible()
    await expect(page.getByText("Colored lines are branches / merges")).toBeVisible()

    const strokes = await page.locator("svg.graph-svg path").evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("stroke")),
    )
    expect(strokes.length).toBeGreaterThan(1)
    expect(new Set(strokes).size).toBeGreaterThan(1)
    expect(strokes.every((stroke) => stroke && stroke !== "#000" && stroke !== "black")).toBe(true)

    await page.evaluate(() => {
      const desktop = window.desktop as { __setOpenFolder?: (path: string) => void }
      desktop.__setOpenFolder?.("/tmp/ogg-beta")
    })
    await page.getByRole("button", { name: "Switch repo" }).click()
    await page.getByRole("button", { name: "Open folder" }).click()
    await expect(page.getByText("ogg-beta")).toBeVisible()
    await expect(page.getByText("wilsonwong/ogg-test-beta")).toBeVisible()

    await page.getByRole("button", { name: "Pull requests" }).click()
    await page.getByPlaceholder("Title").fill("Ship colored graph")
    await page.getByRole("button", { name: "Create PR" }).click()
    await expect(page.getByText("#1 Ship colored graph")).toBeVisible()
    await page.getByRole("button", { name: "Mark ready" }).click()
    await page.getByRole("button", { name: "Pull requests" }).click()
    await page.getByRole("button", { name: "Merge PR" }).click()
    await expect(page.locator(".modal.safety")).toBeVisible()
    await page.locator(".modal.safety").getByRole("button", { name: "Confirm" }).click()
    await page.getByRole("button", { name: "Pull requests" }).click()
    await expect(page.getByText(/merged/i)).toBeVisible()
  })
})
