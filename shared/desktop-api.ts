import type { GitOp } from "./git-ops"
import type { OriginPullRequest, OriginRepo } from "./origin"
import type { AuthStatus, CommitDetail, GraphPayload, WorkingTree } from "./types"

export type DesktopApi = {
  openFolder: () => Promise<string | null>
  loadGraph: (repoPath: string) => Promise<GraphPayload>
  loadCommit: (repoPath: string, hash: string) => Promise<CommitDetail>
  loadStatus: (repoPath: string) => Promise<WorkingTree>
  gitOp: (repoPath: string, action: GitOp) => Promise<string>
  listOriginRepos: () => Promise<OriginRepo[]>
  cloneOriginRepo: (fullName: string, parent: string, folder?: string) => Promise<string>
  createOriginRepo: (name: string, parent: string) => Promise<string>
  authStatus: () => Promise<AuthStatus>
  authLogin: () => Promise<string>
  authLogout: () => Promise<string>
  listPullRequests: (repoPath: string, fullName?: string) => Promise<OriginPullRequest[]>
  createPullRequest: (
    repoPath: string,
    input: { title: string; body?: string; draft?: boolean; base?: string; fullName?: string },
  ) => Promise<string>
  markPullRequestReady: (repoPath: string, number: number, fullName?: string) => Promise<string>
  mergePullRequest: (repoPath: string, number: number, fullName?: string) => Promise<string>
  openDemo: () => Promise<string>
  openPath: (target: string) => Promise<string>
  appInfo: () => Promise<{ version: string; root: string }>
  scheduleUpdate: () => Promise<string>
  scheduleUninstall: (wipe?: boolean) => Promise<string>
}
