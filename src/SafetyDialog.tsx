import { useState } from "react"

import type { SafetyLevel } from "../shared/safety"
import type { MessageKey } from "./i18n"

export function SafetyDialog({
  title,
  body,
  level,
  confirmWord,
  t,
  onCancel,
  onConfirm,
}: {
  title: string
  body: string
  level: SafetyLevel
  confirmWord?: string
  t: (key: MessageKey) => string
  onCancel: () => void
  onConfirm: () => void
}) {
  const [typed, setTyped] = useState("")
  const ready = !confirmWord || typed === confirmWord
  const risk =
    level === "info"
      ? t("riskInfo")
      : level === "reversible"
        ? t("riskReversible")
        : level === "irreversible"
          ? t("riskIrreversible")
          : t("riskDestructive")

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal safety" onClick={(event) => event.stopPropagation()}>
        <p className={`risk ${level}`}>{risk}</p>
        <h2>{title}</h2>
        <p>{body}</p>
        {confirmWord && (
          <label className="field">
            <span>
              {t("typeToConfirm")}: <code>{confirmWord}</code>
            </span>
            <input value={typed} onChange={(event) => setTyped(event.target.value)} autoFocus />
          </label>
        )}
        <div className="actions">
          <button type="button" className="danger" disabled={!ready} onClick={onConfirm}>
            {t("confirm")}
          </button>
          <button type="button" className="ghost-btn" onClick={onCancel}>
            {t("cancel")}
          </button>
        </div>
      </div>
    </div>
  )
}
