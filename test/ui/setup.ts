import "@testing-library/jest-dom/vitest"
import { beforeEach } from "vitest"

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem(
    "ogg:settings",
    JSON.stringify({ locale: "en", theme: "dark", density: "comfortable" }),
  )
})
