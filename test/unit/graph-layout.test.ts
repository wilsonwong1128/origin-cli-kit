import { describe, expect, it } from "vitest"

import { laneCount, layoutGraph, renderGlyph } from "../../shared/graph-layout"
import type { GitCommit } from "../../shared/types"

function commit(hash: string, parents: string[], refs: string[] = []): GitCommit {
  return {
    hash,
    shortHash: hash.slice(0, 7),
    parents,
    author: "Ogg Tester",
    email: "ogg-tester@local",
    date: "2026-03-02T09:10:00Z",
    subject: hash,
    refs,
  }
}

describe("layoutGraph", () => {
  it("returns no rows for an empty history", () => {
    expect(layoutGraph([])).toEqual([])
    expect(laneCount([])).toBe(1)
  })

  it("keeps a linear history on a single colored lane", () => {
    const rows = layoutGraph([commit("c", ["b"]), commit("b", ["a"]), commit("a", [])])
    expect(rows).toHaveLength(3)
    expect(rows.every((row) => row.column === 0)).toBe(true)
    expect(rows.every((row) => row.color === 0)).toBe(true)
    expect(rows[0]?.lines).toEqual([{ from: 0, to: 0, color: 0 }])
    expect(laneCount(rows)).toBe(1)
  })

  it("opens a second lane for a merge's extra parent and draws a colored connector", () => {
    const rows = layoutGraph([
      commit("m", ["main", "feat"], ["HEAD → main"]),
      commit("feat", ["base"], ["feature/login"]),
      commit("main", ["base"]),
      commit("base", []),
    ])

    expect(rows[0]?.column).toBe(0)
    expect(rows[0]?.lines.some((line) => line.from === 0 && line.to === 1)).toBe(true)
    expect(new Set(rows[0]?.lines.map((line) => line.color)).size).toBeGreaterThan(1)
    expect(laneCount(rows)).toBeGreaterThanOrEqual(2)

    const mergeGlyph = renderGlyph(rows[0]!, laneCount(rows))
    expect(mergeGlyph).toContain("●")
    expect(mergeGlyph === "●" || /[│╱╲]/.test(mergeGlyph)).toBe(true)
  })

  it("reuses a freed lane instead of growing forever after a branch joins", () => {
    const rows = layoutGraph([
      commit("m", ["c", "f"]),
      commit("f", ["b"]),
      commit("c", ["b"]),
      commit("b", ["a"]),
      commit("a", []),
    ])
    expect(laneCount(rows)).toBeLessThanOrEqual(2)
    expect(Math.max(...rows.map((row) => row.column))).toBeLessThanOrEqual(1)
  })

  it("dedupes identical line keys on a commit", () => {
    const rows = layoutGraph([commit("c", ["p", "p"]), commit("p", [])])
    const keys = rows[0]?.lines.map((line) => `${line.from}->${line.to}:${line.color}`) ?? []
    expect(keys).toEqual([...new Set(keys)])
  })
})

describe("renderGlyph", () => {
  it("marks the commit column with a bullet and continuing lanes with bars", () => {
    const row = {
      commit: commit("c", ["p"]),
      column: 0,
      color: 0,
      lines: [
        { from: 0, to: 0, color: 0 },
        { from: 1, to: 1, color: 1 },
      ],
    }
    expect(renderGlyph(row, 2)).toBe("●│")
  })

  it("draws a right-merge slash and a left-merge backslash", () => {
    const right = {
      commit: commit("r", ["a"]),
      column: 0,
      color: 0,
      lines: [{ from: 0, to: 1, color: 1 }],
    }
    const left = {
      commit: commit("l", ["a"]),
      column: 1,
      color: 1,
      lines: [{ from: 1, to: 0, color: 0 }],
    }
    expect(renderGlyph(right, 2)).toBe("●│")
    expect(renderGlyph(left, 2)).toBe("│●")
    expect(
      renderGlyph(
        {
          commit: commit("pass", ["a"]),
          column: 2,
          color: 2,
          lines: [
            { from: 0, to: 1, color: 1 },
            { from: 2, to: 1, color: 2 },
          ],
        },
        3,
      ),
    ).toBe("╲│●")
  })
})
