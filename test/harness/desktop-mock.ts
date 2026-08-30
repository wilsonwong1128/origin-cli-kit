import type { DesktopApi } from "../../shared/desktop-api"
import type { OriginPullRequest } from "../../shared/origin"
import type { AuthStatus, CommitDetail, GraphPayload, WorkingTree } from "../../shared/types"
import { betaGraph, sampleCommits, sampleGraph } from "../fixtures/graph"

export type DesktopMock = DesktopApi & {
  calls: {
    createOriginRepo: Array<[string, string]>
    createPullRequest: Array<[string, { title: string; draft?: boolean }]>
    markReady: number[]
    mergePr: number[]
    gitOp: string[]
  }
  graphs: Map<string, GraphPayload>
  prs: OriginPullRequest[]
  setAuth: (next: AuthStatus) => void
}

const emptyTree: WorkingTree = { files: [], stagedCount: 0, unstagedCount: 0, stashes: [] }

function detailFor(hash: string, repoPath: string): CommitDetail {
  const commit = sampleCommits.find((item) => item.hash === hash) ?? sampleCommits[0]!
  return {
    hash: commit.hash,
    subject: commit.subject,
    body: `detail for ${repoPath}`,
    author: commit.author,
    email: commit.email,
    date: commit.date,
    parents: commit.parents,
    refs: commit.refs,
    files: [{ status: "M", path: "src/graph.js" }],
    stats: "1 file changed",
  }
}

export function createDesktopMock(overrides: Partial<DesktopApi> = {}): DesktopMock {
  const graphs = new Map<string, GraphPayload>([
    ["/tmp/ogg-alpha", sampleGraph()],
    ["/tmp/ogg-beta", betaGraph],
  ])
  let auth: AuthStatus = { loggedIn: false, method: null, raw: "Signed out (mocked)" }
  const prs: OriginPullRequest[] = []
  const calls: DesktopMock["calls"] = {
    createOriginRepo: [],
    createPullRequest: [],
    markReady: [],
    mergePr: [],
    gitOp: [],
  }

  const api: DesktopMock = {
    calls,
    graphs,
    prs,
    setAuth(next) {
      auth = next
    },
    openFolder: async () => "/tmp/ogg-parent",
    loadGraph: async (repoPath) => {
      const payload = graphs.get(repoPath)
      if (!payload) throw new Error(`no mocked graph for ${repoPath}`)
      return payload
    },
    loadCommit: async (repoPath, hash) => detailFor(hash, repoPath),
    loadStatus: async () => emptyTree,
    gitOp: async (_repoPath, action) => {
      calls.gitOp.push(action.op)
      return action.op
    },
    listOriginRepos: async () => [
      { fullName: "wilsonwong/ogg-test-alpha", url: "https://origin.cursor.com/wilsonwong/ogg-test-alpha.git" },
    ],
    cloneOriginRepo: async (_fullName, parent, folder) => `${parent}/${folder || "ogg-test-alpha"}`,
    createOriginRepo: async (name, parent) => {
      calls.createOriginRepo.push([name, parent])
      const dest = `${parent}/${name}`
      graphs.set(dest, sampleGraph({ path: dest, name }))
      return dest
    },
    authStatus: async () => auth,
    authLogin: async () => "Opening Origin login in the browser.",
    authLogout: async () => {
      auth = { loggedIn: false, method: null, raw: "logged out" }
      return "logged out"
    },
    listPullRequests: async () => [...prs],
    createPullRequest: async (repoPath, input) => {
      calls.createPullRequest.push([repoPath, input])
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
      calls.markReady.push(number)
      const pr = prs.find((item) => item.number === number)
      if (pr) pr.status = "open"
      return "ready"
    },
    mergePullRequest: async (_repoPath, number) => {
      calls.mergePr.push(number)
      const pr = prs.find((item) => item.number === number)
      if (pr) pr.status = "merged"
      return "merged"
    },
    openDemo: async () => "/tmp/ogg-alpha",
    openPath: async (target) => target,
    appInfo: async () => ({ version: "0.1.0", root: "/tmp/ogg" }),
    scheduleUpdate: async () => "scheduled",
    scheduleUninstall: async () => "scheduled",
    ...overrides,
  }

  return api
}

export function installDesktopMock(api: DesktopApi): void {
  window.desktop = api
}
