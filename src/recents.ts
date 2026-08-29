export type RecentRepo = {
  path: string
  name: string
  origin?: string
}

const KEY = "ogg:recents"

export function readRecents(): RecentRepo[] {
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as RecentRepo[]) : []
  } catch {
    return []
  }
}

export function rememberRepo(entry: RecentRepo): RecentRepo[] {
  const next = [entry, ...readRecents().filter((item) => item.path !== entry.path)].slice(0, 12)
  window.localStorage.setItem(KEY, JSON.stringify(next))
  return next
}
