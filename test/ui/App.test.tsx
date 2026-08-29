import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { App } from "../../src/App"
import { createDesktopMock, installDesktopMock } from "../harness/desktop-mock"

async function renderApp() {
  const desktop = createDesktopMock()
  installDesktopMock(desktop)
  render(<App />)
  expect(await screen.findByText("Signed out")).toBeInTheDocument()
  return desktop
}

describe("App (IPC mocked)", () => {
  it("starts signed out with no Origin CLI session and shows the welcome pane", async () => {
    await renderApp()
    expect(screen.getByRole("button", { name: "Log in to Origin" })).toBeEnabled()
    expect(screen.getByText("One install. One window.")).toBeInTheDocument()
    expect(screen.getByText("No repository open")).toBeInTheDocument()
    expect(screen.queryByText("Switch repo")).not.toBeInTheDocument()
  })

  it("creates a new project through the mocked desktop API and then switches repo", async () => {
    const user = userEvent.setup()
    const desktop = await renderApp()

    await user.click(screen.getByRole("button", { name: "Pick a local or Origin repo" }))
    await user.click(screen.getByRole("button", { name: "New project" }))
    await user.type(screen.getByPlaceholderText("my-app"), "ogg-alpha")
    const dialogs = screen.getAllByRole("button", { name: "New project" })
    await user.click(dialogs[dialogs.length - 1]!)

    expect(desktop.calls.createOriginRepo).toEqual([["ogg-alpha", "/tmp/ogg-parent"]])
    expect(await screen.findByText("ogg-alpha")).toBeInTheDocument()
    expect(screen.getByText("wilsonwong/ogg-test-alpha")).toBeInTheDocument()
    expect(screen.getByText(/Colored lines are branches/)).toBeInTheDocument()
    expect(document.querySelectorAll("svg path").length).toBeGreaterThan(1)
    expect(new Set([...document.querySelectorAll("svg path")].map((node) => node.getAttribute("stroke"))).size).toBeGreaterThan(1)
  })

  it("switches to a second mocked repo from recents", async () => {
    const user = userEvent.setup()
    const desktop = createDesktopMock()
    desktop.openFolder = async () => "/tmp/ogg-alpha"
    installDesktopMock(desktop)
    render(<App />)
    await screen.findByText("Signed out")

    await user.click(screen.getByRole("button", { name: "Pick a local or Origin repo" }))
    await user.click(screen.getByRole("button", { name: "Open folder" }))
    expect(await screen.findByText("ogg-alpha")).toBeInTheDocument()

    desktop.openFolder = async () => "/tmp/ogg-beta"
    await user.click(screen.getByRole("button", { name: "Switch repo" }))
    await user.click(screen.getByRole("button", { name: "Open folder" }))
    expect(await screen.findByText("ogg-beta")).toBeInTheDocument()
    expect(screen.getByText("wilsonwong/ogg-test-beta")).toBeInTheDocument()
  })

  it("opens a draft PR, marks it ready, and merges through the safety dialog", async () => {
    const user = userEvent.setup()
    const desktop = createDesktopMock()
    desktop.openFolder = async () => "/tmp/ogg-alpha"
    installDesktopMock(desktop)
    render(<App />)
    await screen.findByText("Signed out")
    await user.click(screen.getByRole("button", { name: "Pick a local or Origin repo" }))
    await user.click(screen.getByRole("button", { name: "Open folder" }))
    await screen.findByText("ogg-alpha")

    await user.click(screen.getByRole("button", { name: "Pull requests" }))
    await user.type(screen.getByPlaceholderText("Title"), "Color the graph")
    await user.click(screen.getByRole("button", { name: "Create PR" }))
    expect(desktop.calls.createPullRequest[0]?.[1]).toMatchObject({ title: "Color the graph", draft: true })
    expect(await screen.findByText(/#1 Color the graph/)).toBeInTheDocument()
    expect(screen.getByText(/draft/i)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Mark ready" }))
    expect(desktop.calls.markReady).toEqual([1])
    await user.click(screen.getByRole("button", { name: "Pull requests" }))
    expect(await screen.findByRole("button", { name: "Merge PR" })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Merge PR" }))
    const safety = screen.getByText("Destructive").closest(".modal")
    expect(safety).toBeTruthy()
    await user.click(within(safety as HTMLElement).getByRole("button", { name: "Confirm" }))
    expect(desktop.calls.mergePr).toEqual([1])
  })
})
