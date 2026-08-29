import { useEffect, useMemo, useState } from "react"

import type { GitOp } from "../shared/git-ops"
import type { OriginPullRequest, OriginRepo } from "../shared/origin"
import { BRANCH_TYPES, composeBranchName, type BranchType, type SafetyLevel } from "../shared/safety"
import type { AuthStatus, CommitDetail, GraphPayload, WorkingTree } from "../shared/types"
import { appendAudit, readAudit } from "./audit"
import { CommitGraph } from "./CommitGraph"
import { translate, type MessageKey } from "./i18n"
import { readRecents, rememberRepo, type RecentRepo } from "./recents"
import { SafetyDialog } from "./SafetyDialog"
import {
  applySettings,
  readSettings,
  writeSettings,
  type AppSettings,
} from "./settings"

function isDraft(status: string): boolean {
  return /draft/i.test(status)
}

function isOpen(status: string): boolean {
  return /open|ready/i.test(status) && !isDraft(status)
}

type Pending =
  | { kind: "pull" }
  | { kind: "push" }
  | { kind: "merge"; branch: string }
  | { kind: "discard"; paths: string[] }
  | { kind: "delete"; name: string; force: boolean }
  | { kind: "logout" }
  | { kind: "stashPop" }
  | { kind: "checkout"; branch: string }
  | { kind: "prMerge"; number: number }
  | { kind: "update" }
  | { kind: "uninstall" }
  | { kind: "uninstallWipe" }

export function App() {
  const [settings, setSettings] = useState<AppSettings>(() => readSettings())
  const t = (key: MessageKey) => translate(settings.locale, key)

  const [graph, setGraph] = useState<GraphPayload | null>(null)
  const [tree, setTree] = useState<WorkingTree | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<CommitDetail | null>(null)
  const [query, setQuery] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const [recents, setRecents] = useState<RecentRepo[]>(() => readRecents())
  const [originRepos, setOriginRepos] = useState<OriginRepo[] | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [cloneOpen, setCloneOpen] = useState(false)
  const [clonePick, setClonePick] = useState("")
  const [cloneParent, setCloneParent] = useState("")
  const [cloneFolder, setCloneFolder] = useState("")
  const [newOpen, setNewOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [branchOpen, setBranchOpen] = useState(false)
  const [branchType, setBranchType] = useState<BranchType>("feature")
  const [branchName, setBranchName] = useState("")
  const [branchCheckout, setBranchCheckout] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [center, setCenter] = useState<"graph" | "changes">("graph")
  const [rightTab, setRightTab] = useState<"commit" | "pr">("commit")
  const [prs, setPrs] = useState<OriginPullRequest[]>([])
  const [prError, setPrError] = useState<string | null>(null)
  const [prTitle, setPrTitle] = useState("")
  const [prBody, setPrBody] = useState("")
  const [prDraft, setPrDraft] = useState(true)
  const [commitMsg, setCommitMsg] = useState("")
  const [pending, setPending] = useState<Pending | null>(null)
  const [audit, setAudit] = useState(() => readAudit())
  const [mergeBranch, setMergeBranch] = useState("")

  useEffect(() => {
    applySettings(settings)
  }, [settings])

  useEffect(() => {
    void refreshAuth()
  }, [])

  async function refreshAuth() {
    try {
      setAuth(await window.desktop.authStatus())
    } catch (err) {
      setAuth({ loggedIn: false, method: null, raw: err instanceof Error ? err.message : String(err) })
    }
  }

  async function showRepo(repoPath: string) {
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const payload = await window.desktop.loadGraph(repoPath)
      setGraph(payload)
      setTree(await window.desktop.loadStatus(payload.repo.path))
      setRecents(
        rememberRepo({
          path: payload.repo.path,
          name: payload.repo.name,
          origin: payload.repo.originRemote
            ? `${payload.repo.originRemote.owner}/${payload.repo.originRemote.repo}`
            : undefined,
        }),
      )
      const first = payload.rows[0]?.commit.hash ?? null
      setSelected(first)
      setDetail(first ? await window.desktop.loadCommit(payload.repo.path, first) : null)
      await refreshPullRequests(payload)
      setPickerOpen(false)
      setCloneOpen(false)
    } catch (err) {
      setGraph(null)
      setDetail(null)
      setError(err instanceof Error ? err.message : t("noRepo"))
    } finally {
      setLoading(false)
    }
  }

  async function refreshAll(path = graph?.repo.path) {
    if (!path) return
    const payload = await window.desktop.loadGraph(path)
    setGraph(payload)
    setTree(await window.desktop.loadStatus(path))
  }

  async function refreshPullRequests(payload = graph) {
    if (!payload?.repo.originRemote) {
      setPrs([])
      setPrError(payload ? t("unbound") : null)
      return
    }
    try {
      setPrs(
        await window.desktop.listPullRequests(
          payload.repo.path,
          `${payload.repo.originRemote.owner}/${payload.repo.originRemote.repo}`,
        ),
      )
      setPrError(null)
    } catch (err) {
      setPrs([])
      setPrError(err instanceof Error ? err.message : t("noPr"))
    }
  }

  function record(op: string, level: SafetyLevel, detailText: string) {
    setAudit(appendAudit({ op, repo: graph?.repo.path ?? "", level, detail: detailText }))
  }

  async function runOp(action: GitOp, level: SafetyLevel) {
    if (!graph) return
    setLoading(true)
    setError(null)
    try {
      const output = await window.desktop.gitOp(graph.repo.path, action)
      record(action.op, level, output.slice(0, 240) || action.op)
      setNotice(action.op)
      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : action.op)
    } finally {
      setLoading(false)
    }
  }

  async function selectCommit(hash: string) {
    if (!graph) return
    setSelected(hash)
    setRightTab("commit")
    try {
      setDetail(await window.desktop.loadCommit(graph.repo.path, hash))
    } catch (err) {
      setError(err instanceof Error ? err.message : hash)
    }
  }

  async function openClone() {
    setError(null)
    try {
      setOriginRepos(await window.desktop.listOriginRepos())
      setCloneOpen(true)
      setPickerOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t("clone"))
    }
  }

  async function doClone() {
    if (!clonePick || !cloneParent) return
    setLoading(true)
    try {
      const dest = await window.desktop.cloneOriginRepo(clonePick, cloneParent, cloneFolder || undefined)
      record("clone", "reversible", dest)
      await showRepo(dest)
    } catch (err) {
      setError(err instanceof Error ? err.message : t("clone"))
    } finally {
      setLoading(false)
    }
  }

  async function createProject() {
    const name = newName.trim()
    if (!name) return
    const parent = await window.desktop.openFolder()
    if (!parent) return
    setLoading(true)
    try {
      const dest = await window.desktop.createOriginRepo(name, parent)
      setNewOpen(false)
      setNewName("")
      await showRepo(dest)
    } catch (err) {
      setError(err instanceof Error ? err.message : t("newProject"))
    } finally {
      setLoading(false)
    }
  }

  async function createBranch() {
    if (!graph || !branchName.trim()) return
    setLoading(true)
    try {
      const name = composeBranchName(branchType, branchName)
      await window.desktop.gitOp(graph.repo.path, {
        op: "createBranch",
        type: branchType,
        name: branchName,
        checkout: branchCheckout,
      })
      record("createBranch", "info", name)
      setBranchOpen(false)
      setBranchName("")
      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : t("branch"))
    } finally {
      setLoading(false)
    }
  }

  async function commitChanges() {
    if (!graph || !commitMsg.trim()) return
    await runOp({ op: "commit", message: commitMsg }, "reversible")
    setCommitMsg("")
  }

  async function resolvePending() {
    if (!pending) return
    const current = pending
    setPending(null)
    if (current.kind === "logout") {
      try {
        await window.desktop.authLogout()
        record("logout", "destructive", "logout")
        await refreshAuth()
      } catch (err) {
        setError(err instanceof Error ? err.message : t("logout"))
      }
      return
    }
    if (current.kind === "update") {
      record("update", "reversible", "schedule")
      setNotice(t("updating"))
      await window.desktop.scheduleUpdate()
      return
    }
    if (current.kind === "uninstall" || current.kind === "uninstallWipe") {
      record("uninstall", "irreversible", current.kind)
      await window.desktop.scheduleUninstall(current.kind === "uninstallWipe")
      return
    }
    if (current.kind === "prMerge" && graph?.repo.originRemote) {
      try {
        await window.desktop.mergePullRequest(
          graph.repo.path,
          current.number,
          `${graph.repo.originRemote.owner}/${graph.repo.originRemote.repo}`,
        )
        record("mergePr", "destructive", `#${current.number}`)
        await refreshPullRequests()
        await refreshAll()
      } catch (err) {
        setPrError(err instanceof Error ? err.message : t("mergePr"))
      }
      return
    }
    const map: Record<string, GitOp | null> = {
      pull: { op: "pull" },
      push: { op: "push" },
      merge: current.kind === "merge" ? { op: "merge", branch: current.branch } : null,
      discard: current.kind === "discard" ? { op: "discard", paths: current.paths } : null,
      delete: current.kind === "delete" ? { op: "deleteBranch", name: current.name, force: current.force } : null,
      stashPop: { op: "stashPop" },
      checkout: current.kind === "checkout" ? { op: "checkout", branch: current.branch } : null,
    }
    const action = map[current.kind]
    if (action) {
      await runOp(
        action,
        current.kind === "discard" || (current.kind === "delete" && current.force) ? "irreversible" : "destructive",
      )
    }
  }

  const dimmed = useMemo(() => {
    const hashes = new Set<string>()
    if (!graph) return hashes
    const q = query.trim().toLowerCase()
    if (!q) return hashes
    for (const row of graph.rows) {
      const hit =
        row.commit.subject.toLowerCase().includes(q) ||
        row.commit.author.toLowerCase().includes(q) ||
        row.commit.hash.toLowerCase().includes(q) ||
        row.commit.refs.some((ref) => ref.toLowerCase().includes(q))
      if (!hit) hashes.add(row.commit.hash)
    }
    return hashes
  }, [graph, query])

  const branchPreview = branchName.trim() ? composeBranchName(branchType, branchName) : ""
  const destPreview = cloneParent && clonePick ? `${cloneParent.replace(/[\\/]$/, "")}/${cloneFolder || clonePick.split("/")[1]}` : ""

  const pendingMeta = pending
    ? pending.kind === "discard"
      ? { title: t("discard"), body: t("confirmDiscard"), level: "irreversible" as const, word: t("discardWord") }
      : pending.kind === "delete"
        ? { title: t("deleteBranch"), body: t("confirmDelete"), level: "irreversible" as const, word: t("deleteWord") }
        : pending.kind === "logout"
          ? { title: t("logout"), body: t("confirmLogout"), level: "destructive" as const }
          : pending.kind === "pull"
            ? { title: t("pull"), body: t("confirmPull"), level: "destructive" as const }
            : pending.kind === "push"
              ? { title: t("push"), body: t("confirmPush"), level: "reversible" as const }
              : pending.kind === "merge" || pending.kind === "prMerge"
                ? { title: t("merge"), body: t("confirmMerge"), level: "destructive" as const }
                : pending.kind === "stashPop"
                  ? { title: t("stashPop"), body: t("confirmStashPop"), level: "destructive" as const }
                  : pending.kind === "update"
                    ? { title: t("update"), body: t("confirmUpdate"), level: "reversible" as const }
                    : pending.kind === "uninstall"
                      ? { title: t("uninstall"), body: t("confirmUninstall"), level: "destructive" as const }
                      : pending.kind === "uninstallWipe"
                        ? {
                            title: t("uninstallWipe"),
                            body: t("confirmUninstallWipe"),
                            level: "irreversible" as const,
                            word: t("uninstallWord"),
                          }
                        : { title: t("checkout"), body: t("confirmCheckoutDirty"), level: "destructive" as const }
    : null

  return (
    <div className="app">
      <header className="titlebar">
        <div className="brand">
          <span className="mark" />
          <div>
            <p className="eyebrow">{t("desktop")}</p>
            <h1>{t("app")}</h1>
          </div>
        </div>
        <nav className="toolbar">
          <button type="button" disabled={!graph || loading} onClick={() => void runOp({ op: "fetch" }, "info")}>
            {t("fetch")}
          </button>
          <button type="button" disabled={!graph || loading} onClick={() => setPending({ kind: "pull" })}>
            {t("pull")}
          </button>
          <button type="button" disabled={!graph || loading} onClick={() => setPending({ kind: "push" })}>
            {t("push")}
          </button>
          <button type="button" disabled={!graph} onClick={() => setCenter("changes")}>
            {t("commit")}
          </button>
          <button type="button" disabled={!graph} onClick={() => setBranchOpen(true)}>
            {t("branch")}
          </button>
          <button type="button" disabled={!graph || loading} onClick={() => void runOp({ op: "stash" }, "reversible")}>
            {t("stash")}
          </button>
        </nav>
        <div className="account">
          <span className={`pill ${auth?.loggedIn ? "ok" : ""}`}>
            {auth?.loggedIn ? t("loggedIn") : t("loggedOut")}
          </span>
          {auth?.loggedIn ? (
            <button type="button" className="ghost-btn" onClick={() => setPending({ kind: "logout" })}>
              {t("logout")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                void window.desktop.authLogin().then(() => setNotice(t("login")))
              }}
            >
              {t("login")}
            </button>
          )}
          <button type="button" className="ghost-btn" onClick={() => setSettingsOpen(true)}>
            {t("settings")}
          </button>
        </div>
      </header>

      {error && <div className="banner">{error}</div>}
      {notice && <div className="banner ok">{notice}</div>}
      {loading && <div className="banner muted">{t("loading")}</div>}

      {!graph && !loading && (
        <main className="welcome">
          <div className="card">
            <h2>{t("welcomeTitle")}</h2>
            <p>{t("welcomeBody")}</p>
            <div className="actions">
              <button type="button" onClick={() => setPickerOpen(true)}>
                {t("pickRepo")}
              </button>
              <button type="button" className="ghost-btn" onClick={() => void openClone()}>
                {t("clone")}
              </button>
              <button type="button" className="ghost-btn" onClick={() => void showRepoFromDemo()}>
                {t("demo")}
              </button>
            </div>
          </div>
        </main>
      )}

      {graph && (
        <div className="workspace">
          <aside>
            <p className="name">{graph.repo.name}</p>
            <p className="path">{graph.repo.path}</p>
            <p className={graph.repo.originRemote ? "origin" : "muted"}>
              {graph.repo.originRemote
                ? `${graph.repo.originRemote.owner}/${graph.repo.originRemote.repo}`
                : t("unbound")}
            </p>
            <p className="muted">
              {graph.repo.currentBranch}
              {graph.repo.aheadBehind ? ` · ${graph.repo.aheadBehind}` : ""}
              {graph.repo.dirty ? ` · ${t("dirty")}` : ""}
            </p>
            <div className="side-actions">
              <button type="button" className="ghost-btn" onClick={() => setPickerOpen(true)}>
                {t("switchRepo")}
              </button>
              <button type="button" className="ghost-btn" onClick={() => setCenter(center === "graph" ? "changes" : "graph")}>
                {center === "graph" ? t("changes") : t("graph")}
              </button>
            </div>
            <h3>{t("branches")}</h3>
            {graph.repo.refs
              .filter((ref) => ref.type === "branch")
              .map((ref) => (
                <div key={ref.name} className="branch-row">
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => {
                      if (graph.repo.dirty) setPending({ kind: "checkout", branch: ref.name })
                      else void runOp({ op: "checkout", branch: ref.name }, "reversible")
                    }}
                  >
                    {ref.name}
                    {ref.current ? " · HEAD" : ""}
                  </button>
                  {!ref.current && (
                    <button
                      type="button"
                      className="tiny"
                      onClick={() => setPending({ kind: "delete", name: ref.name, force: true })}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
          </aside>

          <section className="graph-pane">
            {center === "graph" ? (
              <>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search")} />
                <p className="count">
                  {query.trim() ? `${graph.rows.length - dimmed.size} / ` : ""}
                  {graph.rows.length} {t("commits")} · {t("graphLegend")}
                </p>
                {graph.rows.length === 0 ? (
                  <p className="muted pad">{t("noCommits")}</p>
                ) : (
                  <CommitGraph
                    rows={graph.rows}
                    laneCount={graph.laneCount}
                    selected={selected}
                    dimmed={dimmed}
                    locale={settings.locale}
                    onSelect={(hash) => void selectCommit(hash)}
                  />
                )}
              </>
            ) : (
              <div className="changes">
                <h2>{t("changes")}</h2>
                {!tree || tree.files.length === 0 ? (
                  <p className="muted">{t("noChanges")}</p>
                ) : (
                  <ul className="file-list">
                    {tree.files.map((file) => (
                      <li key={file.path}>
                        <span className="mono">
                          {file.index || " "}
                          {file.work || " "}
                        </span>
                        <span>{file.path}</span>
                        <span className="file-ops">
                          {file.unstaged && (
                            <button type="button" className="tiny" onClick={() => void runOp({ op: "stage", paths: [file.path] }, "info")}>
                              {t("stage")}
                            </button>
                          )}
                          {file.staged && (
                            <button type="button" className="tiny" onClick={() => void runOp({ op: "unstage", paths: [file.path] }, "info")}>
                              {t("unstage")}
                            </button>
                          )}
                          <button type="button" className="tiny" onClick={() => setPending({ kind: "discard", paths: [file.path] })}>
                            {t("discard")}
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <textarea value={commitMsg} onChange={(event) => setCommitMsg(event.target.value)} placeholder={t("message")} rows={4} />
                <div className="actions">
                  <button type="button" disabled={!commitMsg.trim() || !tree?.stagedCount} onClick={() => void commitChanges()}>
                    {t("commit")}
                  </button>
                  <button type="button" className="ghost-btn" disabled={!tree?.stashes.length} onClick={() => setPending({ kind: "stashPop" })}>
                    {t("stashPop")}
                  </button>
                </div>
                {tree?.stashes[0] && <p className="muted">{tree.stashes[0]}</p>}
              </div>
            )}
          </section>

          <section className="detail">
            <div className="tabs">
              <button type="button" className={rightTab === "commit" ? "" : "ghost-btn"} onClick={() => setRightTab("commit")}>
                Commit
              </button>
              <button
                type="button"
                className={rightTab === "pr" ? "" : "ghost-btn"}
                onClick={() => {
                  setRightTab("pr")
                  void refreshPullRequests()
                }}
              >
                {t("prs")}
              </button>
            </div>
            {rightTab === "commit" &&
              (detail ? (
                <>
                  <h2>{detail.subject}</h2>
                  <p className="mono">{detail.hash.slice(0, 10)}</p>
                  <p>
                    {detail.author} &lt;{detail.email}&gt;
                  </p>
                  <p className="muted">{detail.date}</p>
                  {detail.body && <pre>{detail.body}</pre>}
                  <h3>
                    {t("changes")} · {detail.files.length}
                  </h3>
                  <ul>
                    {detail.files.map((file) => (
                      <li key={`${file.status}-${file.path}`}>
                        {file.status} {file.from ? `${file.from} → ${file.path}` : file.path}
                      </li>
                    ))}
                  </ul>
                  <label className="field">
                    <span>{t("merge")}</span>
                    <select value={mergeBranch} onChange={(event) => setMergeBranch(event.target.value)}>
                      <option value="">{t("branches")}</option>
                      {graph.repo.refs
                        .filter((ref) => ref.type === "branch" && !ref.current)
                        .map((ref) => (
                          <option key={ref.name} value={ref.name}>
                            {ref.name}
                          </option>
                        ))}
                    </select>
                    <button type="button" disabled={!mergeBranch} onClick={() => setPending({ kind: "merge", branch: mergeBranch })}>
                      {t("merge")}
                    </button>
                  </label>
                </>
              ) : (
                <p className="muted">{t("graph")}</p>
              ))}

            {rightTab === "pr" && (
              <div className="pr-panel">
                {prError && <p className="muted">{prError}</p>}
                <input value={prTitle} onChange={(event) => setPrTitle(event.target.value)} placeholder={t("title")} />
                <textarea value={prBody} onChange={(event) => setPrBody(event.target.value)} placeholder={t("body")} rows={3} />
                <label className="check">
                  <input type="checkbox" checked={prDraft} onChange={(event) => setPrDraft(event.target.checked)} />
                  {t("draft")}
                </label>
                <button
                  type="button"
                  disabled={!graph.repo.originRemote || !prTitle.trim() || loading}
                  onClick={() => {
                    void window.desktop
                      .createPullRequest(graph.repo.path, {
                        title: prTitle.trim(),
                        body: prBody.trim() || undefined,
                        draft: prDraft,
                        fullName: `${graph.repo.originRemote?.owner}/${graph.repo.originRemote?.repo}`,
                      })
                      .then(() => refreshPullRequests())
                  }}
                >
                  {t("createPr")}
                </button>
                {prs.length === 0 && <p className="muted">{t("noPr")}</p>}
                {prs.map((pr) => (
                  <div key={pr.number} className="pr-item">
                    <p>
                      <strong>
                        #{pr.number} {pr.title}
                      </strong>
                    </p>
                    <p className="muted">
                      {pr.status} · {pr.headRef} → {pr.baseRef}
                    </p>
                    <div className="actions">
                      {isDraft(pr.status) && (
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => void window.desktop.markPullRequestReady(graph.repo.path, pr.number)}
                        >
                          {t("markReady")}
                        </button>
                      )}
                      {isOpen(pr.status) && (
                        <button type="button" onClick={() => setPending({ kind: "prMerge", number: pr.number })}>
                          {t("mergePr")}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <footer className="statusbar">
        <span>{graph ? graph.repo.currentBranch : t("noRepo")}</span>
        <span>{auth?.method ?? t("loggedOut")}</span>
        <span>{settings.locale}</span>
      </footer>

      {pickerOpen && (
        <div className="modal-backdrop" onClick={() => setPickerOpen(false)}>
          <div className="modal wide" onClick={(event) => event.stopPropagation()}>
            <h2>{t("pickRepo")}</h2>
            <div className="repo-list">
              {recents.map((repo) => (
                <button key={repo.path} type="button" onClick={() => void showRepo(repo.path)}>
                  <strong>{repo.name}</strong>
                  <span className="muted">{repo.origin ?? repo.path}</span>
                </button>
              ))}
            </div>
            <div className="actions">
              <button type="button" onClick={() => void window.desktop.openFolder().then((folder) => folder && showRepo(folder))}>
                {t("openFolder")}
              </button>
              <button type="button" className="ghost-btn" onClick={() => void openClone()}>
                {t("clone")}
              </button>
              <button type="button" className="ghost-btn" onClick={() => void showRepoFromDemo()}>
                {t("demo")}
              </button>
              <button type="button" className="ghost-btn" onClick={() => setNewOpen(true)}>
                {t("newProject")}
              </button>
            </div>
          </div>
        </div>
      )}

      {cloneOpen && (
        <div className="modal-backdrop" onClick={() => setCloneOpen(false)}>
          <div className="modal wide" onClick={(event) => event.stopPropagation()}>
            <h2>{t("originRepos")}</h2>
            <div className="repo-list">
              {(originRepos ?? []).map((repo) => (
                <button
                  key={repo.fullName}
                  type="button"
                  className={clonePick === repo.fullName ? "active-row" : ""}
                  onClick={() => {
                    setClonePick(repo.fullName)
                    setCloneFolder(repo.fullName.split("/")[1] ?? "")
                  }}
                >
                  {repo.fullName}
                </button>
              ))}
            </div>
            <label className="field">
              <span>{t("cloneWhere")}</span>
              <div className="row">
                <input value={cloneParent} onChange={(event) => setCloneParent(event.target.value)} />
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => void window.desktop.openFolder().then((folder) => folder && setCloneParent(folder))}
                >
                  {t("browse")}
                </button>
              </div>
            </label>
            <label className="field">
              <span>{t("folderName")}</span>
              <input value={cloneFolder} onChange={(event) => setCloneFolder(event.target.value)} />
            </label>
            {destPreview && (
              <p className="muted">
                {t("destPreview")}: <span className="mono">{destPreview}</span>
              </p>
            )}
            <div className="actions">
              <button type="button" disabled={!clonePick || !cloneParent || loading} onClick={() => void doClone()}>
                {t("clone")}
              </button>
              <button type="button" className="ghost-btn" onClick={() => setCloneOpen(false)}>
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {newOpen && (
        <div className="modal-backdrop" onClick={() => setNewOpen(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h2>{t("newProject")}</h2>
            <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="my-app" />
            <div className="actions">
              <button type="button" disabled={!newName.trim()} onClick={() => void createProject()}>
                {t("newProject")}
              </button>
              <button type="button" className="ghost-btn" onClick={() => setNewOpen(false)}>
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {branchOpen && (
        <div className="modal-backdrop" onClick={() => setBranchOpen(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h2>{t("branch")}</h2>
            <label className="field">
              <span>{t("branchType")}</span>
              <select value={branchType} onChange={(event) => setBranchType(event.target.value as BranchType)}>
                {BRANCH_TYPES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {t(item.id)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t("branchName")}</span>
              <input value={branchName} onChange={(event) => setBranchName(event.target.value)} />
            </label>
            {branchPreview && (
              <p className="muted">
                {t("preview")}: <span className="mono">{branchPreview}</span>
              </p>
            )}
            <label className="check">
              <input type="checkbox" checked={branchCheckout} onChange={(event) => setBranchCheckout(event.target.checked)} />
              {t("checkoutAfter")}
            </label>
            <div className="actions">
              <button type="button" disabled={!branchName.trim()} onClick={() => void createBranch()}>
                {t("branch")}
              </button>
              <button type="button" className="ghost-btn" onClick={() => setBranchOpen(false)}>
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="modal wide settings" onClick={(event) => event.stopPropagation()}>
            <h2>{t("settings")}</h2>
            <label className="field">
              <span>{t("language")}</span>
              <select
                value={settings.locale}
                onChange={(event) => setSettings(writeSettings({ ...settings, locale: event.target.value as AppSettings["locale"] }))}
              >
                <option value="zh-Hant">繁體中文</option>
                <option value="zh-Hans">简体中文</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="field">
              <span>{t("appearance")} · {t("theme")}</span>
              <select
                value={settings.theme}
                onChange={(event) => setSettings(writeSettings({ ...settings, theme: event.target.value as AppSettings["theme"] }))}
              >
                <option value="dark">{t("dark")}</option>
                <option value="light">{t("light")}</option>
                <option value="system">{t("system")}</option>
              </select>
            </label>
            <label className="field">
              <span>{t("density")}</span>
              <select
                value={settings.density}
                onChange={(event) => setSettings(writeSettings({ ...settings, density: event.target.value as AppSettings["density"] }))}
              >
                <option value="comfortable">{t("comfortable")}</option>
                <option value="compact">{t("compact")}</option>
              </select>
            </label>
            <h3>{t("safety")}</h3>
            <p className="muted">{t("safetyHint")}</p>
            <p className="muted">{t("nsisHint")}</p>
            <div className="actions">
              <button type="button" className="ghost-btn" onClick={() => void refreshAuth()}>
                {t("refreshAuth")}
              </button>
              <button type="button" onClick={() => setPending({ kind: "update" })}>
                {t("update")}
              </button>
              <button type="button" className="ghost-btn" onClick={() => setPending({ kind: "uninstall" })}>
                {t("uninstall")}
              </button>
              <button type="button" className="danger" onClick={() => setPending({ kind: "uninstallWipe" })}>
                {t("uninstallWipe")}
              </button>
            </div>
            <h3>{t("audit")}</h3>
            <div className="audit">
              {audit.length === 0 && <p className="muted">{t("emptyAudit")}</p>}
              {audit.slice(0, 12).map((event) => (
                <p key={`${event.at}-${event.op}`} className="muted">
                  {event.at.slice(11, 19)} · {event.level} · {event.op}
                </p>
              ))}
            </div>
            <button type="button" className="ghost-btn" onClick={() => setSettingsOpen(false)}>
              {t("close")}
            </button>
          </div>
        </div>
      )}

      {pending && pendingMeta && (
        <SafetyDialog
          title={pendingMeta.title}
          body={pendingMeta.body}
          level={pendingMeta.level}
          confirmWord={"word" in pendingMeta ? pendingMeta.word : undefined}
          t={t}
          onCancel={() => setPending(null)}
          onConfirm={() => void resolvePending()}
        />
      )}
    </div>
  )

  async function showRepoFromDemo() {
    await showRepo(await window.desktop.openDemo())
  }
}
