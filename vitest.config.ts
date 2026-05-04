import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      reporter: ["text", "json", "json-summary", "lcov"],
      reportOnFailure: true,
      exclude: ["**/*.test*.ts", "**/*.config.*"],
    },
    reporters: ["verbose", "junit"],
    outputFile: {
      junit: "test-report.junit.xml",
    },
  },
});
