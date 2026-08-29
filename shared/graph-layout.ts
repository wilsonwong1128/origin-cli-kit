import type { GitCommit, GraphLine, GraphRow } from "./types"

export function layoutGraph(commits: GitCommit[]): GraphRow[] {
  const lanes: (string | null)[] = []
  const colors: (number | null)[] = []
  let nextColor = 0
  const rows: GraphRow[] = []

  for (const commit of commits) {
    let column = lanes.indexOf(commit.hash)
    if (column === -1) {
      column = lanes.indexOf(null)
      if (column === -1) {
        column = lanes.length
        lanes.push(commit.hash)
        colors.push(nextColor++)
      } else {
        lanes[column] = commit.hash
        colors[column] = nextColor++
      }
    }

    const myColor = colors[column] ?? nextColor++
    colors[column] = myColor

    const nextLanes = [...lanes]
    const nextColors = [...colors]
    nextLanes[column] = null
    nextColors[column] = null

    commit.parents.forEach((parent, index) => {
      if (nextLanes.includes(parent)) return
      if (index === 0) {
        nextLanes[column] = parent
        nextColors[column] = myColor
        return
      }
      let parentColumn = nextLanes.indexOf(null)
      if (parentColumn === -1) {
        parentColumn = nextLanes.length
        nextLanes.push(parent)
        nextColors.push(nextColor++)
      } else {
        nextLanes[parentColumn] = parent
        nextColors[parentColumn] = nextColor++
      }
    })

    const lines: GraphLine[] = []
    const seen = new Set<string>()
    const addLine = (from: number, to: number, color: number) => {
      const key = `${from}->${to}:${color}`
      if (seen.has(key)) return
      seen.add(key)
      lines.push({ from, to, color })
    }

    for (const parent of commit.parents) {
      const to = nextLanes.indexOf(parent)
      if (to !== -1) addLine(column, to, nextColors[to] ?? myColor)
    }

    for (let i = 0; i < Math.max(lanes.length, nextLanes.length); i++) {
      if (i === column) continue
      const hash = lanes[i]
      if (!hash) continue
      const to = nextLanes.indexOf(hash)
      if (to !== -1) addLine(i, to, colors[i] ?? 0)
    }

    rows.push({ commit, column, color: myColor, lines })
    lanes.splice(0, lanes.length, ...nextLanes)
    colors.splice(0, colors.length, ...nextColors)
  }

  return rows
}

export function laneCount(rows: GraphRow[]): number {
  return (
    rows.reduce((max, row) => {
      const fromLines = row.lines.reduce((m, line) => Math.max(m, line.from, line.to), 0)
      return Math.max(max, row.column, fromLines)
    }, 0) + 1
  )
}

export function renderGlyph(row: GraphRow, lanes: number): string {
  const cells = Array.from({ length: Math.max(lanes, 1) }, () => " ")
  for (const line of row.lines) {
    if (line.from === line.to && line.from < cells.length) {
      cells[line.from] = "│"
    } else if (line.from < line.to) {
      if (line.from < cells.length) cells[line.from] = "╲"
      if (line.to < cells.length && cells[line.to] === " ") cells[line.to] = "│"
    } else if (line.to < cells.length) {
      if (line.from < cells.length) cells[line.from] = "╱"
      if (cells[line.to] === " ") cells[line.to] = "│"
    }
  }
  if (row.column < cells.length) cells[row.column] = "●"
  return cells.join("")
}
