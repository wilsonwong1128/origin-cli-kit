import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { SafetyDialog } from "../../src/SafetyDialog"
import { translate } from "../../src/i18n"

const t = (key: Parameters<typeof translate>[1]) => translate("en", key)

describe("SafetyDialog", () => {
  it("labels each safety level and confirms immediately when no word is required", async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const { rerender } = render(
      <SafetyDialog
        title="Pull"
        body="fast-forward only"
        level="destructive"
        t={t}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    )
    expect(screen.getByText("Destructive")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Confirm" }))
    expect(onConfirm).toHaveBeenCalledOnce()

    rerender(
      <SafetyDialog title="Push" body="no force" level="reversible" t={t} onCancel={onCancel} onConfirm={onConfirm} />,
    )
    expect(screen.getByText("Reversible")).toBeInTheDocument()

    rerender(
      <SafetyDialog title="Fetch" body="safe" level="info" t={t} onCancel={onCancel} onConfirm={onConfirm} />,
    )
    expect(screen.getByText("Low risk")).toBeInTheDocument()
  })

  it("keeps Confirm disabled until the typed word matches, then cancel does not confirm", async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <SafetyDialog
        title="Discard"
        body="cannot be undone"
        level="irreversible"
        confirmWord="DISCARD"
        t={t}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    )
    expect(screen.getByText("Irreversible")).toBeInTheDocument()
    const confirm = screen.getByRole("button", { name: "Confirm" })
    expect(confirm).toBeDisabled()
    await user.type(screen.getByRole("textbox"), "discard")
    expect(confirm).toBeDisabled()
    await user.clear(screen.getByRole("textbox"))
    await user.type(screen.getByRole("textbox"), "DISCARD")
    expect(confirm).toBeEnabled()
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
