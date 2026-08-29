import type { GraphRow } from "../shared/types"

const LANE = ["#60a5fa", "#34d399", "#fbbf24", "#c084fc", "#f472b6", "#22d3ee", "#fb923c", "#818cf8"]
const ROW = 52
const COL = 16
const PAD_X = 14
const MID = ROW / 2

export function laneColor(index: number): string {
  return LANE[index % LANE.length] ?? LANE[0]
}

function formatTime(iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function linePath(from: number, to: number, y0: number, y1: number): string {
  const x1 = PAD_X + from * COL
  const x2 = PAD_X + to * COL
  if (x1 === x2) {
    return `M ${x1} ${y0} L ${x2} ${y1}`
  }
  const mid = (y0 + y1) / 2
  return `M ${x1} ${y0} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y1}`
}

export function CommitGraph({
  rows,
  laneCount,
  selected,
  dimmed,
  locale,
  onSelect,
}: {
  rows: GraphRow[]
  laneCount: number
  selected: string | null
  dimmed: Set<string>
  locale: string
  onSelect: (hash: string) => void
}) {
  const width = Math.max(72, PAD_X * 2 + laneCount * COL)
  const height = rows.length * ROW

  return (
    <div className="graph">
      <div className="graph-stack" style={{ minHeight: height }}>
        <svg className="graph-svg" width={width} height={height} aria-hidden="true">
          {rows.map((row, index) => {
            const y0 = index * ROW + MID
            const y1 = Math.min((index + 1) * ROW + MID, height)
            return row.lines.map((line, lineIndex) => (
              <path
                key={`${row.commit.hash}-${lineIndex}-${line.from}-${line.to}`}
                d={linePath(line.from, line.to, y0, y1)}
                fill="none"
                stroke={laneColor(line.color)}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))
          })}
          {rows.map((row, index) => {
            const active = selected === row.commit.hash
            return (
              <circle
                key={`node-${row.commit.hash}`}
                cx={PAD_X + row.column * COL}
                cy={index * ROW + MID}
                r={active ? 6 : 5}
                fill={laneColor(row.color)}
                stroke={active ? "#fff" : "transparent"}
                strokeWidth="1.5"
              />
            )
          })}
        </svg>
        <div className="graph-rows">
          {rows.map((row) => {
            const active = selected === row.commit.hash
            const faded = dimmed.has(row.commit.hash)
            return (
              <button
                key={row.commit.hash}
                type="button"
                className={`commit ${active ? "active" : ""} ${faded ? "dim" : ""}`}
                style={{ height: ROW, paddingLeft: width + 10 }}
                onClick={() => onSelect(row.commit.hash)}
              >
                <span className="meta">
                  <span className="subject">
                    {row.commit.refs.map((ref) => (
                      <em key={ref}>{ref.replace(/^tag: /, "tag ")}</em>
                    ))}
                    {row.commit.subject}
                  </span>
                  <span className="sub">
                    {row.commit.author} · {formatTime(row.commit.date, locale)} · {row.commit.shortHash}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
