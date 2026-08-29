export type Locale = "zh-Hant" | "zh-Hans" | "en"
export type Theme = "dark" | "light" | "system"
export type Density = "comfortable" | "compact"

export type AppSettings = {
  locale: Locale
  theme: Theme
  density: Density
}

const KEY = "ogg:settings"

const defaults: AppSettings = {
  locale: "zh-Hant",
  theme: "dark",
  density: "comfortable",
}

export function readSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return { ...defaults }
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      locale: parsed.locale === "en" || parsed.locale === "zh-Hans" || parsed.locale === "zh-Hant" ? parsed.locale : defaults.locale,
      theme: parsed.theme === "light" || parsed.theme === "system" || parsed.theme === "dark" ? parsed.theme : defaults.theme,
      density: parsed.density === "compact" || parsed.density === "comfortable" ? parsed.density : defaults.density,
    }
  } catch {
    return { ...defaults }
  }
}

export function writeSettings(next: AppSettings): AppSettings {
  window.localStorage.setItem(KEY, JSON.stringify(next))
  applySettings(next)
  return next
}

export function resolvedTheme(theme: Theme): "dark" | "light" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"
  }
  return theme
}

export function applySettings(settings: AppSettings): void {
  const theme = resolvedTheme(settings.theme)
  document.documentElement.dataset.theme = theme
  document.documentElement.dataset.density = settings.density
  document.documentElement.lang = settings.locale
}
