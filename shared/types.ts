export type GitRef = {
  name: string
  hash: string
  type: "branch" | "remote" | "tag"
  current: boolean
}

export type GitCommit = {
  hash: string
  shortHash: string
  parents: string[]
  author: string
  email: string
  date: string
  subject: string
  refs: string[]
}

export type GraphLine = {
  from: number
  to: number
  color: number
}

export type GraphRow = {
  commit: GitCommit
  column: number
  color: number
  lines: GraphLine[]
}

export type FileChange = {
  status: string
  path: string
  from?: string
}

export type CommitDetail = {
  hash: string
  subject: string
  body: string
  author: string
  email: string
  date: string
  parents: string[]
  refs: string[]
  files: FileChange[]
  stats: string
}

export type OriginRemote = {
  owner: string
  repo: string
  url: string
}

export type RepoInfo = {
  path: string
  name: string
  currentBranch: string
  detached: boolean
  refs: GitRef[]
  dirty: boolean
  aheadBehind: string | null
  remotes: { name: string; url: string }[]
  originRemote: OriginRemote | null
}

export type GraphPayload = {
  repo: RepoInfo
  rows: GraphRow[]
  laneCount: number
}

export type WorkFile = {
  path: string
  index: string
  work: string
  staged: boolean
  unstaged: boolean
}

export type WorkingTree = {
  files: WorkFile[]
  stagedCount: number
  unstagedCount: number
  stashes: string[]
}

export type AuthStatus = {
  loggedIn: boolean
  method: string | null
  raw: string
}

export type AuditEvent = {
  at: string
  op: string
  repo: string
  level: string
  detail: string
}
