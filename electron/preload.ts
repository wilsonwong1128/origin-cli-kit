import { contextBridge, ipcRenderer } from "electron"

import type { DesktopApi } from "../shared/desktop-api"

export type { DesktopApi }

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
