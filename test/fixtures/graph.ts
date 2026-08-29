import { layoutGraph, laneCount } from "../../shared/graph-layout"
import type { GitCommit, GraphPayload, RepoInfo } from "../../shared/types"

export function makeCommit(
  hash: string,
  parents: string[],
  subject: string,
  refs: string[] = [],
): GitCommit {
  return {
    hash,
    shortHash: hash.slice(0, 7),
    parents,
    author: "Ogg Tester",
    email: "ogg-tester@local",
    date: "2026-03-16T10:05:00Z",
    subject,
    refs,
  }
}

export const sampleCommits: GitCommit[] = [
  makeCommit("aa11111aa11111aa11111aa11111aa11111aaa", ["bb22222bb22222bb22222bb22222bb22222bbb", "cc33333cc33333cc33333cc33333cc33333ccc"], "merge: graph colors", [
    "HEAD → main",
  ]),
  makeCommit("cc33333cc33333cc33333cc33333cc33333ccc", ["dd44444dd44444dd44444dd44444dd44444ddd"], "feat: color lines", [
    "feature/graph-ui",
  ]),
  makeCommit("bb22222bb22222bb22222bb22222bb22222bbb", ["dd44444dd44444dd44444dd44444dd44444ddd"], "docs: readme"),
  makeCommit("dd44444dd44444dd44444dd44444dd44444ddd", [], "chore: seed"),
]

export function sampleRepo(overrides: Partial<RepoInfo> = {}): RepoInfo {
  return {
    path: "/tmp/ogg-alpha",
    name: "ogg-alpha",
    currentBranch: "main",
    detached: false,
    refs: [
      { name: "main", hash: sampleCommits[0]!.hash, type: "branch", current: true },
      { name: "feature/graph-ui", hash: sampleCommits[1]!.hash, type: "branch", current: false },
    ],
    dirty: false,
    aheadBehind: null,
    remotes: [{ name: "origin", url: "https://origin.cursor.com/wilsonwong/ogg-test-alpha.git" }],
    originRemote: {
      owner: "wilsonwong",
      repo: "ogg-test-alpha",
      url: "https://origin.cursor.com/wilsonwong/ogg-test-alpha",
    },
    ...overrides,
  }
}

export function sampleGraph(repo: Partial<RepoInfo> = {}): GraphPayload {
  const rows = layoutGraph(sampleCommits)
  return {
    repo: sampleRepo(repo),
    rows,
    laneCount: laneCount(rows),
  }
}

export const betaGraph = sampleGraph({
  path: "/tmp/ogg-beta",
  name: "ogg-beta",
  originRemote: {
    owner: "wilsonwong",
    repo: "ogg-test-beta",
    url: "https://origin.cursor.com/wilsonwong/ogg-test-beta",
  },
})
