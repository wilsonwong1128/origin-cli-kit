import { contextBridge, ipcRenderer } from "electron"

import type { GitOp } from "../shared/git-ops"
import type { OriginPullRequest, OriginRepo } from "../shared/origin"
import type { AuthStatus, CommitDetail, GraphPayload, WorkingTree } from "../shared/types"

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

const api: DesktopApi = {
  openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  loadGraph: (repoPath) => ipcRenderer.invoke("git:loadGraph", repoPath),
  loadCommit: (repoPath, hash) => ipcRenderer.invoke("git:loadCommit", repoPath, hash),
  loadStatus: (repoPath) => ipcRenderer.invoke("git:status", repoPath),
  gitOp: (repoPath, action) => ipcRenderer.invoke("git:op", repoPath, action),
  listOriginRepos: () => ipcRenderer.invoke("origin:list"),
  cloneOriginRepo: (fullName, parent, folder) => ipcRenderer.invoke("origin:cloneTo", fullName, parent, folder),
  createOriginRepo: (name, parent) => ipcRenderer.invoke("origin:create", name, parent),
  authStatus: () => ipcRenderer.invoke("origin:authStatus"),
  authLogin: () => ipcRenderer.invoke("origin:authLogin"),
  authLogout: () => ipcRenderer.invoke("origin:authLogout"),
  listPullRequests: (repoPath, fullName) => ipcRenderer.invoke("pr:list", repoPath, fullName),
  createPullRequest: (repoPath, input) => ipcRenderer.invoke("pr:create", repoPath, input),
  markPullRequestReady: (repoPath, number, fullName) =>
    ipcRenderer.invoke("pr:ready", repoPath, number, fullName),
  mergePullRequest: (repoPath, number, fullName) =>
    ipcRenderer.invoke("pr:merge", repoPath, number, fullName),
  openDemo: () => ipcRenderer.invoke("demo:open"),
  openPath: (target) => ipcRenderer.invoke("shell:openPath", target),
  appInfo: () => ipcRenderer.invoke("app:info"),
  scheduleUpdate: () => ipcRenderer.invoke("app:scheduleUpdate"),
  scheduleUninstall: (wipe) => ipcRenderer.invoke("app:scheduleUninstall", wipe),
}

contextBridge.exposeInMainWorld("desktop", api)
