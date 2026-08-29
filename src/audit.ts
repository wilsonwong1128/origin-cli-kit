import type { AuditEvent } from "../shared/types"

const KEY = "ogg:audit"
const LIMIT = 80

export function readAudit(): AuditEvent[] {
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as AuditEvent[]) : []
  } catch {
    return []
  }
}

export function appendAudit(event: Omit<AuditEvent, "at">): AuditEvent[] {
  const next = [{ ...event, at: new Date().toISOString() }, ...readAudit()].slice(0, LIMIT)
  window.localStorage.setItem(KEY, JSON.stringify(next))
  return next
}
