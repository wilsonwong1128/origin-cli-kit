import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["test/unit/**/*.test.ts"],
          environment: "node",
          clearMocks: true,
        },
      },
      {
        plugins: [react()],
        test: {
          name: "ui",
          include: ["test/ui/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["test/ui/setup.ts"],
          clearMocks: true,
        },
      },
      {
        test: {
          name: "live",
          include: ["test/live/**/*.spec.ts"],
          environment: "node",
          testTimeout: 180_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
})
