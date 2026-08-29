import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { laneColor } from "../../src/CommitGraph"
import { CommitGraph } from "../../src/CommitGraph"
import { sampleGraph } from "../fixtures/graph"

describe("CommitGraph", () => {
  it("paints branch / merge connectors with the lane palette", () => {
    const graph = sampleGraph()
    const { container } = render(
      <CommitGraph
        rows={graph.rows}
        laneCount={graph.laneCount}
        selected={graph.rows[0]!.commit.hash}
        dimmed={new Set()}
        locale="en"
        onSelect={() => undefined}
      />,
    )
    const strokes = [...container.querySelectorAll("svg path")].map((node) => node.getAttribute("stroke"))
    expect(strokes.length).toBeGreaterThan(1)
    expect(new Set(strokes).size).toBeGreaterThan(1)
    for (const stroke of strokes) {
      expect(stroke && /^#[0-9a-f]{6}$/i.test(stroke)).toBe(true)
    }
    expect(strokes).toContain(laneColor(0))
    expect(container.querySelectorAll("svg circle").length).toBe(graph.rows.length)
    expect(screen.getByText("merge: graph colors")).toBeInTheDocument()
    expect(screen.getByText(/HEAD → main/)).toBeInTheDocument()
  })

  it("selects a row and dims hashes that are not in the search hit set", async () => {
    const user = userEvent.setup()
    const graph = sampleGraph()
    const onSelect = vi.fn()
    const faded = graph.rows[1]!.commit.hash
    render(
      <CommitGraph
        rows={graph.rows}
        laneCount={graph.laneCount}
        selected={graph.rows[0]!.commit.hash}
        dimmed={new Set([faded])}
        locale="en"
        onSelect={onSelect}
      />,
    )
    const dimmed = screen.getByRole("button", { name: /feat: color lines/ })
    expect(dimmed.className).toMatch(/\bdim\b/)
    await user.click(dimmed)
    expect(onSelect).toHaveBeenCalledWith(faded)
  })
})
